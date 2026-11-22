/**
 * Find.
 *
 * Typing `/` turns the capture field into Find and the record filters live underneath. There
 * is no Find surface and no results page: the record is the results, arranged by distance as
 * it always is.
 *
 * Literal search filters the record. When it finds nothing, related-word suggestions may
 * offer material sharing vocabulary with the query. These are not semantic matches.
 */

import { displayText, hay, type Material } from './material';
import { dayLabel, monthLabel, MS_DAY } from './time';
import { sharedCount, tokens } from './words';

/** Find is a mode of the capture field, entered with a leading slash. */
export const FIND_PREFIX = '/';

export type FindState =
  | { mode: 'capture' }
  | { mode: 'find'; query: string; active: boolean };

/**
 * Reads the capture field. `active` is false for a bare `/` — the mode has been entered but
 * there is nothing to look for yet, so the record is not filtered.
 */
export function readField(input: string): FindState {
  if (!input.startsWith(FIND_PREFIX)) return { mode: 'capture' };
  const query = input.slice(1).trim().toLowerCase();
  return { mode: 'find', query, active: query.length > 0 };
}

/** Literal substring, over body, title, domain and any quotation. */
export function findInWords(material: Material[], query: string): Material[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return material.filter((m) => m.removedAt === null && hay(m).includes(q));
}

export type Guess = {
  material: Material;
  /** How many distinct substantial words it shares with the query. */
  overlap: number;
  when: string;
};

/** How many guesses the empty state offers. Three, as drawn. */
export const MAX_GUESSES = 3;

/**
 * Ranked by shared vocabulary, then by recency. A suggestion must have word evidence;
 * an unrelated record is never substituted when there is nothing to offer.
 */
export function guessFor(
  query: string,
  material: Material[],
  now: number,
  rejected: Record<string, boolean> = {}
): Guess[] {
  const tq = tokens(query);
  const live = material.filter((m) => m.removedAt === null && !rejected[m.id]);

  const scored = live
    .filter((m) => displayText(m))
    .map((m) => ({ material: m, overlap: sharedCount(tq, tokens(displayText(m))) }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.material.at - a.material.at);

  return scored.slice(0, MAX_GUESSES).map(({ material: m, overlap }) => ({
    material: m,
    overlap,
    when: now - m.at < 7 * MS_DAY ? dayLabel(m.at, now) : monthLabel(m.at, now),
  }));
}

/** The count always describes the literal matches actually shown in the record. */
export function findSummary(count: number): string {
  return `${count} · in words`;
}
