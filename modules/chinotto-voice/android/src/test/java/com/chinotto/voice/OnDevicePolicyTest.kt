package com.chinotto.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OnDevicePolicyTest {
  private val isolated = OnDevicePolicy.ServiceFacts(
    visible = true,
    isSystemApp = true,
    requestedPermissions = listOf("android.permission.RECORD_AUDIO"),
    internetGranted = false,
  )

  @Test fun wordsNeedApi33() {
    assertFalse(OnDevicePolicy.sdkAllowsWords(31))
    assertFalse(OnDevicePolicy.sdkAllowsWords(32))
    assertTrue(OnDevicePolicy.sdkAllowsWords(33))
    assertTrue(OnDevicePolicy.sdkAllowsWords(36))
  }

  @Test fun aSystemServiceWithoutInternetIsIsolated() {
    assertTrue(OnDevicePolicy.isNetworkIsolated(isolated))
  }

  @Test fun anythingUnknownOrNetworkedIsNot() {
    assertFalse(OnDevicePolicy.isNetworkIsolated(null))
    assertFalse(OnDevicePolicy.isNetworkIsolated(isolated.copy(visible = false)))
    assertFalse(OnDevicePolicy.isNetworkIsolated(isolated.copy(isSystemApp = false)))
    assertFalse(
      OnDevicePolicy.isNetworkIsolated(
        isolated.copy(requestedPermissions = isolated.requestedPermissions + OnDevicePolicy.INTERNET)
      )
    )
    // Granted through a shared user id without being requested by the package itself.
    assertFalse(OnDevicePolicy.isNetworkIsolated(isolated.copy(internetGranted = true)))
  }

  @Test fun thePhonesOwnLanguageFirst() {
    assertEquals("en-GB", OnDevicePolicy.chooseLanguage("en-GB", listOf("en-US", "en-GB"), emptyList()))
  }

  @Test fun anInstalledVariantOfTheSameLanguage() {
    assertEquals("en-US", OnDevicePolicy.chooseLanguage("en-GB", listOf("de-DE", "en-US"), emptyList()))
    assertEquals("pt-BR", OnDevicePolicy.chooseLanguage("pt_PT", listOf("pt-BR"), emptyList()))
  }

  @Test fun nothingInstalledMeansNoWords() {
    assertNull(OnDevicePolicy.chooseLanguage("ru-RU", listOf("en-US"), emptyList()))
    assertNull(OnDevicePolicy.chooseLanguage("ru-RU", emptyList(), emptyList()))
    assertNull(OnDevicePolicy.chooseLanguage("", listOf("en-US"), emptyList()))
  }

  @Test fun anyOnlineLanguageDisqualifiesTheRecogniser() {
    assertNull(OnDevicePolicy.chooseLanguage("en-US", listOf("en-US"), listOf("en-US")))
    assertNull(OnDevicePolicy.chooseLanguage("en-US", listOf("en-US"), listOf("fr-FR")))
  }

  @Test fun onlyTheRecordsOwnRecordings() {
    assertTrue(OnDevicePolicy.isRetainedAudioPath("chinotto/audio/f1.m4a"))
    assertTrue(OnDevicePolicy.isRetainedAudioPath("chinotto/audio/0b7c-uuid_x.m4a"))
    assertFalse(OnDevicePolicy.isRetainedAudioPath("chinotto/audio/../db.sqlite"))
    assertFalse(OnDevicePolicy.isRetainedAudioPath("chinotto/audio/.hidden.m4a"))
    assertFalse(OnDevicePolicy.isRetainedAudioPath("/data/chinotto/audio/f1.m4a"))
    assertFalse(OnDevicePolicy.isRetainedAudioPath("chinotto/audio/f1.caf"))
    assertFalse(OnDevicePolicy.isRetainedAudioPath("chinotto/audio/sub/f1.m4a"))
  }
}
