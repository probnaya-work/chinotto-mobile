/**
 * How the Record arranges itself by distance.
 *
 * A faithful port of `bandsFor()` from the prototype's shared `chinotto-data.js`, including
 * the detail that makes it a record rather than a feed: it walks the time-sorted list and
 * opens a new band **whenever the level changes**, so the same tier can appear more than once
 * with different labels and the reading order stays strictly chronological. A fixed block per
 * tier would reorder material whenever a boundary fell mid-run.
 *
 * There are no per-tier caps, on purpose. The surface is everything; only the *rendering* is
 * bounded (see `record/ui/`, and decision 2.1–2.2 in `docs/unspecified-decisions.md`).
 */

import { firstLine, hay, type Material } from './material';
import { dayLabel, monthLabel, MS_DAY, MS_HOUR, sameDay, startOfDay } from './time';

/** D0…D4. Level 5 is not a tier — it is the years band. */
export type Tier = 0 | 1 | 2 | 3 | 4;
export const YEARS_LEVEL = 5;

/** Where you are standing, when you are not standing at the edge. */
export type Anchor = { y: number; m: number };

export type Band = {
  type: 'band';
  key: string;
  D: Tier;
  /** Distinct labels of the material in this band, in the order they appeared. */
  labels: string[];
  items: Material[];
};

export type YearSummary = {
  y: number;
  /** Count per calendar month, 12 entries. */
  months: number[];
  /** Up to five opening lines, for the run a year row shows. */
  first: string[];
  count: number;
};

export type YearsBand = {
  type: 'years';
  key: string;
  years: YearSummary[];
};

export type RecordBand = Band | YearsBand;

export type BandsInput = {
  material: Material[];
  now: number;
  /** Standing somewhere, rather than at the edge. */
  anchor?: Anchor | null;
  /** Find, lowercased. Empty or absent means no filtering. */
  query?: string | null;
  /** Ids to withhold from the record — currently held material, which sits above it. */
  exclude?: Record<string, boolean> | null;
};

/**
 * The tier a moment falls in.
 *
 * At the edge this is distance from now. While standing it is distance in months from where
 * you stand, which is why banding re-measures rather than re-filtering: standing in march
 * 2024 should show march 2024 the way today shows today.
 */
export function levelOf(at: number, now: number, anchor?: Anchor | null): Tier | typeof YEARS_LEVEL {
  if (anchor) {
    const d = new Date(at);
    const dm = Math.abs(anchor.y * 12 + anchor.m - (d.getFullYear() * 12 + d.getMonth()));
    if (dm === 0) return 0;
    if (dm === 1) return 1;
    if (dm <= 3) return 2;
    if (dm <= 8) return 3;
    if (dm <= 14) return 4;
    return YEARS_LEVEL;
  }

  const dt = now - at;
  if (dt < 8 * MS_HOUR) return 0;
  // Today or yesterday, by the calendar rather than by elapsed time: something written at
  // 23:50 yesterday is yesterday's at 00:10 today, not "7 hours ago".
  if (at >= startOfDay(now) - MS_DAY) return 1;
  if (dt < 7 * MS_DAY) return 2;
  if (dt < 60 * MS_DAY) return 3;
  if (dt < 180 * MS_DAY) return 4;
  return YEARS_LEVEL;
}

function labelFor(at: number, level: Tier, now: number, anchor?: Anchor | null): string | null {
  if (anchor) return level === 0 ? null : monthLabel(at, now, true);
  if (level === 0) return null;
  if (level === 1) return sameDay(at, now) ? 'earlier today' : 'yesterday';
  if (level === 2) return dayLabel(at, now);
  return monthLabel(at, now);
}

/** Groups material into the sequence of bands the record draws, newest first. */
export function bandsFor({
  material,
  now,
  anchor = null,
  query = null,
  exclude = null,
}: BandsInput): RecordBand[] {
  let items = exclude ? material.filter((m) => !exclude[m.id]) : material.slice();
  const q = query?.trim().toLowerCase();
  if (q) items = items.filter((m) => hay(m).includes(q));
  items.sort((a, b) => b.at - a.at);

  const bands: RecordBand[] = [];
  let cur: RecordBand | null = null;

  for (const m of items) {
    const level = levelOf(m.at, now, anchor);

    if (level === YEARS_LEVEL) {
      const d = new Date(m.at);
      const y = d.getFullYear();
      if (!cur || cur.type !== 'years') {
        cur = { type: 'years', years: [], key: `Y${m.at}` };
        bands.push(cur);
      }
      let yr = cur.years.find((x) => x.y === y);
      if (!yr) {
        yr = { y, months: new Array<number>(12).fill(0), first: [], count: 0 };
        cur.years.push(yr);
      }
      yr.months[d.getMonth()] += 1;
      yr.count += 1;
      if (yr.first.length < 5) yr.first.push(firstLine(m));
    } else {
      const label = labelFor(m.at, level, now, anchor);
      if (!cur || cur.type !== 'band' || cur.D !== level) {
        cur = { type: 'band', D: level, labels: [], items: [], key: `B${level}${m.at}` };
        bands.push(cur);
      }
      if (label && !cur.labels.includes(label)) cur.labels.push(label);
      cur.items.push(m);
    }
  }

  return bands;
}

/** Every year the record touches, newest first, with its per-month counts. */
export function yearsSummary(material: Material[]): { y: number; months: number[]; count: number }[] {
  const map = new Map<number, { y: number; months: number[]; count: number }>();
  for (const m of material) {
    const d = new Date(m.at);
    const y = d.getFullYear();
    let row = map.get(y);
    if (!row) {
      row = { y, months: new Array<number>(12).fill(0), count: 0 };
      map.set(y, row);
    }
    row.months[d.getMonth()] += 1;
    row.count += 1;
  }
  return [...map.values()].sort((a, b) => b.y - a.y);
}

/** Which month a bare year stands you in: the last one that holds anything. */
export function lastMonthWithData(material: Material[], year: number): number {
  let best = -1;
  for (const m of material) {
    const d = new Date(m.at);
    if (d.getFullYear() === year && d.getMonth() > best) best = d.getMonth();
  }
  return best < 0 ? 0 : best;
}

/**
 * Year-bar heights, in points. Absolute rather than relative to each year's own busiest
 * month, so a bar means the same thing in 2021 as in 2026 and years are comparable at a
 * glance.
 *
 * The prototype draws the bars at two sizes — smaller inside the record's years band, larger
 * in the years overlay — and they are not the same curve, so both are kept.
 */
export const yearBarHeight = {
  /** In the record's own years band: 4pt wide. */
  inline: (count: number): number => (count ? 2 + Math.min(10, count * 1.2) : 2),
  /** In the years overlay: 6pt wide. */
  overlay: (count: number): number => (count ? 3 + Math.min(13, count * 1.2) : 3),
};
