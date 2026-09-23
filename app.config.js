// @ts-check

const path = require('path');

// Load `.env` for native config (`extra`) — Metro may still inline `EXPO_PUBLIC_*` separately; this keeps paywall flag reliable after `expo run:ios` / prebuild.
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const {
  assertEasPaywallHasProductionRevenueCatIosKey,
  parseEnableSyncPaywall,
} = require('./scripts/easRevenueCatEnvGuard.cjs');

const fs = require('fs');

/**
 * Whether the Android Firebase file `app.json` names is actually present.
 * @param {{ android?: { googleServicesFile?: string } }} expo
 */
function hasAndroidGoogleServicesFile(expo) {
  const file = expo.android?.googleServicesFile;
  return file != null && fs.existsSync(path.resolve(__dirname, file));
}

/** @type {import('expo/config').ConfigContext} */
module.exports = () => {
  assertEasPaywallHasProductionRevenueCatIosKey();

  const { expo } = require('./app.json');

  const includeExperimentalIosHomeWidget = process.env.EXPO_PUBLIC_EXPERIMENTAL_IOS_HOME_WIDGET === '1';

  // `google-services.json` is per-machine and never committed. Without it, Android prebuilds
  // with no native Firebase app rather than not at all — see `plugins/withFirebaseAppIosOnly.js`.
  const androidFirebaseConfigured = hasAndroidGoogleServicesFile(expo);

  const plugins = expo.plugins
    .filter((entry) => {
      const id = Array.isArray(entry) ? entry[0] : entry;
      if (id === 'expo-widgets' && !includeExperimentalIosHomeWidget) {
        return false;
      }
      return true;
    })
    .map((entry) =>
      entry === '@react-native-firebase/app' && !androidFirebaseConfigured
        ? './plugins/withFirebaseAppIosOnly.js'
        : entry
    );

  const { googleServicesFile: _unused, ...androidWithoutFirebase } = expo.android;
  const android = androidFirebaseConfigured ? expo.android : androidWithoutFirebase;

  return {
    expo: {
      ...expo,
      android,
      plugins,
      extra: {
        ...(expo.extra ?? {}),
        /** Mirrors `EXPO_PUBLIC_ENABLE_PAYWALL` at build time — read in `isPaywallEnabled()` via `expo-constants`. */
        enableSyncPaywall: parseEnableSyncPaywall(process.env.EXPO_PUBLIC_ENABLE_PAYWALL),
      },
    },
  };
};
