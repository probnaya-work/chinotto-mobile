import * as fs from 'fs';
import * as path from 'path';

/**
 * The home widget draws the Chinotto mark in Swift rather than from an asset, so nothing in
 * the asset pipeline can keep it current. It shipped the superseded four-dot mark long after
 * that identity was withdrawn, precisely because the geometry is numbers in a source file.
 *
 * "Chinotto - Identity" asset 05 is a ladder: >=40px three dots at stroke 2.5, 24-39px two
 * dots at stroke 3.5, <=20px one dot at stroke 6 — each drawn, never scaled. For this surface
 * the Identity project is explicit: "the widget takes the 22pt rung — two dots — because the
 * ring's thin stroke breaks in a widget's dimmed render", and its inventory row for this file
 * says the periwinkle triple and its glow shadow go, ink and paper only.
 *
 * These assertions are what stops the old mark returning quietly.
 */

const WIDGET = path.join(__dirname, '..', 'ios', 'ExpoWidgetsTarget', 'CaptureHomeWidget.swift');
const source = fs.readFileSync(WIDGET, 'utf8');

/** Geometry is written as `<n>.0 / 64` (or `3.5 / 64`), so the design's 64-unit grid stays readable. */
function hasRatio(numerator: string): boolean {
  return new RegExp(`${numerator.replace('.', '\\.')}\\s*/\\s*64`).test(source);
}

describe('the home widget draws the current Chinotto mark', () => {
  it('takes the two-dot rung: ring r28 at stroke 3.5', () => {
    expect(source).toMatch(/ringDiameter:\s*CGFloat\s*=\s*0\.875/);
    expect(hasRatio('3.5')).toBe(true);
  });

  it('draws the upper dot at r9, y=23', () => {
    expect(hasRatio('18.0')).toBe(true); // diameter 2 * 9
    expect(hasRatio('-9.0')).toBe(true); // centre, 23 - 32
  });

  it('draws the lower dot at r5, y=40', () => {
    expect(hasRatio('10.0')).toBe(true); // diameter 2 * 5
    expect(hasRatio('8.0')).toBe(true); // centre, 40 - 32
  });

  it('draws exactly two dots inside the ring', () => {
    const fills = source.match(/\.fill\(chinottoLogoMarkInk\)/g) ?? [];
    expect(fills).toHaveLength(2);
  });

  it('carries no geometry from the superseded four-dot mark', () => {
    // r6@20, r5@(22,34) and (42,34), r4@44, stroke 2 — as ratios of 64.
    for (const ratio of ['0.1875', '0.15625', '0.125', '0.03125', '0.032']) {
      expect(source).not.toContain(ratio);
    }
  });

  it('is ink, with no tint and no glow', () => {
    expect(source).not.toMatch(/198\s*\/\s*255/); // the withdrawn periwinkle
    expect(source).not.toMatch(/\.shadow\(/);
    expect(source).not.toMatch(/brandLift/);
  });
});
