package com.chinotto.voice

/**
 * The rules that decide whether a recording may become words, kept free of Android types so
 * they can be tested on the JVM (`src/test`).
 *
 * Android's own documentation does not promise that a recogniser keeps audio on the phone.
 * `SpeechRecognizer` "is likely to stream audio to remote servers"; `EXTRA_PREFER_OFFLINE`
 * "may have no effect"; `createOnDeviceSpeechRecognizer` returns "a new on-device
 * SpeechRecognizer" but says nothing about the network. So the guarantee is not taken from a
 * name. It is checked on the phone, and every check has to pass:
 *
 *   1. **API 33 or later.** Only from 33 can the app hand the recogniser its own audio
 *      (`EXTRA_AUDIO_SOURCE`), which is what lets one microphone feed both the kept
 *      recording and the recogniser, and lets a kept file be read back later. Below 33 the
 *      recogniser would open the microphone itself, so a recording is made and no words are.
 *   2. **The service cannot reach the network.** The package behind the system's on-device
 *      recogniser must be visible, a system app, must not request `INTERNET`, and must not
 *      hold it (which also covers a shared user id). Without `INTERNET` the kernel refuses the
 *      process a socket. On Pixel phones that package is Android System Intelligence, inside
 *      Private Compute Core, which Google describes as having no direct network access.
 *   3. **The service says it is local.** A recogniser that reports any *online* language for
 *      the request is not treated as on-device, whatever it is called — the platform says an
 *      on-device recogniser is "expected to return an empty list" there.
 *   4. **The language is already installed.** Nothing is downloaded on the person's behalf.
 *
 * Anything unknown counts as a failed check: the recording is kept and waits, without words.
 */
object OnDevicePolicy {
  const val MIN_SDK_FOR_WORDS = 33
  const val INTERNET = "android.permission.INTERNET"

  /** What the phone says about the package behind the on-device recogniser. */
  data class ServiceFacts(
    /** False when this app cannot see the package at all. */
    val visible: Boolean,
    val isSystemApp: Boolean,
    val requestedPermissions: List<String>,
    /** From `PackageManager.checkPermission`, so a shared user id's grant counts. */
    val internetGranted: Boolean,
  )

  fun sdkAllowsWords(sdkInt: Int): Boolean = sdkInt >= MIN_SDK_FOR_WORDS

  fun isNetworkIsolated(facts: ServiceFacts?): Boolean =
    facts != null &&
      facts.visible &&
      facts.isSystemApp &&
      INTERNET !in facts.requestedPermissions &&
      !facts.internetGranted

  /**
   * The language tag to ask for, or null when there is none that may be used.
   *
   * The phone's own tag first; otherwise an installed variant of the same language (an
   * `en-GB` phone with only `en-US` installed still speaks English). Any online language in
   * the answer disqualifies the recogniser outright (rule 3).
   */
  fun chooseLanguage(wanted: String, installed: List<String>, online: List<String>): String? {
    if (online.isNotEmpty()) return null
    val want = normalise(wanted)
    if (want.isEmpty()) return null
    installed.firstOrNull { normalise(it) == want }?.let { return it }
    val language = want.substringBefore('-')
    return installed.firstOrNull { normalise(it).substringBefore('-') == language }
  }

  private fun normalise(tag: String): String = tag.trim().replace('_', '-').lowercase()

  /** The same shape `record/files.ts` writes and will delete: one m4a in the audio folder. */
  private val RETAINED_AUDIO = Regex("^chinotto/audio/[A-Za-z0-9_-][A-Za-z0-9._-]*\\.m4a$")

  fun isRetainedAudioPath(relativePath: String): Boolean =
    RETAINED_AUDIO.matches(relativePath) && !relativePath.contains("..")
}
