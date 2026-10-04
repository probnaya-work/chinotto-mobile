package com.chinotto.voice

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File

/**
 * A kept recording, decoded back to 16-bit mono PCM for the recogniser. Never plays it.
 *
 * `open` reads the header only (cheap, any thread); `decode` does the work and is meant for
 * a background thread.
 */
internal class AacFileReader private constructor(
  private val extractor: MediaExtractor,
  private val format: MediaFormat,
) {
  val sampleRate: Int = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
  private val channels: Int = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

  /**
   * Decodes the whole file, handing each mono PCM chunk to `sink`. Stops early when `sink`
   * returns false. Returns false if decoding failed.
   */
  fun decode(sink: (ByteArray, Int) -> Boolean): Boolean {
    val mime = format.getString(MediaFormat.KEY_MIME) ?: return false
    val codec = try { MediaCodec.createDecoderByType(mime) } catch (_: Exception) { return false }
    val info = MediaCodec.BufferInfo()
    var ok = true
    try {
      codec.configure(format, null, null, 0)
      codec.start()
      var inputDone = false
      var outputDone = false
      while (!outputDone) {
        if (!inputDone) {
          val index = codec.dequeueInputBuffer(10_000)
          if (index >= 0) {
            val buffer = codec.getInputBuffer(index)!!
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
              codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }
        val out = codec.dequeueOutputBuffer(info, 10_000)
        if (out >= 0) {
          val buffer = codec.getOutputBuffer(out)
          if (buffer != null && info.size > 0) {
            buffer.position(info.offset)
            buffer.limit(info.offset + info.size)
            val bytes = ByteArray(info.size)
            buffer.get(bytes)
            val mono = if (channels > 1) downmix(bytes, channels) else bytes
            if (!sink(mono, mono.size)) {
              codec.releaseOutputBuffer(out, false)
              break
            }
          }
          codec.releaseOutputBuffer(out, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
        }
      }
    } catch (_: Exception) {
      ok = false
    } finally {
      try { codec.stop() } catch (_: Exception) {}
      codec.release()
      extractor.release()
    }
    return ok
  }

  private fun downmix(interleaved: ByteArray, channels: Int): ByteArray {
    val frames = interleaved.size / (2 * channels)
    val mono = ByteArray(frames * 2)
    for (f in 0 until frames) {
      var sum = 0
      for (c in 0 until channels) {
        val i = (f * channels + c) * 2
        sum += (interleaved[i].toInt() and 0xff) or (interleaved[i + 1].toInt() shl 8)
      }
      val s = sum / channels
      mono[f * 2] = (s and 0xff).toByte()
      mono[f * 2 + 1] = (s shr 8).toByte()
    }
    return mono
  }

  companion object {
    fun open(file: File): AacFileReader? {
      val extractor = MediaExtractor()
      return try {
        extractor.setDataSource(file.absolutePath)
        val track = (0 until extractor.trackCount).firstOrNull {
          extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
        } ?: run { extractor.release(); return null }
        extractor.selectTrack(track)
        AacFileReader(extractor, extractor.getTrackFormat(track))
      } catch (_: Exception) {
        extractor.release()
        null
      }
    }
  }
}
