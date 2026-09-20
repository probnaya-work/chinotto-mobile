/**
 * Find.
 *
 * Typing `/` turns the capture field into Find and the record filters live underneath. There
 * is no Find surface and no results page: the record is the results, arranged by distance as
 * it always is.
 *
 * Two readings, and the interface names which one it is doing:
 *   * **in words** — the literal substring, over everything retrievable.
 *   * **by meaning** — shared vocabulary, ranked. Offered when the words find nothing, and
 *     always labelled as a guess.
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
 * `nothing with those words. close in meaning, maybe:`
 *
 * Ranked by shared vocabulary, then by recency. When nothing shares anything at all the
 * prototype falls back to showing something rather than an empty surface — a deliberate
 * choice that the interface covers by setting every guess in italic and offering `not this`.
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

  const chosen = scored.length
    ? scored.slice(0, MAX_GUESSES)
    : live
        .filter((m) => m.method === 'typed' && m.body.length > 20)
        .slice(0, MAX_GUESSES)
        .map((m) => ({ material: m, overlap: 0 }));

  return chosen.map(({ material: m, overlap }) => ({
    material: m,
    overlap,
    when: now - m.at < 7 * MS_DAY ? dayLabel(m.at, now) : monthLabel(m.at, now),
  }));
}

/** `12 · in words` / `12 · by meaning` — the count beside the field. */
export function findSummary(count: number, byMeaning: boolean): string {
  return `${count} · ${byMeaning ? 'by meaning' : 'in words'}`;
}
