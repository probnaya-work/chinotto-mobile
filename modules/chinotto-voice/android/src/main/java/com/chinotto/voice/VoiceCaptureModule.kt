package com.chinotto.voice

import android.Manifest
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.SpeechRecognizer
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.sqrt

/**
 * Voice capture on Android: the same contract as the iPhone's `VoiceCaptureModule`, from
 * JavaScript's side (`src/features/voiceCapture`).
 *
 * **The audio is the canonical material; the transcript is derived from it.** One
 * `AudioRecord` feeds both the kept m4a and — when allowed — the recogniser, so a recording
 * exists from the first buffer, before recognition can succeed or fail, and every exit path
 * reports it.
 *
 * **Words come from a recogniser that cannot reach the network, or not at all.** Recognisers
 * are only ever obtained from `OnDeviceGate`, which checks the rules in `OnDevicePolicy` on
 * the phone. When any check fails — Android below 13, no on-device service, a service that
 * could use the network, a language not installed — the recording is made and kept, reported
 * as `unavailable`, and `record/transcripts.ts` reads it back later if that changes.
 *
 * The microphone is the only permission. It is asked for when somebody first holds the
 * circle, never before, and never by a background retry.
 *
 * All state lives on the main thread. The recording thread only reads, writes the file and
 * hands audio on.
 */
class VoiceCaptureModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private val io = Executors.newSingleThreadExecutor()
  private var capture: Capture? = null
  private var fileJob: FileJob? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ChinottoVoiceCapture")

    Events(STATE_EVENT, PARTIAL_EVENT, FINAL_EVENT, ERROR_EVENT)

    AsyncFunction("start") { options: Map<String, Any?>, promise: Promise ->
      main.post { start(options, promise) }
    }

    Function("stop") {
      main.post { capture?.finish("manual") }
    }

    AsyncFunction("transcribeFile") { relativePath: String, promise: Promise ->
      main.post { transcribeFile(relativePath, promise) }
    }

    AsyncFunction("localRecognitionStatus") { promise: Promise ->
      main.post { localRecognitionStatus(promise) }
    }

    OnActivityEntersBackground {
      main.post { capture?.finish("background") }
    }

    OnDestroy {
      main.post {
        capture?.finish("destroyed")
        fileJob?.cancel()
      }
    }
  }

  // MARK: - Permissions

  private fun microphoneStatus(done: (PermissionsStatus) -> Unit) {
    val permissions = appContext.permissions ?: return done(PermissionsStatus.DENIED)
    permissions.getPermissions(
      PermissionsResponseListener { result ->
        val status = result[Manifest.permission.RECORD_AUDIO]?.status ?: PermissionsStatus.DENIED
        main.post { done(status) }
      },
      Manifest.permission.RECORD_AUDIO,
    )
  }

  private fun askMicrophone(done: (Boolean) -> Unit) {
    val permissions = appContext.permissions ?: return done(false)
    permissions.askForPermissions(
      PermissionsResponseListener { result ->
        val granted = result[Manifest.permission.RECORD_AUDIO]?.status == PermissionsStatus.GRANTED
        main.post { done(granted) }
      },
      Manifest.permission.RECORD_AUDIO,
    )
  }

  // MARK: - Capture

  private fun start(options: Map<String, Any?>, promise: Promise) {
    if (capture != null) {
      promise.resolve(null)
      return
    }
    askMicrophone { granted ->
      if (!granted) {
        val message = "Microphone access is not authorized."
        promise.reject("E_VOICE_PERMISSION", message, null)
        sendEvent(ERROR_EVENT, mapOf("code" to "permission_denied", "message" to message))
        return@askMicrophone
      }
      if (capture != null) {
        promise.resolve(null)
        return@askMicrophone
      }
      // Somebody speaking outranks a background read-back; that recording keeps waiting.
      fileJob?.cancel()
      val c = Capture(options["audioFileName"] as? String)
      capture = c
      c.begin(promise)
    }
  }

  private inner class Capture(private val audioFileName: String?) {
    private var record: AudioRecord? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    @Volatile private var writer: AacFileWriter? = null
    private var audioFailure: String? = null
    private var audioPath: String? = null

    /** What recognition did — reported with the final event. See `NativeVoiceCapture.ts`. */
    private var recognition = "unavailable"
    private var language: String? = null
    private var recognizer: SpeechRecognizer? = null
    private var session: RecognitionSession? = null
    private var restarts = 0
    private val heard = StringBuilder()

    /** Audio held until the gate has answered, so the first words are not lost to the check. */
    private val prerollLock = Any()
    private var preroll: MutableList<ByteArray>? = mutableListOf()
    private var prerollBytes = 0
    private var prerollOverflowed = false
    @Volatile private var feed: PcmFeed? = null

    private var finishing = false
    private var reason = "manual"
    private var audioClosed = false
    private var recognitionDone = false
    private var gateAnswered = false
    private var result: Pair<String, Long>? = null

    @Volatile private var heardSpeech = false
    @Volatile private var idleReported = false
    private val maxDuration = Runnable { finish("max_duration") }
    private var silentMs = 0L
    private var recordedMs = 0L
    private var focus: AudioFocusRequest? = null
    private var recordingCallback: AudioManager.AudioRecordingCallback? = null

    fun begin(promise: Promise) {
      val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      val ar = try {
        AudioRecord(
          MediaRecorder.AudioSource.VOICE_RECOGNITION,
          SAMPLE_RATE,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
          maxOf(minBuffer, CHUNK_BYTES * 8),
        )
      } catch (e: SecurityException) {
        fail(promise, "permission_denied", e.message ?: "Microphone access is not authorized.")
        return
      } catch (e: Exception) {
        fail(promise, "start_failed", e.message ?: "Could not open the microphone.")
        return
      }
      if (ar.state != AudioRecord.STATE_INITIALIZED) {
        ar.release()
        fail(promise, "start_failed", "Could not open the microphone.")
        return
      }
      record = ar

      // Opened BEFORE anything is recognised. A file that cannot be opened is reported and
      // does not stop the capture.
      if (audioFileName != null) {
        if (!OnDevicePolicy.isRetainedAudioPath(audioFileName)) {
          audioFailure = "not a recording path"
        } else {
          try {
            writer = AacFileWriter(File(context.filesDir, audioFileName), SAMPLE_RATE)
            audioPath = audioFileName
          } catch (e: Exception) {
            audioFailure = e.message ?: e.javaClass.simpleName
          }
        }
      }

      try {
        ar.startRecording()
      } catch (e: Exception) {
        tearDown()
        fail(promise, "start_failed", e.message ?: "Could not start recording.")
        return
      }
      if (ar.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        tearDown()
        fail(promise, "start_failed", "The microphone is in use.")
        return
      }

      requestFocus()
      watchForSilencing(ar.audioSessionId)
      running = true
      thread = Thread({ readLoop(ar) }, "chinotto-voice-record").also { it.start() }

      sendEvent(STATE_EVENT, mapOf("state" to "listening"))
      promise.resolve(null)

      main.postDelayed(maxDuration, MAX_DURATION_MS)

      OnDeviceGate(context).open(Locale.getDefault()) { verdict -> onGate(verdict) }
    }

    private fun fail(promise: Promise, code: String, message: String) {
      capture = null
      promise.reject("E_VOICE_CAPTURE", message, null)
      sendEvent(ERROR_EVENT, mapOf("code" to code, "message" to message))
    }

    // Recording thread.
    private fun readLoop(ar: AudioRecord) {
      val buffer = ByteArray(CHUNK_BYTES)
      while (running) {
        val n = ar.read(buffer, 0, buffer.size)
        if (n <= 0) {
          if (n < 0) break
          continue
        }
        // The recording first, and unconditionally.
        writer?.write(buffer, n)
        handOn(buffer, n)
        val chunkMs = n * 1000L / (SAMPLE_RATE * 2)
        if (rms(buffer, n) >= SPEECH_RMS) {
          heardSpeech = true
          silentMs = 0
        } else if (!heardSpeech) {
          silentMs += chunkMs
          if (silentMs >= IDLE_NO_SPEECH_MS && !idleReported) {
            idleReported = true
            main.post { finish("idle") }
          }
        }
        recordedMs += chunkMs
      }
    }

    private fun handOn(pcm: ByteArray, n: Int) {
      val f = feed
      if (f != null) {
        f.offer(pcm, n)
        return
      }
      synchronized(prerollLock) {
        val held = preroll ?: return
        if (prerollBytes + n > PREROLL_MAX_BYTES) {
          prerollOverflowed = true
          preroll = null
          return
        }
        held.add(pcm.copyOf(n))
        prerollBytes += n
      }
    }

    private fun onGate(verdict: OnDeviceGate.Verdict) {
      gateAnswered = true
      if (verdict !is OnDeviceGate.Verdict.Ready) {
        synchronized(prerollLock) { preroll = null }
        markRecognitionDone()
        return
      }
      if (capture !== this || (finishing && !audioCaptured())) {
        verdict.recognizer.destroy()
        synchronized(prerollLock) { preroll = null }
        markRecognitionDone()
        return
      }
      recognizer = verdict.recognizer
      language = verdict.language
      recognition = "on_device"
      startSession(flushPreroll = true)
      if (finishing) {
        // Stopped while the gate was checking: read what was held, then finish.
        session?.finishAudio()
        main.postDelayed({ session?.cancel() }, FINAL_RESULT_WAIT_MS)
      }
    }

    /** True while every buffer so far is still held for the recogniser. */
    private fun audioCaptured(): Boolean = synchronized(prerollLock) { !prerollOverflowed }

    private fun startSession(flushPreroll: Boolean) {
      val rec = recognizer ?: return
      val lang = language ?: return
      val s = RecognitionSession(rec, lang, SAMPLE_RATE, partials = true, listener = object : RecognitionSession.Listener {
        override fun onText(text: String) {
          if (text.isNotBlank()) heardSpeech = true
          sendEvent(PARTIAL_EVENT, mapOf("text" to join(heard.toString(), text)))
        }

        override fun onEnded(heard: String, error: Int?) = onSessionEnded(heard, error)
      })
      session = s
      val pcm = try {
        s.start()
      } catch (_: Exception) {
        session = null
        recognition = "failed"
        releaseRecognizer()
        synchronized(prerollLock) { preroll = null }
        markRecognitionDone()
        return
      }
      synchronized(prerollLock) {
        if (flushPreroll) {
          if (prerollOverflowed) recognition = "failed" // it would have missed the beginning
          preroll?.forEach { pcm.offer(it, it.size) }
        }
        preroll = null
        feed = pcm
      }
    }

    private fun onSessionEnded(text: String, error: Int?) {
      session = null
      feed = null
      if (text.isNotBlank()) {
        if (heard.isNotEmpty()) heard.append(' ')
        heard.append(text.trim())
      }
      val noSpeech = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
      if (error != null && !noSpeech) recognition = "failed"

      // A recogniser that stops at a pause is started again on the audio that follows, as
      // the iPhone restarts its task. One that broke is not: the recording carries on alone.
      if (!finishing && recognition == "on_device" && restarts < MAX_RESTARTS) {
        restarts += 1
        startSession(flushPreroll = false)
        return
      }
      releaseRecognizer()
      markRecognitionDone()
    }

    fun finish(why: String) {
      if (finishing || capture !== this) return
      finishing = true
      reason = why
      running = false
      main.removeCallbacks(maxDuration)
      try { record?.stop() } catch (_: Exception) {}
      val t = thread
      val w = writer
      io.execute {
        t?.join(1_000)
        val kept = w?.close() == true
        val failure = w?.failure
        val duration = w?.durationMs ?: 0
        main.post {
          if (failure != null && audioFailure == null) audioFailure = failure
          result = if (kept) Pair(audioPath!!, duration) else null
          audioClosed = true
          record?.release()
          record = null
          complete()
        }
      }

      val s = session
      if (s != null) {
        s.finishAudio()
        // A recogniser that never answers must not hold the recording hostage.
        main.postDelayed({ session?.cancel() }, FINAL_RESULT_WAIT_MS)
      } else if (!gateAnswered) {
        // The gate is still checking. Its answer decides whether this recording gets words.
        main.postDelayed({ if (!gateAnswered) { gateAnswered = true; markRecognitionDone() } }, GATE_WAIT_MS)
      } else {
        markRecognitionDone()
      }
    }

    private fun markRecognitionDone() {
      if (recognitionDone) return
      recognitionDone = true
      complete()
    }

    private fun complete() {
      if (!audioClosed || !recognitionDone || capture !== this) return
      releaseRecognizer()
      releaseFocus()
      stopWatching()
      capture = null
      val payload = mutableMapOf<String, Any?>(
        "text" to heard.toString().trim(),
        "reason" to reason,
        "recognition" to recognition,
      )
      result?.let { (path, ms) ->
        payload["audioPath"] = path
        payload["durationMs"] = ms.toDouble()
      }
      audioFailure?.let { payload["audioFailure"] = it }
      sendEvent(FINAL_EVENT, payload)
      sendEvent(STATE_EVENT, mapOf("state" to "idle"))
    }

    private fun tearDown() {
      running = false
      try { writer?.close() } catch (_: Exception) {}
      writer = null
      record?.release()
      record = null
      releaseFocus()
      stopWatching()
    }

    private fun releaseRecognizer() {
      session?.cancel()
      session = null
      try { recognizer?.destroy() } catch (_: Exception) {}
      recognizer = null
    }

    private fun requestFocus() {
      val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        .build()
      if (am.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) focus = request
    }

    private fun releaseFocus() {
      val request = focus ?: return
      (context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.abandonAudioFocusRequest(request)
      focus = null
    }

    /**
     * If anything takes the microphone from us mid-recording — a call, or a recogniser that
     * ignored our audio and opened the microphone itself — Android silences our capture. The
     * recording matters more than the words, so the recogniser is let go and the capture
     * carries on as soon as the microphone comes back.
     */
    private fun watchForSilencing(sessionId: Int) {
      val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
      val callback = object : AudioManager.AudioRecordingCallback() {
        override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
          val ours = configs.firstOrNull { it.clientAudioSessionId == sessionId } ?: return
          if (ours.isClientSilenced && session != null) {
            recognition = "failed"
            releaseRecognizer()
          }
        }
      }
      am.registerAudioRecordingCallback(callback, main)
      recordingCallback = callback
    }

    private fun stopWatching() {
      val callback = recordingCallback ?: return
      (context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.unregisterAudioRecordingCallback(callback)
      recordingCallback = null
    }
  }

  // MARK: - Reading a kept recording back

  private fun localRecognitionStatus(promise: Promise) {
    microphoneStatus { status ->
      when (status) {
        PermissionsStatus.UNDETERMINED -> promise.resolve("not_determined")
        PermissionsStatus.DENIED -> promise.resolve("denied")
        else -> {
          val gate = OnDeviceGate(context)
          gate.open(Locale.getDefault()) { verdict ->
            if (verdict is OnDeviceGate.Verdict.Ready) {
              verdict.recognizer.destroy()
              promise.resolve("available")
            } else {
              promise.resolve("unavailable")
            }
          }
        }
      }
    }
  }

  /**
   * Reads a kept recording back as words, on this phone only. Resolves `{ status, text? }`:
   * `ok` · `no_speech` · `unavailable` · `denied` · `failed` · `busy` · `missing`. Never asks
   * for a permission.
   */
  private fun transcribeFile(relativePath: String, promise: Promise) {
    fun answer(status: String, text: String? = null) {
      promise.resolve(if (text != null) mapOf("status" to status, "text" to text) else mapOf("status" to status))
    }
    if (capture != null || fileJob != null) return answer("busy")
    if (!OnDevicePolicy.isRetainedAudioPath(relativePath)) return answer("missing")
    val file = File(context.filesDir, relativePath)
    if (!file.isFile) return answer("missing")

    microphoneStatus { status ->
      if (status != PermissionsStatus.GRANTED) return@microphoneStatus answer("denied")
      OnDeviceGate(context).open(Locale.getDefault()) { verdict ->
        if (verdict !is OnDeviceGate.Verdict.Ready) return@open answer("unavailable")
        if (capture != null || fileJob != null) {
          verdict.recognizer.destroy()
          return@open answer("busy")
        }
        val reader = AacFileReader.open(file)
        if (reader == null) {
          verdict.recognizer.destroy()
          return@open answer("failed")
        }
        val job = FileJob(verdict, reader) { status2, text ->
          fileJob = null
          answer(status2, text)
        }
        fileJob = job
        job.run()
      }
    }
  }

  private inner class FileJob(
    private val verdict: OnDeviceGate.Verdict.Ready,
    private val reader: AacFileReader,
    private val done: (String, String?) -> Unit,
  ) {
    private var settled = false
    private var session: RecognitionSession? = null
    @Volatile private var decodeFailed = false

    fun run() {
      val s = RecognitionSession(verdict.recognizer, verdict.language, reader.sampleRate, partials = false,
        listener = object : RecognitionSession.Listener {
          override fun onText(text: String) {}
          override fun onEnded(heard: String, error: Int?) {
            val noSpeech = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
            when {
              decodeFailed -> settle("failed")
              error == null || noSpeech -> if (heard.isBlank()) settle("no_speech") else settle("ok", heard.trim())
              else -> settle("failed")
            }
          }
        })
      session = s
      val pcm = try { s.start() } catch (_: Exception) { return settle("failed") }
      io.execute {
        val ok = reader.decode { chunk, n -> !settled && pcm.put(chunk, n) }
        if (!ok) decodeFailed = true
        pcm.end()
      }
      watchMicrophone()
      main.postDelayed({ settle("failed") }, FILE_TIMEOUT_MS)
    }

    /**
     * Nothing may be recording while a file is read back. If anything is — another app, or
     * a recogniser that ignored the file and opened the microphone — whatever it heard is not
     * this recording's words. The result is thrown away and the recording keeps waiting.
     */
    private fun watchMicrophone() {
      if (settled) return
      val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      if (am != null && am.activeRecordingConfigurations.isNotEmpty()) {
        settle("busy")
        return
      }
      main.postDelayed({ watchMicrophone() }, 250)
    }

    fun cancel() = settle("busy")

    private fun settle(status: String, text: String? = null) {
      if (settled) return
      settled = true
      session?.cancel()
      session = null
      try { verdict.recognizer.destroy() } catch (_: Exception) {}
      done(status, text)
    }
  }

  companion object {
    const val STATE_EVENT = "VoiceCaptureState"
    const val PARTIAL_EVENT = "VoiceCapturePartial"
    const val FINAL_EVENT = "VoiceCaptureFinal"
    const val ERROR_EVENT = "VoiceCaptureError"

    /** What the recogniser is fed and the recording is encoded from: 16 kHz mono 16-bit. */
    const val SAMPLE_RATE = 16_000
    /** 20 ms of audio. */
    const val CHUNK_BYTES = SAMPLE_RATE * 2 / 50

    /** The iPhone's limits, kept the same. */
    const val MAX_DURATION_MS = 300_000L
    const val IDLE_NO_SPEECH_MS = 45_000L
    const val MAX_RESTARTS = 48
    const val SPEECH_RMS = 0.022

    const val PREROLL_MAX_BYTES = SAMPLE_RATE * 2 * 10
    const val FINAL_RESULT_WAIT_MS = 2_500L
    const val GATE_WAIT_MS = 8_000L
    const val FILE_TIMEOUT_MS = 120_000L

    fun join(a: String, b: String): String {
      val x = a.trim()
      val y = b.trim()
      return when {
        x.isEmpty() -> y
        y.isEmpty() -> x
        else -> "$x $y"
      }
    }

    fun rms(pcm: ByteArray, n: Int): Double {
      val samples = n / 2
      if (samples == 0) return 0.0
      var sum = 0.0
      for (i in 0 until samples) {
        val s = ((pcm[2 * i].toInt() and 0xff) or (pcm[2 * i + 1].toInt() shl 8)).toShort() / 32768.0
        sum += s * s
      }
      return sqrt(sum / samples)
    }
  }
}
