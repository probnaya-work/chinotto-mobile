/**
 * Traces — what else in the record touches this Line, and how sure the product is about it.
 *
 * The epistemic split is the whole feature and is not negotiable:
 *
 *   * **seen** — the two share an actual run of words. The interface says `same words`, shows
 *     the run highlighted in context, and does not ask.
 *   * **guess** — they share vocabulary but no phrase. The interface says `a guess`, sets it
 *     in italic, and offers `yes · not this`. A guess must never be dressed up as a fact.
 *
 * A port of `traces()` from the shared `chinotto-data.js`, extended with the two things the
 * durable model has and the prototype's in-memory version did not: same-source encounters
 * (desktop's `same_source`) and persisted judgements. A `not this` is a decision a person
 * made, so it is canonical and survives every recomputation.
 */

import { displayText, isEncounter, type Material } from './material';
import { sharedCount, sharedRun, tokens } from './words';

export type TraceKind = 'seen' | 'same_source' | 'guess';

export type Trace = {
  material: Material;
  kind: TraceKind;
  /** The shared run, for `seen`. Null for a guess — there is no phrase to show. */
  phrase: string | null;
  /** Why a guess was made, in the product's own words. */
  why: string | null;
};

/** Distinct vocabulary overlap below which nothing is even guessed at. */
export const MIN_GUESS_OVERLAP = 3;
/** How many traces are computed before ranking. The interface shows fewer. */
export const MAX_TRACES = 6;

export type TracesInput = {
  /** The Line in focus, oldest first. */
  line: Material[];
  /** Everything else the record holds. */
  material: Material[];
  /** `fragmentId -> relatedId -> judgement`, from `trace_judgements`. */
  judgements?: Record<string, 'confirmed' | 'rejected'> | null;
};

export function traces({ line, material, judgements = null }: TracesInput): Trace[] {
  const inLine = new Set(line.map((m) => m.id));
  const lineTokens = line.map((m) => tokens(displayText(m)));
  const lineUrlKeys = new Set(line.map((m) => m.urlKey).filter((k): k is string => Boolean(k)));

  const out: Trace[] = [];
  const seenText = new Set<string>();

  for (const candidate of material) {
    if (inLine.has(candidate.id)) continue;
    if (candidate.removedAt !== null) continue;
    if (judgements?.[candidate.id] === 'rejected') continue;

    // The same words twice in the record are one trace, not two.
    const key = displayText(candidate).toLowerCase();
    if (key && seenText.has(key)) continue;
    if (key) seenText.add(key);

    // Having met the same source is observed, not inferred — it outranks language.
    if (isEncounter(candidate) && candidate.urlKey && lineUrlKeys.has(candidate.urlKey)) {
      out.push({
        material: candidate,
        kind: 'same_source',
        phrase: null,
        why: candidate.domain ? `the same source · ${candidate.domain}` : 'the same source',
      });
      continue;
    }

    const tc = tokens(displayText(candidate));
    if (tc.length < 3) continue;

    let run: ReturnType<typeof sharedRun> = null;
    let count = 0;
    for (const t of lineTokens) {
      const r = sharedRun(tc, t);
      if (r && (!run || r.len > run.len)) run = r;
      count = Math.max(count, sharedCount(tc, t));
    }

    if (run) {
      out.push({ material: candidate, kind: 'seen', phrase: run.a, why: null });
    } else if (count >= MIN_GUESS_OVERLAP) {
      out.push({
        material: candidate,
        kind: 'guess',
        phrase: null,
        why: `${count} shared words, no shared phrase`,
      });
    }
  }

  // Observed before inferred; within each, most recent first.
  const rank = (k: TraceKind) => (k === 'seen' ? 0 : k === 'same_source' ? 1 : 2);
  out.sort((a, b) =>
    rank(a.kind) === rank(b.kind)
      ? b.material.at - a.material.at
      : rank(a.kind) - rank(b.kind)
  );

  return out.slice(0, MAX_TRACES);
}

/** `traces · 2 seen, 1 guessed` — the header, which always states the mix. */
export function tracesHeading(list: Trace[]): string {
  const seen = list.filter((t) => t.kind === 'seen' || t.kind === 'same_source').length;
  const guessed = list.filter((t) => t.kind === 'guess').length;
  return `traces · ${seen} seen, ${guessed} guessed`;
}
