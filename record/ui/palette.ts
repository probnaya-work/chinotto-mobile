import * as dark from './tokens';
import light from './lightPalette.json';

export type Appearance = 'dark' | 'light';
type Tones<T> = { [K in keyof T]: T[K] extends string ? string : T[K] };
export type Palette = {
  mode: Appearance; SURFACE: string; SURFACE_OUTER: string; LIVE: string; veil: string;
  ink: Tones<typeof dark.ink>; agency: Tones<typeof dark.agency>; evidence: Tones<typeof dark.evidence>;
  rule: Tones<typeof dark.rule>; wash: Tones<typeof dark.wash>; bandLabel: Tones<typeof dark.bandLabel>;
  focused: Record<number, string>;
};
export function paletteFor(mode: Appearance, contrast = false): Palette {
  const ink = mode === 'dark' ? { ...dark.ink } : {
    ink: light.ink, near: light.near, quoted: light.quoted, far: light.far, dim: light.dim,
    meta: light.meta, faint: light.faint, placeholder: light.placeholder,
  };
  if (contrast) Object.assign(ink, mode === 'dark'
    ? { far: '#c6c6c3', dim: '#bcbbb7', meta: '#a3a29c', faint: '#8b8a85' }
    : { far: '#454439', dim: '#524e41', meta: '#5e574a', faint: '#5e574a' });
  const agency = mode === 'dark' ? dark.agency : {
    ink: light.agency, quiet: light.agencyQuiet, ground: light.surface, weight: dark.agency.weight,
  };
  return {
    mode, ink, agency,
    SURFACE: mode === 'dark' ? dark.SURFACE : light.surface,
    SURFACE_OUTER: mode === 'dark' ? dark.SURFACE_OUTER : light.surfaceDeep,
    LIVE: mode === 'dark' ? dark.LIVE : light.live,
    veil: mode === 'dark' ? 'rgba(14,14,16,0.72)' : 'rgba(228,222,211,0.78)',
    evidence: mode === 'dark' ? dark.evidence : { ground: light.evidenceGround, groundTrace: light.evidenceTrace,
      ink: light.evidenceInk, rail: light.evidenceRail, railInferred: light.evidenceInferred },
    rule: mode === 'dark' ? dark.rule : { line: light.rule, hair: light.hair, chip: light.chip, chipInert: light.chipInert },
    wash: mode === 'dark' ? dark.wash : { match: light.evidenceGround, matchTrace: light.evidenceTrace,
      selected: light.rowSelected, selection: light.selection },
    bandLabel: { ...dark.bandLabel, color: mode === 'dark'
      ? (contrast ? '#c0cbb9' : dark.bandLabel.color)
      : (contrast ? '#374333' : '#505c4b') },
    focused: mode === 'dark' ? { 0: '#e9e7e0', 1: '#d8d6cf', 2: '#cbc9c2', 3: '#b8b6af', 4: '#b8b6af' }
      : Object.fromEntries(light.focused.map((color, index) => [index, color])),
  };
}
