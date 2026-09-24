/**
 * Runs the Android app in night mode, always.
 *
 * The Record has one appearance, and it is dark (`userInterfaceStyle: "dark"`). On iOS that
 * setting reaches the system; on Android it needs `expo-system-ui`, which would also add a
 * native iOS module, so it is done here instead, for Android alone.
 *
 * Without it, React Native's edge-to-edge setup takes the navigation bar's appearance from
 * the *phone's* light/dark setting. On a phone in light mode that drew a light strip with
 * grey buttons under the record's ink field — seen with three-button navigation on an API 36
 * emulator. In night mode the bar is dark with light buttons, as it is when the phone itself
 * is dark.
 *
 * Android-only: `withMainApplication` has no iOS counterpart, so iOS prebuild output is
 * unaffected.
 */
const { withMainApplication } = require('expo/config-plugins');

const IMPORT = 'import androidx.appcompat.app.AppCompatDelegate';
const CALL = 'AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)';

function applyNightMode(source) {
  if (source.includes(CALL)) return source;
  if (!source.includes('super.onCreate()')) {
    throw new Error('withAndroidNightMode: MainApplication.onCreate has no super.onCreate() to follow');
  }
  let out = source.replace(/^(package .+\n)/m, `$1\n${IMPORT}\n`);
  out = out.replace('super.onCreate()', `super.onCreate()\n    ${CALL}`);
  return out;
}

const withAndroidNightMode = (config) =>
  withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('withAndroidNightMode: expected a Kotlin MainApplication');
    }
    mod.modResults.contents = applyNightMode(mod.modResults.contents);
    return mod;
  });

module.exports = withAndroidNightMode;
module.exports.applyNightMode = applyNightMode;
