/**
 * The continuation offer.
 *
 * In the twelve seconds after something lands, the record may ask once whether it continues
 * something recent: `continues "…"? yes · no`. Saying yes creates a `continuations` edge —
 * which is the only way a Line ever comes into being besides an explicit Continue.
 *
 * A faithful port of `suggestContinuation()` from the shared `chinotto-data.js`, with
 * desktop's two numbers (their decision 0.6): three days of lookback, and a score of at least
 * two where a shared run counts double.
 *
 * The offer is a question, never an action. Nothing is linked without the answer, and `no`
 * is not remembered as a judgement — it just closes the offer.
 */

import { displayText, firstLine, hasNoWordsYet, type Material } from './material';
import { dayLabel, MS_DAY } from './time';
import { sharedCount, sharedRun, tokens } from './words';

/** How far back the offer will look. */
export const LOOKBACK_MS = 3 * MS_DAY;
/** The score below which nothing is offered. */
export const MIN_SCORE = 2;

export type ContinuationOffer = {
  id: string;
  score: number;
  /** The opening line of what it might continue, for the offer's quotation. */
  text: string;
  /** When that was, for the offer's wording. */
  when: string;
};

export function suggestContinuation(
  fragment: Material,
  material: Material[],
  now: number
): ContinuationOffer | null {
  const tf = tokens(displayText(fragment));
  // One word is not enough to be a continuation of anything.
  if (tf.length < 2) return null;

  let best: ContinuationOffer | null = null;

  for (const candidate of material) {
    if (candidate.id === fragment.id) continue;
    if (candidate.removedAt !== null) continue;
    if (now - candidate.at > LOOKBACK_MS) continue;
    // An encounter nobody has said anything about yet has no language to share.
    if (hasNoWordsYet(candidate)) continue;
    // Already part of this moment's line, so there is nothing to offer.
    if (candidate.lineId !== null && candidate.lineId === fragment.lineId) continue;

    const tc = tokens(displayText(candidate));
    const run = sharedRun(tf, tc);
    const count = sharedCount(tf, tc);
    const score = (run ? run.len * 2 : 0) + count;

    if (score >= MIN_SCORE && (!best || score > best.score)) {
      best = {
        id: candidate.id,
        score,
        text: firstLine(candidate),
        when: dayLabel(candidate.at, now),
      };
    }
  }

  return best;
}
