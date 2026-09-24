package com.chinotto.voice

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File

/**
 * The kept recording: 16-bit mono PCM in, AAC in an m4a container out — the format the
 * Record already stores, plays and deletes (`record/files.ts`).
 *
 * Called from the recording thread only. A failure part-way stops writing and keeps what is
 * already in the file; it never stops the capture (the same rule as the iPhone's writer).
 */
internal class AacFileWriter(private val file: File, private val sampleRate: Int) {
  private val codec: MediaCodec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
  private val muxer: MediaMuxer
  private val info = MediaCodec.BufferInfo()
  private var track = -1
  private var muxing = false
  private var samplesIn = 0L
  /** Encoded audio frames that actually reached the container. A header alone is not a recording. */
  private var framesMuxed = 0
  private var closed = false

  /** Why writing stopped, if it did. Reported with the final event as `audioFailure`. */
  var failure: String? = null
    private set

  init {
    file.parentFile?.mkdirs()
    muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, 1).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, 48_000)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16_384)
    }
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    codec.start()
  }

  /** Samples that reached the encoder. The duration is derived from this. */
  val durationMs: Long get() = if (sampleRate > 0) samplesIn * 1000 / sampleRate else 0

  fun write(pcm: ByteArray, length: Int) {
    if (closed || failure != null) return
    try {
      var offset = 0
      while (offset < length) {
        val index = codec.dequeueInputBuffer(10_000)
        if (index < 0) {
          drain(false)
          continue
        }
        val input = codec.getInputBuffer(index) ?: continue
        input.clear()
        val chunk = minOf(input.remaining(), length - offset)
        input.put(pcm, offset, chunk)
        val ptsUs = samplesIn * 1_000_000 / sampleRate
        codec.queueInputBuffer(index, 0, chunk, ptsUs, 0)
        samplesIn += chunk / 2
        offset += chunk
        drain(false)
      }
    } catch (e: Exception) {
      failure = e.message ?: e.javaClass.simpleName
    }
  }

  /**
   * Finishes the container. Returns true when a playable file with audio in it is on disk;
   * false when no audio ever reached it — a press cut short before the first buffer, as the
   * iPhone's writer reports no recording for zero frames — and then the file is removed.
   */
  fun close(): Boolean {
    if (closed) return muxing && framesMuxed > 0
    closed = true
    try {
      if (failure == null) {
        val index = codec.dequeueInputBuffer(10_000)
        if (index >= 0) {
          val ptsUs = samplesIn * 1_000_000 / sampleRate
          codec.queueInputBuffer(index, 0, 0, ptsUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
          drain(true)
        }
      }
    } catch (e: Exception) {
      if (failure == null) failure = e.message ?: e.javaClass.simpleName
    }
    try { codec.stop() } catch (_: Exception) {}
    codec.release()
    val wrote = muxing && framesMuxed > 0
    try {
      if (muxing) muxer.stop()
    } catch (e: Exception) {
      if (failure == null) failure = e.message ?: e.javaClass.simpleName
    }
    try { muxer.release() } catch (_: Exception) {}
    if (!wrote) file.delete()
    return wrote && file.exists() && file.length() > 0
  }

  private fun drain(endOfStream: Boolean) {
    // At the end of stream, wait for the encoder's last buffer — but not forever.
    var waits = 0
    while (true) {
      val index = codec.dequeueOutputBuffer(info, if (endOfStream) 10_000 else 0)
      when {
        index == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!endOfStream || ++waits > 200) return
        index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          track = muxer.addTrack(codec.outputFormat)
          muxer.start()
          muxing = true
        }
        index >= 0 -> {
          val output = codec.getOutputBuffer(index)
          val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
          if (output != null && muxing && !isConfig && info.size > 0) {
            output.position(info.offset)
            output.limit(info.offset + info.size)
            muxer.writeSampleData(track, output, info)
            framesMuxed += 1
          }
          codec.releaseOutputBuffer(index, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
        }
      }
    }
  }
}
