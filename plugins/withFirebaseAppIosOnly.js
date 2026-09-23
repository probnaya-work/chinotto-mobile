/**
 * `@react-native-firebase/app`'s config plugin, with only its iOS half.
 *
 * Used by `app.config.js` in place of the full plugin when `google-services.json` is not on
 * disk. That file carries the Firebase project's Android identifiers, so it is supplied per
 * machine and never committed — and the full plugin refuses to prebuild Android without it.
 *
 * Without it, Android builds with no native Firebase app. The only native Firebase use is
 * Remote Config for the update gate, and that already treats a failed fetch as "no gate", so
 * the app runs fully offline and local either way. Sync does not depend on it: Firestore and
 * Auth go through the Firebase JS SDK, configured from `EXPO_PUBLIC_FIREBASE_*`.
 *
 * The iOS mods are applied exactly as the full plugin applies them, so an iOS prebuild is the
 * same with or without the Android file.
 */
const path = require('path');
const { createRunOncePlugin, withPlugins } = require('expo/config-plugins');

// The package's `exports` map exposes only `app.plugin.js`, so its iOS half is reached by path.
const rnfbRoot = path.dirname(require.resolve('@react-native-firebase/app/package.json'));
const ios = require(path.join(rnfbRoot, 'plugin/build/ios'));

const withFirebaseAppIosOnly = (config) =>
  withPlugins(config, [ios.withFirebaseAppDelegate, ios.withIosGoogleServicesFile]);

// Same run-once key as the full plugin, so the two can never both apply.
const pak = require(path.join(rnfbRoot, 'package.json'));
module.exports = createRunOncePlugin(withFirebaseAppIosOnly, pak.name, pak.version);
