import * as fs from 'fs';
import * as path from 'path';

/**
 * EAS remote credentials (bare workflow) resolve extension targets by walking
 * PBXTargetDependency from the app target — embed phases alone are not enough.
 */
describe('iOS share extension and EAS target graph', () => {
  it('Chinotto declares a PBXTargetDependency on expo-sharing-extension', () => {
    const pbxPath = path.join(__dirname, '..', 'ios', 'Chinotto.xcodeproj', 'project.pbxproj');
    const pbx = fs.readFileSync(pbxPath, 'utf8');

    expect(pbx).toMatch(
      /2B3C4D5E6F70819293A4B5C6 \/\* PBXTargetDependency \*\/ = \{\s*isa = PBXTargetDependency;\s*target = 8385E3AB3F8840F79F0E7FF6 \/\* expo-sharing-extension \*\/;/
    );

    expect(pbx).toMatch(
      /\/\* Chinotto \*\/ = \{[\s\S]*?dependencies = \(\s*8DB5384FEA3B4F88B968BFC5 \/\* PBXTargetDependency \*\/,\s*2B3C4D5E6F70819293A4B5C6 \/\* PBXTargetDependency \*\/,\s*\);[\s\S]*?productType = "com\.apple\.product-type\.application";/
    );
  });

  it('resolves shared Swift sources through the installed expo-sharing package', () => {
    const iosPath = path.join(__dirname, '..', 'ios');
    const pbx = fs.readFileSync(path.join(iosPath, 'Chinotto.xcodeproj', 'project.pbxproj'), 'utf8');
    const sharedGroup = path.join(iosPath, 'expo-sharing-extension', 'shared');

    for (const filename of ['Constants.swift', 'ShareProtocol.swift', 'ShareIntoFileStore.swift']) {
      const relativePath = `../../../node_modules/expo-sharing/ios/shared/${filename}`;
      expect(pbx).toContain(`path = "${relativePath}"`);
      expect(pbx).toContain(`/* ${filename} in Sources */`);
      expect(fs.existsSync(path.resolve(sharedGroup, relativePath))).toBe(true);
    }
  });
});
