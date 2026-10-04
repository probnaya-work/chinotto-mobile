package com.chinotto.voice

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.res.Resources
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.annotation.RequiresApi
import java.util.Locale

/**
 * The one place a `SpeechRecognizer` is created.
 *
 * Every rule in `OnDevicePolicy` is checked here, on the phone, before a recogniser exists;
 * a caller that gets `null` has no recogniser and sends no audio anywhere. Only
 * `createOnDeviceSpeechRecognizer` is ever called — never the default recogniser, which the
 * platform says is likely to stream audio to remote servers. `__tests__/voiceOnDeviceOnly.test.ts`
 * reads this file to keep it that way.
 *
 * Everything here runs on the main thread, as `SpeechRecognizer` requires.
 */
internal class OnDeviceGate(private val context: Context) {
  sealed class Verdict {
    /** May recognise, in this language, with this recogniser. The caller owns and destroys it. */
    data class Ready(val language: String, val recognizer: SpeechRecognizer) : Verdict()
    object Unavailable : Verdict()
  }

  private val main = Handler(Looper.getMainLooper())

  /** Rules 1 and 2: can a recogniser that stays on this phone exist at all? */
  fun serviceMayBeUsed(): Boolean {
    if (!OnDevicePolicy.sdkAllowsWords(Build.VERSION.SDK_INT)) return false
    if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) return false
    return OnDevicePolicy.isNetworkIsolated(serviceFacts())
  }

  /** What the phone says about the package behind its on-device recogniser. Null if unknown. */
  fun serviceFacts(): OnDevicePolicy.ServiceFacts? {
    val system = Resources.getSystem()
    val id = system.getIdentifier("config_defaultOnDeviceSpeechRecognitionService", "string", "android")
    if (id == 0) return null
    val flattened = try { system.getString(id) } catch (_: Resources.NotFoundException) { return null }
    val component = ComponentName.unflattenFromString(flattened) ?: return null
    val pm = context.packageManager
    val info = try {
      pm.getPackageInfo(component.packageName, PackageManager.GET_PERMISSIONS)
    } catch (_: PackageManager.NameNotFoundException) {
      return OnDevicePolicy.ServiceFacts(false, false, emptyList(), false)
    }
    val flags = info.applicationInfo?.flags ?: 0
    return OnDevicePolicy.ServiceFacts(
      visible = true,
      isSystemApp = flags and ApplicationInfo.FLAG_SYSTEM != 0,
      requestedPermissions = info.requestedPermissions?.toList() ?: emptyList(),
      internetGranted = pm.checkPermission(OnDevicePolicy.INTERNET, component.packageName) ==
        PackageManager.PERMISSION_GRANTED,
    )
  }

  /**
   * All four rules, then a recogniser. Answers on the main thread, within `timeoutMs`.
   * Never asks for anything: permissions are the caller's business.
   */
  fun open(locale: Locale, timeoutMs: Long = 8_000, done: (Verdict) -> Unit) {
    main.post {
      if (!serviceMayBeUsed() || Build.VERSION.SDK_INT < OnDevicePolicy.MIN_SDK_FOR_WORDS) {
        done(Verdict.Unavailable)
        return@post
      }
      openChecked(locale, timeoutMs, done)
    }
  }

  @RequiresApi(33)
  private fun openChecked(locale: Locale, timeoutMs: Long, done: (Verdict) -> Unit) {
    val recognizer = try {
      SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
    } catch (_: Exception) {
      done(Verdict.Unavailable)
      return
    }
    var answered = false
    fun answer(verdict: Verdict) {
      if (answered) return
      answered = true
      if (verdict !is Verdict.Ready) recognizer.destroy()
      done(verdict)
    }
    val wanted = locale.toLanguageTag()
    val probe = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, wanted)
    }
    try {
      recognizer.checkRecognitionSupport(probe, { main.post(it) }, object : RecognitionSupportCallback {
        override fun onSupportResult(support: RecognitionSupport) {
          val language = OnDevicePolicy.chooseLanguage(
            wanted,
            support.installedOnDeviceLanguages,
            support.onlineLanguages,
          )
          answer(if (language != null) Verdict.Ready(language, recognizer) else Verdict.Unavailable)
        }

        override fun onError(error: Int) = answer(Verdict.Unavailable)
      })
    } catch (_: Exception) {
      answer(Verdict.Unavailable)
      return
    }
    main.postDelayed({ answer(Verdict.Unavailable) }, timeoutMs)
  }

  companion object {
    /** The request every recognition in this module makes: our audio, in, and nothing else. */
    @RequiresApi(33)
    fun recognitionIntent(
      language: String,
      audio: android.os.ParcelFileDescriptor,
      sampleRate: Int,
      partials: Boolean,
    ): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partials)
      // Belt and braces only: the platform says this "may have no effect". The gate is the rule.
      putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, audio)
      putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
      putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, android.media.AudioFormat.ENCODING_PCM_16BIT)
      putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, sampleRate)
      // Keep listening until our audio ends, rather than stopping at the first pause.
      putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
    }
  }
}
