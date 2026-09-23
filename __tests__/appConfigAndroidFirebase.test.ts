/**
 * Android prebuilds with or without `google-services.json`.
 *
 * The file holds the Firebase project's Android identifiers and is supplied per machine,
 * never committed. `@react-native-firebase/app`'s plugin refuses to prebuild Android without
 * it, so `app.config.js` swaps in its iOS half when the file is absent — and must change
 * nothing at all when it is present, which is how release builds are made.
 */

import fs from 'fs';
import path from 'path';

const GOOGLE_SERVICES = path.resolve(__dirname, '..', 'google-services.json');

type ExpoConfig = {
  android: Record<string, unknown>;
  ios: Record<string, unknown>;
  plugins: unknown[];
};

function loadConfig(googleServicesPresent: boolean): ExpoConfig {
  const realExists = fs.existsSync;
  const spy = jest
    .spyOn(fs, 'existsSync')
    .mockImplementation((p) =>
      path.resolve(String(p)) === GOOGLE_SERVICES ? googleServicesPresent : realExists(p)
    );
  try {
    let config: ExpoConfig | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      config = require('../app.config.js')().expo;
    });
    return config!;
  } finally {
    spy.mockRestore();
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appJson = require('../app.json').expo;

describe('android firebase configuration', () => {
  it('is exactly app.json when google-services.json is present', () => {
    const config = loadConfig(true);
    expect(config.android).toEqual(appJson.android);
    expect(config.plugins).toContain('@react-native-firebase/app');
    expect(config.plugins).not.toContain('./plugins/withFirebaseAppIosOnly.js');
  });

  it('prebuilds Android without native Firebase when the file is absent', () => {
    const config = loadConfig(false);
    expect(config.android.googleServicesFile).toBeUndefined();
    expect(config.android.package).toBe('com.chinotto.mobile');
    expect(config.plugins).not.toContain('@react-native-firebase/app');
    expect(config.plugins).toContain('./plugins/withFirebaseAppIosOnly.js');
  });

  it('leaves iOS alone either way', () => {
    expect(loadConfig(false).ios).toEqual(appJson.ios);
    expect(loadConfig(true).ios).toEqual(appJson.ios);
  });

  it('keeps the swap in the same place in the plugin order', () => {
    const present = loadConfig(true).plugins;
    const absent = loadConfig(false).plugins;
    expect(absent.indexOf('./plugins/withFirebaseAppIosOnly.js')).toBe(
      present.indexOf('@react-native-firebase/app')
    );
  });

  it('never commits the file itself', () => {
    const ignore = fs.readFileSync(path.resolve(__dirname, '..', '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^\/?google-services\.json$/m);
  });
});

describe('android permissions', () => {
  it('blocks the ones the template adds and the app never uses', () => {
    expect(appJson.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.WRITE_SETTINGS',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ])
    );
  });
});
