/**
 * The Return — something old, brought back, with the reason it came.
 *
 * The governing rule, from the design package and adopted by both repositories:
 *
 * > The reason is mandatory — a return that cannot show why it came back must not appear.
 *
 * Desktop resolved what that costs (their handoff §1.3, DECIDED (b)): every surviving trigger
 * states a because-clause in the prototype's sentence shape, and `interval` is **dropped**,
 * because "it has been a while" is not a reason, it is the absence of one. Mobile inherits
 * that decision rather than re-litigating it.
 *
 * Three triggers survive, each able to quote something real:
 *
 *   repeated_language  you wrote "…decide what a thing is before…" at 11:05
 *   same_source        you opened theatlantic.com again at 16:48
 *   line_continued     you added to this line in march
 *
 * The prototype's `returnFor()` opens with a lookup for two specific sentences in the demo
 * corpus; that is scaffolding for the demo, and its generic fallback is the real rule. Only
 * the rule is ported.
 */

import { displayText, hasNoWordsYet, isEncounter, type Material } from './material';
import { fmtTime, monthLabel, MS_DAY } from './time';
import { sharedRun, tokens } from './words';

/** Nothing younger than this is brought back. A Return is a return, not a reminder. */
export const MIN_AGE_MS = 180 * MS_DAY;
/** What counts as "the thing you just did" that a Return can point at. */
export const CAUSE_WINDOW_MS = 2 * MS_DAY;
/** A shared run shorter than this is a coincidence, not repeated language. */
export const MIN_RUN = 3;

export type ReturnReason = 'repeated_language' | 'same_source' | 'line_continued';

export type ReturnEvidence = {
  kind: 'shared_phrase' | 'url' | 'continuation';
  detail: string;
  occurredAt: number;
  relatedId: string;
};

export type RecordReturn = {
  /** What came back. */
  material: Material;
  /** What it came back because of. */
  because: Material;
  reason: ReturnReason;
  evidence: ReturnEvidence;
  /** The phrase to highlight inside `material`, when there is one. */
  phraseOld: string | null;
  /** The phrase to highlight inside the because-sentence, when there is one. */
  phraseNew: string | null;
};

export type ReturnInput = {
  material: Material[];
  now: number;
  /** Ids surfaced recently enough that bringing them back again would be nagging. */
  recentlyReturned?: Set<string> | null;
  /** Currently held ids. Held material is already present; it does not need returning. */
  held?: Record<string, boolean> | null;
};

/**
 * The one Return waiting at the edge, or null.
 *
 * Deliberately returns at most one. The surface draws one, and a queue of things demanding
 * attention is the opposite of what this is for.
 */
export function returnFor({
  material,
  now,
  recentlyReturned = null,
  held = null,
}: ReturnInput): RecordReturn | null {
  const live = material.filter((m) => m.removedAt === null);
  const old = live.filter(
    (m) =>
      now - m.at >= MIN_AGE_MS &&
      !hasNoWordsYet(m) &&
      !recentlyReturned?.has(m.id) &&
      !held?.[m.id]
  );
  const recent = live.filter((m) => now - m.at <= CAUSE_WINDOW_MS);
  if (!old.length || !recent.length) return null;

  return (
    repeatedLanguage(old, recent) ?? sameSource(old, recent) ?? lineContinued(old, recent, now)
  );
}

function repeatedLanguage(old: Material[], recent: Material[]): RecordReturn | null {
  for (const a of old) {
    const ta = tokens(displayText(a));
    if (ta.length < MIN_RUN) continue;
    for (const b of recent) {
      if (b.id === a.id) continue;
      const run = sharedRun(ta, tokens(displayText(b)));
      if (run && run.len >= MIN_RUN) {
        return {
          material: a,
          because: b,
          reason: 'repeated_language',
          phraseOld: run.a,
          phraseNew: run.b,
          evidence: {
            kind: 'shared_phrase',
            detail: run.b,
            occurredAt: b.at,
            relatedId: b.id,
          },
        };
      }
    }
  }
  return null;
}

function sameSource(old: Material[], recent: Material[]): RecordReturn | null {
  for (const a of old) {
    if (!isEncounter(a) || !a.urlKey) continue;
    for (const b of recent) {
      if (b.id === a.id || !isEncounter(b) || b.urlKey !== a.urlKey) continue;
      return {
        material: a,
        because: b,
        reason: 'same_source',
        phraseOld: null,
        phraseNew: null,
        evidence: {
          kind: 'url',
          detail: b.domain ?? b.urlKey ?? '',
          occurredAt: b.at,
          relatedId: b.id,
        },
      };
    }
  }
  return null;
}

function lineContinued(old: Material[], recent: Material[], now: number): RecordReturn | null {
  for (const a of old) {
    if (!a.lineId) continue;
    for (const b of recent) {
      if (b.id === a.id || b.lineId !== a.lineId) continue;
      return {
        material: a,
        because: b,
        reason: 'line_continued',
        phraseOld: null,
        phraseNew: null,
        evidence: {
          kind: 'continuation',
          detail: monthLabel(b.at, now),
          occurredAt: b.at,
          relatedId: b.id,
        },
      };
    }
  }
  return null;
}

/**
 * The because-sentence, in the prototype's shape.
 *
 * `repeated_language` returns the two halves so the interface can quote and highlight the
 * real words; the other two produce a single finished sentence. All three say why.
 */
export function becauseSentence(
  r: RecordReturn,
  now: number
): { lead: string; quote: string | null; tail: string } {
  switch (r.reason) {
    case 'repeated_language':
      return { lead: 'you wrote “', quote: r.phraseNew, tail: `” at ${fmtTime(r.because.at)}` };
    case 'same_source':
      return {
        lead: `you opened ${r.evidence.detail} again`,
        quote: null,
        tail: ` at ${fmtTime(r.because.at)}`,
      };
    case 'line_continued':
      return {
        lead: 'you added to this line',
        quote: null,
        tail: ` in ${monthLabel(r.because.at, now)}`,
      };
  }
}
