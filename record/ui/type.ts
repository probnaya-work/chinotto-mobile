/**
 * Archivo, with its width axis resolved ahead of time.
 *
 * The prototype carries distance on the font's `wdth` axis: material narrows as it recedes.
 * React Native has no `fontVariationSettings`, so the axis cannot be varied at runtime —
 * loading the variable font on iOS gives you its default instance and nothing else.
 *
 * So each width the prototype actually draws is generated as its own static family by
 * `scripts/generate-archivo-instances.py` (run with `pnpm generate:fonts`), and picked here
 * by name. The mapping is the whole of the indirection: everywhere else in the record asks
 * for a width and a slant, not for a file.
 */

import type { TextStyle } from 'react-native';

/** Every width the prototype draws, and nothing else. */
export type Width = 76 | 80 | 88 | 90 | 92 | 94 | 96 | 100;
export type Weight = 400 | 500;

type FaceKey = `${Weight}-${Width}${'' | '-Italic'}`;

/**
 * The generated families. Keys must match `family_name()` in the generator script.
 *
 * Deliberately partial: only the widths the prototype actually draws are generated, so an
 * unused combination is absent rather than shipped. `face()` snaps to the nearest that
 * exists, and the test beside this file checks each entry against the files on disk.
 */
export const FACES: Partial<Record<FaceKey, string>> = {
  '400-100': 'Archivo-400-100',
  '400-96': 'Archivo-400-96',
  '400-94': 'Archivo-400-94',
  '400-92': 'Archivo-400-92',
  '400-90': 'Archivo-400-90',
  '400-88': 'Archivo-400-88',
  '400-80': 'Archivo-400-80',
  '400-76': 'Archivo-400-76',
  '500-96': 'Archivo-500-96',
  '400-100-Italic': 'Archivo-400-100-Italic',
  '400-94-Italic': 'Archivo-400-94-Italic',
  '400-88-Italic': 'Archivo-400-88-Italic',
  '400-80-Italic': 'Archivo-400-80-Italic',
  '400-76-Italic': 'Archivo-400-76-Italic',
};

/** What `expo-font` loads at launch. */
export const FONT_ASSETS: Record<string, number> = {
  'Archivo-400-100': require('../../assets/fonts/Archivo-400-100.ttf'),
  'Archivo-400-96': require('../../assets/fonts/Archivo-400-96.ttf'),
  'Archivo-400-94': require('../../assets/fonts/Archivo-400-94.ttf'),
  'Archivo-400-92': require('../../assets/fonts/Archivo-400-92.ttf'),
  'Archivo-400-90': require('../../assets/fonts/Archivo-400-90.ttf'),
  'Archivo-400-88': require('../../assets/fonts/Archivo-400-88.ttf'),
  'Archivo-400-80': require('../../assets/fonts/Archivo-400-80.ttf'),
  'Archivo-400-76': require('../../assets/fonts/Archivo-400-76.ttf'),
  'Archivo-500-96': require('../../assets/fonts/Archivo-500-96.ttf'),
  'Archivo-400-100-Italic': require('../../assets/fonts/Archivo-400-100-Italic.ttf'),
  'Archivo-400-94-Italic': require('../../assets/fonts/Archivo-400-94-Italic.ttf'),
  'Archivo-400-88-Italic': require('../../assets/fonts/Archivo-400-88-Italic.ttf'),
  'Archivo-400-80-Italic': require('../../assets/fonts/Archivo-400-80-Italic.ttf'),
  'Archivo-400-76-Italic': require('../../assets/fonts/Archivo-400-76-Italic.ttf'),
};

/**
 * Falls back one step narrower rather than failing, because a missing instance should look
 * slightly wrong rather than render nothing. Never reached when the fonts are generated.
 */
const FALLBACK: Width[] = [100, 96, 94, 92, 90, 88, 80, 76];

/** The family every fallback ends at. It is always generated. */
const ROOT_FACE = 'Archivo-400-100';

export function face(width: Width, options: { weight?: Weight; italic?: boolean } = {}): string {
  const weight = options.weight ?? 400;
  const italic = options.italic ?? false;

  const direct = FACES[`${weight}-${width}${italic ? '-Italic' : ''}` as FaceKey];
  if (direct) return direct;

  // Italic is drawn at fewer widths than upright, and 500 exists at one width only. Snap to
  // the nearest generated instance rather than dropping the slant, which would lose the one
  // thing the style is carrying.
  let nearest: string | undefined;
  let bestDistance = Infinity;
  for (const w of FALLBACK) {
    const candidate = FACES[`${weight}-${w}${italic ? '-Italic' : ''}` as FaceKey];
    if (!candidate) continue;
    const distance = Math.abs(w - width);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = candidate;
    }
  }
  return nearest ?? FACES['400-100'] ?? ROOT_FACE;
}

/**
 * A text style for material.
 *
 * `letterSpacing` is given in **em** here and converted, because that is how the prototype
 * states it and how it scales with size — React Native takes points.
 */
export function type(spec: {
  size: number;
  width: Width;
  lineHeight?: number;
  /** In em, as the prototype writes it. */
  tracking?: number;
  weight?: Weight;
  italic?: boolean;
  color?: string;
}): TextStyle {
  const style: TextStyle = {
    fontFamily: face(spec.width, { weight: spec.weight, italic: spec.italic }),
    fontSize: spec.size,
  };
  if (spec.lineHeight !== undefined) style.lineHeight = spec.size * spec.lineHeight;
  if (spec.tracking !== undefined) style.letterSpacing = spec.size * spec.tracking;
  if (spec.color !== undefined) style.color = spec.color;
  return style;
}
