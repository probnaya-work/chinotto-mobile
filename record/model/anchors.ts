/**
 * Standing somewhere other than the edge.
 *
 * Temporal movement is typed, not navigated: `march 2024`, `mar 2024`, `2019`, `today`, `now`
 * go into the capture field and `⏎` stands you there. A faithful port of `parseAnchor()` from
 * the shared `chinotto-data.js`.
 *
 * The three-way return is load-bearing and is preserved rather than flattened:
 *   * an `Anchor`  — this is a date; stand there
 *   * `null`       — this is a date meaning *now*; go back to the edge
 *   * `undefined`  — this is not a date; it is something someone wrote, so keep it
 *
 * Collapsing the last two would make `today` capture the word "today" or, worse, make an
 * ordinary sentence silently move the record instead of landing in it.
 */

import { lastMonthWithData } from './bands';
import type { Material } from './material';
import { MONTHS, MONTHS_FULL } from './time';

export type Anchor = { y: number; m: number };

/** `undefined` = not a date. `null` = the edge. */
export type ParsedAnchor = Anchor | null | undefined;

export function parseAnchor(text: string): ParsedAnchor {
  const s = text.trim().toLowerCase();
  if (s === 'today' || s === 'now') return null;

  const monthYear = s.match(/^([a-z]+)\s+(20\d\d)$/);
  if (monthYear) {
    const word = monthYear[1];
    const mi = MONTHS.indexOf(word.slice(0, 3) as (typeof MONTHS)[number]);
    // Accept the three-letter form outright, and a longer word only when it is genuinely a
    // prefix of the month's name — so `mar 2024` and `march 2024` stand, and `martian 2024`
    // is a sentence.
    if (mi >= 0 && (MONTHS_FULL[mi].startsWith(word) || word.length === 3)) {
      return { y: Number(monthYear[2]), m: mi };
    }
  }

  const bareYear = s.match(/^(20\d\d)$/);
  if (bareYear) return { y: Number(bareYear[1]), m: -1 };

  return undefined;
}

/**
 * Resolves a bare year (`m === -1`) to the last month that actually holds something, so
 * typing `2019` lands where the record has material rather than in an empty january.
 */
export function resolveAnchor(anchor: Anchor, material: Material[]): Anchor {
  if (anchor.m >= 0) return anchor;
  return { y: anchor.y, m: lastMonthWithData(material, anchor.y) };
}

/**
 * The label for where you are standing: `mar 2024`, in the prototype's short form.
 *
 * Note that mobile draws no live `⏎ stand in march 2024` hint while you type, where desktop
 * does. That is the mobile prototype's own reading and is not corrected here.
 */
export function anchorLabel(anchor: Anchor): string {
  return `${MONTHS[anchor.m] ?? MONTHS[0]} ${anchor.y}`;
}
