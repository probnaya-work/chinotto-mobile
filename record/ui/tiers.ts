/**
 * The prototype's five tiers, revised after the first device readability feedback.
 *
 * Each tier moves four things at once — size, width, ink and how many lines survive — so
 * that distance is legible before anything is read. The width, ink and clamp hierarchy stays
 * intact while the minimum sizes and breathing room are raised for a phone held at a natural
 * distance. D3 and D4 remain identical on mobile. See `docs/unspecified-decisions.md` §3.3.
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
  0: { size: 21, lineHeight: 1.28, tracking: -0.01, width: 100, color: ink.ink, clamp: 4, gap: 18, marginBottom: 22 },
  1: { size: 17, lineHeight: 1.3, width: 88, color: ink.far, clamp: 2, gap: 9, marginBottom: 22 },
  2: { size: 15, lineHeight: 1.3, width: 80, color: ink.dim, clamp: 1, gap: 7, marginBottom: 18 },
  3: { size: 14, lineHeight: 1.3, width: 76, color: ink.meta, clamp: 1, gap: 6, marginBottom: 16 },
  4: { size: 14, lineHeight: 1.3, width: 76, color: ink.meta, clamp: 1, gap: 6, marginBottom: 16 },
};

/** A small lift for the thought currently standing at the centre of the record. */
export const FOCUSED_TIER_COLORS: Record<Tier, string> = {
  0: '#e9e7e0',
  1: '#d8d6cf',
  2: '#cbc9c2',
  3: '#b8b6af',
  4: '#b8b6af',
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
  options: { voice?: boolean; borrowedWords?: boolean; focused?: boolean } = {}
): TextStyle {
  const spec = TIERS[tier];
  const quieted = tier === 0 && (options.voice || options.borrowedWords);
  const color = options.focused
    ? quieted
      ? FOCUSED_TIER_COLORS[1]
      : FOCUSED_TIER_COLORS[tier]
    : quieted
      ? ink.far
      : spec.color;
  return typeStyle({
    size: spec.size,
    width: spec.width,
    lineHeight: spec.lineHeight,
    tracking: spec.tracking,
    italic: options.voice,
    color,
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

/** The voice chip beside a moment: full size at D0, a compact variant below it. */
export const voiceChip = {
  d0: { fontSize: 13, paddingTop: 2, paddingBottom: 2, paddingLeft: 7, paddingRight: 9, marginRight: 8 },
  compact: { fontSize: 12, paddingTop: 1, paddingBottom: 1, paddingLeft: 6, paddingRight: 6, marginRight: 7 },
} as const;
