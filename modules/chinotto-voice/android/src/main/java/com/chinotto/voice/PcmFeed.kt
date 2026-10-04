package com.chinotto.voice

import android.os.ParcelFileDescriptor
import java.io.IOException
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Our own audio, handed to the recogniser through a pipe (`EXTRA_AUDIO_SOURCE`).
 *
 * The recogniser reads at its own pace; the recording must not. So chunks go through a
 * bounded queue to a writer thread, and a recogniser that falls several seconds behind is
 * cut off — `stalled` becomes true, the pipe closes, and the recording carries on without it.
 */
internal class PcmFeed(name: String) {
  private val pipe = ParcelFileDescriptor.createPipe()
  /** The end the recogniser reads. Ours to close once the recogniser has been handed it. */
  val readEnd: ParcelFileDescriptor = pipe[0]
  private val out = ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])
  private val queue = ArrayBlockingQueue<ByteArray>(QUEUE_CHUNKS)
  @Volatile private var ending = false
  @Volatile var stalled = false
    private set
  @Volatile var broken = false
    private set

  private val writer = Thread({
    try {
      while (true) {
        val chunk = queue.poll(100, TimeUnit.MILLISECONDS)
        if (chunk == null) {
          if (ending) break
          continue
        }
        out.write(chunk)
      }
    } catch (_: IOException) {
      broken = true // the recogniser closed its end
    } catch (_: InterruptedException) {
    } finally {
      try { out.close() } catch (_: IOException) {}
    }
  }, name)

  init {
    writer.isDaemon = true
    writer.start()
  }

  /** From the recording thread. Never blocks. */
  fun offer(pcm: ByteArray, length: Int) {
    if (ending || stalled || broken) return
    if (!queue.offer(pcm.copyOf(length))) {
      stalled = true
      end()
    }
  }

  /**
   * For audio read from a file, which arrives faster than the recogniser reads it: waits for
   * room, and gives up (stalled) only when the recogniser has stopped reading altogether.
   */
  fun put(pcm: ByteArray, length: Int): Boolean {
    if (ending || stalled || broken) return false
    if (!queue.offer(pcm.copyOf(length), 10, TimeUnit.SECONDS)) {
      stalled = true
      end()
      return false
    }
    return true
  }

  /** Our audio is over: what is queued is still delivered, then the recogniser sees the end. */
  fun end() {
    ending = true
  }

  /** Stops at once, dropping anything queued. */
  fun abort() {
    ending = true
    queue.clear()
    writer.interrupt()
    try { readEnd.close() } catch (_: IOException) {}
  }

  fun closeReadEnd() {
    try { readEnd.close() } catch (_: IOException) {}
  }

  companion object {
    /** About six seconds of 20 ms chunks. */
    const val QUEUE_CHUNKS = 300
  }
}
