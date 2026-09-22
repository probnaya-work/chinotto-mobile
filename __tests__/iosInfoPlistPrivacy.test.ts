import * as fs from 'fs';
import * as path from 'path';

/** Pulls a top-level `<key>name</key>\n<string>value</string>` pair out of plist XML. */
function plistString(xml: string, key: string): string | undefined {
  const match = xml.match(
    new RegExp(`<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`)
  );
  return match?.[1];
}

it('Chinotto Info.plist includes NSPhotoLibraryUsageDescription (App Store privacy)', () => {
  const plistPath = path.join(__dirname, '..', 'ios', 'Chinotto', 'Info.plist');
  const xml = fs.readFileSync(plistPath, 'utf8');
  expect(xml).toContain('<key>NSPhotoLibraryUsageDescription</key>');
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
