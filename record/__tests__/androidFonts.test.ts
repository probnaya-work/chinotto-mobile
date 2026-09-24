/**
 * Android gets fonts it can actually read.
 *
 * The generated faces are WOFF2 inside a `.ttf` name. iOS reads that; Android's `Typeface`
 * does not, and instead of failing it draws every face in Roboto — which is what the record
 * looked like on an API 36 emulator. So Android loads plain TrueType copies of the same
 * instances, and iOS keeps the files it shipped with.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { FACES } from '../ui/type';

const FONTS = join(__dirname, '..', '..', 'assets', 'fonts');
const TRUETYPE = '00010000';
const WOFF2 = '774f4632'; // "wOF2"

const magic = (path: string) => readFileSync(path).subarray(0, 4).toString('hex');

// Loaded by path so the Android list is checked even though Jest resolves as iOS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const android: Record<string, number> = require('../ui/fontAssets.android').FONT_ASSETS;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ios: Record<string, number> = require('../ui/fontAssets').FONT_ASSETS;

describe('fonts on android', () => {
  it('loads every face the type ladder names', () => {
    expect(Object.keys(android).sort()).toEqual(Object.values(FACES).sort());
    expect(Object.keys(android).sort()).toEqual(Object.keys(ios).sort());
  });

  it('is plain TrueType for every face, which Android can read', () => {
    const notTrueType = Object.values(FACES).filter(
      (family) => magic(join(FONTS, 'android', `${family}.ttf`)) !== TRUETYPE
    );
    expect(notTrueType).toEqual([]);
  });

  it('leaves the iOS files exactly as they shipped', () => {
    // WOFF2, which CoreText reads. Converting these would change the submitted iOS bundle.
    const changed = Object.values(FACES).filter(
      (family) => magic(join(FONTS, `${family}.ttf`)) !== WOFF2
    );
    expect(changed).toEqual([]);
  });
});
