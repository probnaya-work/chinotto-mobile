import * as fs from 'fs';
import * as path from 'path';

/** Pulls a top-level `<key>name</key>\n<string>value</string>` pair out of plist XML. */
function plistString(xml: string, key: string): string | undefined {
  const match = xml.match(
    new RegExp(`<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`)
  );
  return match?.[1];
}

it('includes the share-sheet photo purpose required by App Store validation', () => {
  const plistPath = path.join(__dirname, '..', 'ios', 'Chinotto', 'Info.plist');
  const xml = fs.readFileSync(plistPath, 'utf8');
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  const purpose = plistString(xml, 'NSPhotoLibraryUsageDescription');
  expect(purpose).toBe(appJson.expo.ios.infoPlist.NSPhotoLibraryUsageDescription);
  expect(purpose).toContain('iOS share sheet');
});

it('Chinotto Info.plist is iPhone-only (UIDeviceFamily 1, no iPad orientation plist keys)', () => {
  const plistPath = path.join(__dirname, '..', 'ios', 'Chinotto', 'Info.plist');
  const xml = fs.readFileSync(plistPath, 'utf8');
  expect(xml).toContain('<key>UIDeviceFamily</key>');
  expect(xml).toMatch(/<key>UIDeviceFamily<\/key>\s*<array>\s*<integer>1<\/integer>\s*<\/array>/);
  expect(xml).not.toContain('UISupportedInterfaceOrientations~ipad');
});

it('Xcode project targets iPhone only (TARGETED_DEVICE_FAMILY = 1)', () => {
  const pbxPath = path.join(__dirname, '..', 'ios', 'Chinotto.xcodeproj', 'project.pbxproj');
  const text = fs.readFileSync(pbxPath, 'utf8');
  expect(text).toContain('TARGETED_DEVICE_FAMILY = 1;');
  expect(text).not.toContain('TARGETED_DEVICE_FAMILY = "1,2"');
});

it('shipped Info.plist mic/speech usage strings match app.json (the source of truth)', () => {
  // ios/ is committed and built directly; a change to app.json's `expo.ios.infoPlist` does
  // not by itself update Info.plist (no prebuild runs as part of a normal archive here), so
  // the two can drift silently. This test catches that drift instead of relying on someone
  // remembering to sync them by hand.
  const appJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')
  );
  const expected = appJson.expo.ios.infoPlist;

  const plistPath = path.join(__dirname, '..', 'ios', 'Chinotto', 'Info.plist');
  const xml = fs.readFileSync(plistPath, 'utf8');

  expect(plistString(xml, 'NSMicrophoneUsageDescription')).toBe(
    expected.NSMicrophoneUsageDescription
  );
  expect(plistString(xml, 'NSSpeechRecognitionUsageDescription')).toBe(
    expected.NSSpeechRecognitionUsageDescription
  );
});

it('commits the same single-window scene configuration used by Expo prebuild', () => {
  // SDK 27 requires scene adoption at launch. Both build paths must name the
  // delegate compiled into AppDelegate.swift, without enabling multiple Records.
  const root = path.join(__dirname, '..');
  const xml = fs.readFileSync(path.join(root, 'ios', 'Chinotto', 'Info.plist'), 'utf8');
  const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const manifest = appJson.expo.ios.infoPlist.UIApplicationSceneManifest;
  expect(manifest.UIApplicationSupportsMultipleScenes).toBe(false);
  const scenes = manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
  expect(scenes).toHaveLength(1);
  expect(scenes[0].UISceneDelegateClassName).toBe('$(PRODUCT_MODULE_NAME).ChinottoSceneDelegate');
  expect(xml).toMatch(/<key>UIApplicationSceneManifest<\/key>\s*<dict>\s*<key>UIApplicationSupportsMultipleScenes<\/key>\s*<false\/>/);
  expect(xml).toMatch(/<key>UIWindowSceneSessionRoleApplication<\/key>\s*<array>\s*<dict>[\s\S]*?<\/dict>\s*<\/array>/);
  expect(plistString(xml, 'UISceneDelegateClassName')).toBe(scenes[0].UISceneDelegateClassName);
  expect(plistString(xml, 'UISceneConfigurationName')).toBe(scenes[0].UISceneConfigurationName);
  const delegate = fs.readFileSync(path.join(root, 'ios', 'Chinotto', 'AppDelegate.swift'), 'utf8');
  expect(delegate).toContain('class ChinottoSceneDelegate: ExpoAppSceneDelegate');
  expect(delegate).toContain('RecordPrivacyGuard.shared.window = window');
  expect(delegate).not.toContain('RCTLinkingManager.application');
});
