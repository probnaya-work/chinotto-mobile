/**
 * The Android app runs in night mode.
 *
 * Without it, React Native's edge-to-edge setup takes the navigation bar's appearance from the
 * phone's own light/dark setting, and a phone in light mode drew a light strip with grey
 * buttons under the record — seen on an API 36 emulator with three-button navigation.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { applyNightMode } = require('../plugins/withAndroidNightMode');

const MAIN_APPLICATION = `package com.chinotto.mobile

import android.app.Application

class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
`;

describe('android night mode', () => {
  it('sets night mode straight after the application is created', () => {
    const out: string = applyNightMode(MAIN_APPLICATION);
    expect(out).toContain('import androidx.appcompat.app.AppCompatDelegate');
    expect(out).toMatch(
      /super\.onCreate\(\)\n\s+AppCompatDelegate\.setDefaultNightMode\(AppCompatDelegate\.MODE_NIGHT_YES\)/
    );
  });

  it('is idempotent across repeated prebuilds', () => {
    const once: string = applyNightMode(MAIN_APPLICATION);
    expect(applyNightMode(once)).toBe(once);
  });

  it('fails loudly rather than silently when the template changes shape', () => {
    expect(() => applyNightMode('class MainApplication : Application()')).toThrow(/super\.onCreate/);
  });

  it('is registered in app.json', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { expo } = require('../app.json');
    expect(expo.plugins).toContain('./plugins/withAndroidNightMode.js');
  });
});
