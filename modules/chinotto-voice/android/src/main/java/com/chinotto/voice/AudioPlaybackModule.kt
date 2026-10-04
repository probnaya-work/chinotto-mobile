package com.chinotto.voice

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Hearing a kept recording again: the Android side of `src/features/audioPlayback`.
 *
 * One thing plays at a time; the play mark follows the sound, so finishing is an event; and a
 * recording that is not there says so rather than playing silence. Plays only files in the
 * Record's own audio folder.
 */
class AudioPlaybackModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var playingId: String? = null

  override fun definition() = ModuleDefinition {
    Name("ChinottoAudioPlayback")

    Events(FINISHED_EVENT, ERROR_EVENT)

    AsyncFunction("play") { options: Map<String, Any?>, promise: expo.modules.kotlin.Promise ->
      val id = options["id"] as? String
      val path = options["path"] as? String
      main.post { promise.resolve(if (id != null && path != null) play(id, path) else false) }
    }

    Function("stop") {
      main.post { stop() }
    }

    OnActivityEntersBackground {
      main.post { stop() }
    }

    OnDestroy {
      main.post { release() }
    }
  }

  private fun play(id: String, relativePath: String): Boolean {
    stop()
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    if (!OnDevicePolicy.isRetainedAudioPath(relativePath)) {
      sendEvent(ERROR_EVENT, mapOf("id" to id, "code" to "missing", "message" to "not a recording"))
      return false
    }
    val file = File(context.filesDir, relativePath)
    if (!file.isFile) {
      sendEvent(ERROR_EVENT, mapOf("id" to id, "code" to "missing", "message" to "the recording is not on this phone"))
      return false
    }
    val mp = MediaPlayer()
    return try {
      mp.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      mp.setDataSource(file.absolutePath)
      mp.setOnCompletionListener { main.post { finished(id) } }
      mp.setOnErrorListener { _, what, extra ->
        main.post {
          sendEvent(ERROR_EVENT, mapOf("id" to id, "code" to "playback", "message" to "$what/$extra"))
          finished(id)
        }
        true
      }
      mp.prepare()
      mp.start()
      player = mp
      playingId = id
      true
    } catch (e: Exception) {
      mp.release()
      sendEvent(ERROR_EVENT, mapOf("id" to id, "code" to "playback", "message" to (e.message ?: "")))
      false
    }
  }

  private fun finished(id: String) {
    if (playingId != id) return
    release()
    sendEvent(FINISHED_EVENT, mapOf("id" to id))
  }

  private fun stop() {
    val id = playingId ?: return
    release()
    sendEvent(FINISHED_EVENT, mapOf("id" to id))
  }

  private fun release() {
    try { player?.stop() } catch (_: Exception) {}
    player?.release()
    player = null
    playingId = null
  }

  companion object {
    const val FINISHED_EVENT = "AudioPlaybackFinished"
    const val ERROR_EVENT = "AudioPlaybackError"
  }
}
