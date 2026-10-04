package com.chinotto.voice

import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.SpeechRecognizer
import androidx.annotation.RequiresApi

/**
 * One run of an on-device recogniser over audio we supply, from `OnDeviceGate` only.
 *
 * Asks for a segmented session, so the recogniser keeps going until our audio ends. The
 * platform says that request "may have no effect", so a recogniser that ends at the first
 * pause instead is handled as well: its result becomes a committed segment and `onEnded`
 * tells the owner, who may start another session on fresh audio.
 *
 * Main thread only, like `SpeechRecognizer` itself.
 */
@RequiresApi(33)
internal class RecognitionSession(
  private val recognizer: SpeechRecognizer,
  private val language: String,
  private val sampleRate: Int,
  private val partials: Boolean,
  private val listener: Listener,
) {
  interface Listener {
    /** Everything heard so far in this session, committed segments first. */
    fun onText(text: String)
    /**
     * The session is over. `heard` is its full text; `error` is null for a clean end and a
     * `SpeechRecognizer.ERROR_*` otherwise. `ERROR_NO_MATCH` and `ERROR_SPEECH_TIMEOUT` mean
     * the audio held no recognisable speech.
     */
    fun onEnded(heard: String, error: Int?)
  }

  private val committed = StringBuilder()
  private var live = ""
  private var ended = false
  var feed: PcmFeed? = null
    private set

  val text: String get() = compose()

  fun start(): PcmFeed {
    val pcm = PcmFeed("chinotto-recognition-feed")
    feed = pcm
    recognizer.setRecognitionListener(object : RecognitionListener {
      override fun onPartialResults(partialResults: Bundle) {
        live = best(partialResults)
        listener.onText(compose())
      }

      override fun onSegmentResults(segmentResults: Bundle) {
        commit(best(segmentResults))
        live = ""
        listener.onText(compose())
      }

      override fun onEndOfSegmentedSession() = end(null)

      override fun onResults(results: Bundle) {
        commit(best(results))
        live = ""
        end(null)
      }

      override fun onError(error: Int) {
        // Whatever was said before the error is still what was said.
        commit(live)
        live = ""
        end(error)
      }

      override fun onReadyForSpeech(params: Bundle?) {}
      override fun onBeginningOfSpeech() {}
      override fun onRmsChanged(rmsdB: Float) {}
      override fun onBufferReceived(buffer: ByteArray?) {}
      override fun onEndOfSpeech() {}
      override fun onEvent(eventType: Int, params: Bundle?) {}
    })
    recognizer.startListening(
      OnDeviceGate.recognitionIntent(language, pcm.readEnd, sampleRate, partials)
    )
    return pcm
  }

  /** Our audio is over; the recogniser finishes what it has and then ends the session. */
  fun finishAudio() {
    feed?.end()
  }

  /** Ends now, without waiting for the recogniser. */
  fun cancel() {
    if (ended) return
    try { recognizer.cancel() } catch (_: Exception) {}
    commit(live)
    live = ""
    end(SpeechRecognizer.ERROR_CLIENT)
  }

  private fun end(error: Int?) {
    if (ended) return
    ended = true
    feed?.abort()
    feed?.closeReadEnd()
    listener.onEnded(compose(), error)
  }

  private fun commit(segment: String) {
    val s = segment.trim()
    if (s.isEmpty()) return
    if (committed.isNotEmpty()) committed.append(' ')
    committed.append(s)
  }

  private fun compose(): String {
    val l = live.trim()
    return when {
      committed.isEmpty() -> l
      l.isEmpty() -> committed.toString()
      else -> "$committed $l"
    }
  }

  private fun best(bundle: Bundle): String =
    bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
}
