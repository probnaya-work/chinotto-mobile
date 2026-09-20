/**
 * A Line.
 *
 * Not an entity. A Line is the transitive closure of `continuations` edges, which is why
 * there is no `lines` table, nothing to name, nothing to manage and nothing to delete. It
 * comes into being only when someone continues a moment, and it ends when they stop.
 *
 * Because `continuations.fragment_id` is a primary key, a fragment continues at most one
 * earlier fragment: the closure is always a chain, never a graph. Everything here relies on
 * that and none of it tries to cope with a branch, because a branch cannot exist.
 */

import type { Material } from './material';
import { dayLabel, fullDate, monthLabel } from './time';

/** Oldest first — a Line is read in the order it was lived. */
export function lineOf(focus: Material, material: Material[]): Material[] {
  if (!focus.lineId) return [focus];
  return material
    .filter((m) => m.lineId === focus.lineId && m.removedAt === null)
    .sort((a, b) => a.at - b.at);
}

/** `a fragment · 12 mar 2024` / `a line · 7 moments · 2019 → today`. */
export function lineHeading(line: Material[], focus: Material, now: number): string {
  if (line.length <= 1) return `a fragment · ${fullDate(focus.at)}`;
  const first = line[0];
  const last = line[line.length - 1];
  const endsToday = dayLabel(last.at, now) === 'today';
  return `a line · ${line.length} moments · ${new Date(first.at).getFullYear()} → ${
    endsToday ? 'today' : new Date(last.at).getFullYear()
  }`;
}

/** The meta a D0 row shows for a line: `↳ a line · 7 moments · since mar 2023`. */
export function lineMeta(line: Material[], now: number): string | null {
  if (line.length <= 1) return null;
  const earliest = Math.min(...line.map((m) => m.at));
  return `↳ a line · ${line.length} moments · since ${monthLabel(earliest, now, true)}`;
}

/** A fold marker in place of the middle of a long line. */
export type Fold = { kind: 'fold'; count: number; label: string };
export type LineEntry = { kind: 'moment'; material: Material } | Fold;

/** Lines longer than this fold in the middle rather than scrolling forever. */
export const FOLD_THRESHOLD = 5;
/** How many moments stay visible at each end. */
export const FOLD_HEAD = 2;
export const FOLD_TAIL = 2;

/**
 * Head, fold, tail — 2 and 2, as the prototype draws it. The fold names the span it hides
 * so what is missing is stated rather than merely absent.
 */
export function foldLine(line: Material[], now: number, unfolded: boolean): LineEntry[] {
  if (unfolded || line.length <= FOLD_THRESHOLD) {
    return line.map((material) => ({ kind: 'moment' as const, material }));
  }
  const hidden = line.length - FOLD_HEAD - FOLD_TAIL;
  const from = line[FOLD_HEAD];
  const to = line[line.length - FOLD_TAIL - 1];
  return [
    ...line.slice(0, FOLD_HEAD).map((material) => ({ kind: 'moment' as const, material })),
    {
      kind: 'fold' as const,
      count: hidden,
      label: `${hidden} folded · ${monthLabel(from.at, now, true)} – ${monthLabel(to.at, now, true)}`,
    },
    ...line.slice(-FOLD_TAIL).map((material) => ({ kind: 'moment' as const, material })),
  ];
}
