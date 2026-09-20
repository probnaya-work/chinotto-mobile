import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { FACES, face, type } from '../ui/type';
import { TIERS } from '../ui/tiers';
import { ink } from '../ui/tokens';

const FONT_DIR = join(__dirname, '..', '..', 'assets', 'fonts');

describe('the type ladder', () => {
  it('has a generated font file for every face it names', () => {
    const missing = Object.values(FACES).filter(
      (family) => !existsSync(join(FONT_DIR, `${family}.ttf`))
    );
    expect(missing).toEqual([]);
  });

  it('ships the licence alongside them', () => {
    expect(existsSync(join(FONT_DIR, 'Archivo-LICENSE.txt'))).toBe(true);
  });

  it('generates genuinely different widths, not the same file renamed', () => {
    // The whole point of the ladder is that D0 and D4 are set at different widths. If the
    // instancer silently produced the default instance each time, these would be identical.
    const sizes = (['400-100', '400-88', '400-80', '400-76'] as const).map((k) =>
      readFileSync(join(FONT_DIR, `${FACES[k]}.ttf`)).length
    );
    expect(new Set(sizes).size).toBeGreaterThan(1);

    const hashes = (['400-100', '400-76'] as const).map((k) =>
      readFileSync(join(FONT_DIR, `${FACES[k]}.ttf`)).toString('base64').slice(0, 512)
    );
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('picks the exact face when one exists', () => {
    expect(face(100)).toBe('Archivo-400-100');
    expect(face(76)).toBe('Archivo-400-76');
    expect(face(96, { weight: 500 })).toBe('Archivo-500-96');
    expect(face(88, { italic: true })).toBe('Archivo-400-88-Italic');
  });

  it('snaps to the nearest generated width rather than dropping the slant', () => {
    // 90 italic is not generated; 88 italic is the nearest, and italic survives.
    expect(face(90, { italic: true })).toBe('Archivo-400-88-Italic');
    expect(face(92, { italic: true })).toBe('Archivo-400-94-Italic');
    // 500 exists at one width only.
    expect(face(76, { weight: 500 })).toBe('Archivo-500-96');
  });

  it('converts tracking from em to points, as React Native wants it', () => {
    const d0 = type({ size: 20, width: 100, lineHeight: 1.28, tracking: -0.01 });
    expect(d0.fontSize).toBe(20);
    expect(d0.lineHeight).toBeCloseTo(25.6);
    expect(d0.letterSpacing).toBeCloseTo(-0.2);
  });

  it('narrows and fades in lockstep as material recedes', () => {
    const widths = [0, 1, 2, 3, 4].map((t) => TIERS[t as 0].width);
    expect(widths).toEqual([100, 88, 80, 76, 76]);

    const colors = [0, 1, 2, 3, 4].map((t) => TIERS[t as 0].color);
    expect(colors).toEqual([ink.ink, ink.far, ink.dim, ink.meta, ink.meta]);

    const sizes = [0, 1, 2, 3, 4].map((t) => TIERS[t as 0].size);
    expect(sizes).toEqual([20, 14, 12, 12, 12]);

    // Nothing ever widens or brightens as it gets older.
    for (let t = 1; t <= 4; t += 1) {
      expect(TIERS[t as 0].width).toBeLessThanOrEqual(TIERS[(t - 1) as 0].width);
      expect(TIERS[t as 0].size).toBeLessThanOrEqual(TIERS[(t - 1) as 0].size);
    }
  });

  it('clamps harder the further back material sits', () => {
    expect([0, 1, 2, 3, 4].map((t) => TIERS[t as 0].clamp)).toEqual([4, 2, 1, 1, 1]);
  });
});
