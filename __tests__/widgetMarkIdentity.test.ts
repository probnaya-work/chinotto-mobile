import * as fs from 'fs';
import * as path from 'path';

/**
 * The home widget draws its identity in Swift rather than from an asset, so nothing in the
 * asset pipeline can keep it current. It shipped the superseded four-dot mark, the withdrawn
 * periwinkle and pre-design copy long after "Chinotto - Identity" replaced them, precisely
 * because it is all numbers and strings in a source file.
 *
 * What the Identity project states for this surface:
 *   · asset 05, the ladder — >=40px three dots at stroke 2.5, 24-39px two dots at stroke 3.5,
 *     <=20px one dot at stroke 6, each drawn rather than scaled;
 *   · the widget takes the two-dot rung, "because the ring's thin stroke breaks in a widget's
 *     dimmed render", and on the small tile the mark "does not shrink with the tile";
 *   · the inventory row for this file — ink and paper only, no periwinkle, no glow;
 *   · the drawn panels — lower-case `capture`, `it lands, and stays`, a ring-and-dot
 *     affordance, and a flat field.
 */

const WIDGET = path.join(__dirname, '..', 'ios', 'ExpoWidgetsTarget', 'CaptureHomeWidget.swift');
const source = fs.readFileSync(WIDGET, 'utf8');

/** The mark's own body, so ring/dot counts are not confused with the capture affordance. */
const markBody = (() => {
  const start = source.indexOf('private struct ChinottoLogoMark');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n}', source.indexOf('var body', start));
  return source.slice(start, end);
})();

function hasRatio(numerator: string): boolean {
  return new RegExp(`${numerator.replace('.', '\\.')}\\s*/\\s*64`).test(markBody);
}

describe('the widget mark is the current one, at the widget rung', () => {
  it('takes the two-dot rung: ring r28 at stroke 3.5', () => {
    expect(markBody).toMatch(/ringDiameter:\s*CGFloat\s*=\s*0\.875/);
    expect(hasRatio('3.5')).toBe(true);
  });

  it('draws the upper dot at r9, y=23 and the lower at r5, y=40', () => {
    expect(hasRatio('18.0')).toBe(true);
    expect(hasRatio('-9.0')).toBe(true);
    expect(hasRatio('10.0')).toBe(true);
    expect(hasRatio('8.0')).toBe(true);
  });

  it('draws exactly two dots inside the ring', () => {
    expect(markBody.match(/Circle\(\)\s*\n\s*\.fill\(/g) ?? []).toHaveLength(2);
  });

  it('carries no geometry from the superseded four-dot mark', () => {
    for (const ratio of ['0.1875', '0.15625', '0.125', '0.03125', '0.032']) {
      expect(markBody).not.toContain(ratio);
    }
  });

  it('holds the 22pt rung on the small tile rather than shrinking with it', () => {
    expect(source).toMatch(/smallLogoSize:\s*CGFloat\s*=\s*22/);
  });
});

describe('the widget carries the current identity treatment', () => {
  it('speaks in the product voice, lower case', () => {
    expect(source).toContain('Text("capture")');
    expect(source).toContain('it lands, and stays');
  });

  it('has dropped the pre-design copy', () => {
    expect(source).not.toContain('Text("Capture")');
    expect(source).not.toContain('your thought');
    expect(source).not.toContain('No thoughts yet');
  });

  it('draws the ring-and-dot capture affordance', () => {
    expect(source).toContain('private struct CaptureRing');
    expect(source).toMatch(/lineWidth:\s*1\.5/);
  });

  it('is ink and paper only — the withdrawn periwinkle, glow and gradient are gone', () => {
    expect(source).not.toMatch(/198\s*\/\s*255/); // the old mark tint
    expect(source).not.toMatch(/\.shadow\(/);
    expect(source).not.toMatch(/LinearGradient|RadialGradient/);
  });

  it('keeps periwinkle for the sync dot, and only there', () => {
    // #9aa0c8 / #5b62a0 — the one place the colour system leaves it.
    expect(source).toMatch(/154\s*\/\s*255.*160\s*\/\s*255.*200\s*\/\s*255/s);
    expect(source).toContain('WidgetInk.live(scheme)');
    // The mark must not reach for it.
    expect(markBody).not.toContain('live(');
  });

  it('lights the dot from real state rather than assuming it', () => {
    expect(source).toContain('let syncOn: Bool?');
    expect(source).toMatch(/payload\.syncOn\s*\?\?\s*false/);
    expect(source).toMatch(/if syncOn \{/);
  });

  it('draws both appearances the design gives', () => {
    expect(source).toMatch(/scheme\s*==\s*\.light/);
    expect(source).toMatch(/242\s*\/\s*255/); // #f2f1ec, the paper field
    expect(source).toMatch(/230\s*\/\s*255/); // #e6e6e3, the ink
  });
});
