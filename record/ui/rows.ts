/**
 * Flattening the record into rows an inverted list can virtualize.
 *
 * The prototype draws the record as nested boxes: a scroller in `column-reverse` holding
 * bands, each of which is itself a `column-reverse` box holding its moments with its label
 * last. That reverses twice and reads, top to bottom: the oldest band first, each band
 * labelled above its material, oldest moment to newest inside it, down to the newest moment
 * sitting against the capture edge.
 *
 * A nested tree like that cannot be windowed: measuring one band means measuring every
 * moment in it, so a year with four hundred moments is a single list item. So the tree is
 * flattened here into one array of rows, in the prototype's own DOM order, and rendered by
 * an inverted `FlatList` — which draws index 0 at the bottom. Index 0 is therefore the
 * Return, exactly where the prototype puts it: at the edge.
 *
 * The surface is identical. Only the tree is different. See `docs/unspecified-decisions.md`
 * §2.2.
 */

import type { Material } from '../model/material';
import type { Anchor, RecordBand, Tier, YearSummary } from '../model/bands';
import { monthLabel } from '../model/time';
import { TIERS } from './tiers';

export type Row =
  /** The one Return, at the edge. */
  | { kind: 'return'; key: string }
  /** Kept present, above the record. */
  | { kind: 'held'; key: string; material: Material }
  /** `type anything, or hold the circle and talk. it lands here, and stays.` */
  | { kind: 'empty'; key: string }
  /** `nothing with those words. close in meaning, maybe:` and its guesses. */
  | { kind: 'findEmpty'; key: string }
  | {
      kind: 'moment';
      key: string;
      tier: Tier;
      material: Material;
      /** Space below this row, inside its band. */
      gap: number;
    }
  | { kind: 'bandLabel'; key: string; tier: Tier; label: string; opensYears: boolean }
  | { kind: 'years'; key: string; years: YearSummary[] }
  /** `the record begins here · nov 2020`, at the very top. */
  | { kind: 'begins'; key: string; label: string };

export type FlattenInput = {
  bands: RecordBand[];
  /** Shown only at the edge, with nothing typed. */
  showReturn: boolean;
  held: Material[];
  isEmptyRecord: boolean;
  findFoundNothing: boolean;
  /** `the record begins here · …`, or null when it should not be drawn. */
  beginsLabel: string | null;
  /** Where you are standing, if you are. Needed for D0's label; see `bandLabelFor`. */
  anchor?: Anchor | null;
  now?: number;
};

/**
 * Bottom-up: index 0 is drawn against the capture edge, the last index at the top of the
 * scroll. This is the prototype's DOM order unchanged.
 */
export function flattenRecord({
  bands,
  showReturn,
  held,
  isEmptyRecord,
  findFoundNothing,
  beginsLabel,
  anchor = null,
  now = Date.now(),
}: FlattenInput): Row[] {
  const rows: Row[] = [];

  if (showReturn) rows.push({ kind: 'return', key: 'return' });
  for (const h of held) rows.push({ kind: 'held', key: `held:${h.id}`, material: h });
  if (isEmptyRecord) rows.push({ kind: 'empty', key: 'empty' });
  if (findFoundNothing) rows.push({ kind: 'findEmpty', key: 'find-empty' });

  for (const band of bands) {
    if (band.type === 'years') {
      rows.push({ kind: 'years', key: band.key, years: band.years });
      continue;
    }

    const spec = TIERS[band.D];
    // Newest first, matching the band's own `column-reverse`: the newest moment ends up
    // lowest on screen, against the edge.
    band.items.forEach((material, i) => {
      rows.push({
        kind: 'moment',
        key: material.id,
        tier: band.D,
        material,
        // The gap sits between moments, not after the last one; the band's own bottom
        // margin does that job.
        gap: i === band.items.length - 1 ? spec.marginBottom : spec.gap,
      });
    });

    const label = bandLabelFor(band, anchor, now);
    if (label) {
      rows.push({
        kind: 'bandLabel',
        key: `label:${band.key}`,
        tier: band.D,
        // D2 and below carry `↑` — the label is how you reach the years overlay.
        label: band.D >= 2 ? `${label}  ↑` : label,
        opensYears: band.D >= 2,
      });
    }
  }

  if (beginsLabel) rows.push({ kind: 'begins', key: 'begins', label: beginsLabel });

  return rows;
}

/**
 * A band's label.
 *
 * At the edge, D0 has none: "now" does not need naming, and the model returns no label for
 * it. While standing, D0 is a month like any other and says which one, and how much is
 * there — `mar 2024 · 17`. That label is composed here rather than in the model because it
 * counts the band's own contents, which only exist once the band is built.
 *
 * Every other tier joins up to three of its own labels: a band that runs across three days
 * says so rather than naming only the first.
 */
export function bandLabelFor(
  band: Extract<RecordBand, { type: 'band' }>,
  anchor: Anchor | null,
  now: number
): string {
  if (anchor && band.D === 0) {
    const first = band.items[0];
    if (!first) return '';
    return `${monthLabel(first.at, now, true)} · ${band.items.length}`;
  }
  return band.labels.slice(0, 3).join(' · ');
}
