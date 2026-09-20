/**
 * The five tiers, exactly as the prototype's `STY` table gives them.
 *
 * Each tier moves four things at once — size, width, ink and how many lines survive — so
 * that distance is legible before anything is read. D3 and D4 are identical on mobile; that
 * is the prototype's own reading, and it differs from desktop, which draws five distinct
 * steps. See `docs/unspecified-decisions.md` §3.3.
 */

import type { TextStyle, ViewStyle } from 'react-native';

import { ink } from './tokens';
import { type as typeStyle, type Width } from './type';
import type { Tier } from '../model/bands';

export type TierSpec = {
  size: number;
  lineHeight: number;
  /** In em, as the prototype writes it. */
  tracking?: number;
  width: Width;
  color: string;
  /** Lines before the text is cut. `null` = as many as it takes. */
  clamp: number | null;
  /** Between moments inside a band. */
  gap: number;
  /** Below the band. */
  marginBottom: number;
};

export const TIERS: Record<Tier, TierSpec> = {
  0: { size: 20, lineHeight: 1.28, tracking: -0.01, width: 100, color: ink.ink, clamp: 4, gap: 18, marginBottom: 22 },
  1: { size: 14, lineHeight: 1.3, width: 88, color: ink.far, clamp: 2, gap: 8, marginBottom: 22 },
  2: { size: 12, lineHeight: 1.3, width: 80, color: ink.dim, clamp: 1, gap: 5, marginBottom: 18 },
  3: { size: 12, lineHeight: 1.3, width: 76, color: ink.meta, clamp: 1, gap: 4, marginBottom: 16 },
  4: { size: 12, lineHeight: 1.3, width: 76, color: ink.meta, clamp: 1, gap: 4, marginBottom: 16 },
};

/**
 * The text style for a moment at a tier.
 *
 * Voice is italic at every tier, and one ink step quieter at D0 — what a machine heard is
 * shown as what a machine heard. An encounter nobody has worded yet is quieted the same way,
 * because the words on screen are the page's, not the person's.
 */
export function tierTextStyle(
  tier: Tier,
  options: { voice?: boolean; borrowedWords?: boolean } = {}
): TextStyle {
  const spec = TIERS[tier];
  const quieted = tier === 0 && (options.voice || options.borrowedWords);
  return typeStyle({
    size: spec.size,
    width: spec.width,
    lineHeight: spec.lineHeight,
    tracking: spec.tracking,
    italic: options.voice,
    color: quieted ? ink.far : spec.color,
  });
}

/** `numberOfLines` for a tier. D0 opens up once selected. */
export function tierClamp(tier: Tier, selected = false): number | undefined {
  if (tier === 0 && selected) return undefined;
  return TIERS[tier].clamp ?? undefined;
}

export function bandStyle(tier: Tier): ViewStyle {
  return { marginBottom: TIERS[tier].marginBottom };
}

export function bandGap(tier: Tier): number {
  return TIERS[tier].gap;
}

/** The voice chip beside a moment: full size at D0, an 11px variant below it. */
export const voiceChip = {
  d0: { fontSize: 12, paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 8, marginRight: 8 },
  compact: { fontSize: 10, paddingTop: 0, paddingBottom: 0, paddingLeft: 5, paddingRight: 5, marginRight: 6 },
} as const;
