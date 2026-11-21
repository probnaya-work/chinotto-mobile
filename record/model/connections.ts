import type { Material } from './material';
import { sharedRun, substantiveToken, tokens, wordParts, type TextPart, type Token } from './words';

const MAX_EXCERPT = 240;
// Sample across the whole loaded Record when a library is larger than the local search budget.
const MAX_CANDIDATES = 1600;
const MIN_SHARED = 3;
const MEANING_CANDIDATES = 48;
const MIN_MEANING_SCORE = 0.82;
const MIN_SINGLE_MEANING_SCORE = 0.90;
const MIN_MEANING_LEAD = 0.05;

export type Connection = {
  related: Material;
  sourceExcerpt: TextPart[];
  relatedExcerpt: TextPart[];
};

function excerpt(body: string, markTruncation = true): string {
  const text = body.trim();
  if (text.length <= MAX_EXCERPT) return text;
  const window = text.slice(0, MAX_EXCERPT);
  const end = window.search(/\s+\S*$/u);
  return window.slice(0, end > 0 ? end : MAX_EXCERPT) + (markTruncation ? '…' : '');
}

function connectionCandidate(source: Material, related: Material): boolean {
  return source.id !== related.id && source.removedAt === null && related.removedAt === null &&
    (source.lineId === null || source.lineId !== related.lineId) &&
    (source.urlKey === null || source.urlKey !== related.urlKey);
}

function wordsByStem(words: Token[]): Map<string, string> {
  const distinct = new Map<string, string>();
  for (const word of words) {
    if (substantiveToken(word) && !distinct.has(word.s)) distinct.set(word.s, word.w);
  }
  return distinct;
}

function compare(source: Map<string, string>, sourceTokens: Token[], text: string) {
  const otherTokens = tokens(text);
  const other = wordsByStem(otherTokens);
  const common = [...source.keys()].filter((stem) => other.has(stem));
  if (common.length < MIN_SHARED || sharedRun(sourceTokens, otherTokens)) return null;
  return {
    sourceWords: new Set(common.map((stem) => source.get(stem)!)),
    relatedWords: new Set(common.map((stem) => other.get(stem)!)),
  };
}

/** Revalidate the same two moments against their current wording. */
export function connectionBetween(source: Material, related: Material): Connection | null {
  if (!connectionCandidate(source, related)) return null;
  const current = excerpt(source.body);
  const previous = excerpt(related.body);
  const sourceTokens = tokens(current);
  const match = compare(wordsByStem(sourceTokens), sourceTokens, previous);
  if (!match) return null;
  return {
    related,
    sourceExcerpt: wordParts(current, match.sourceWords),
    relatedExcerpt: wordParts(previous, match.relatedWords),
  };
}

export function possibleConnection(
  source: Material,
  newestFirst: Material[],
  rejected: ReadonlySet<string>
): string | null {
  const sourceTokens = tokens(excerpt(source.body));
  const sourceWords = wordsByStem(sourceTokens);
  if (sourceWords.size < MIN_SHARED) return null;

  const eligible = newestFirst.filter((related) =>
    !rejected.has(related.id) && connectionCandidate(source, related) && related.body.trim()
  );
  const sampled = sampleAcrossRecord(eligible, MAX_CANDIDATES);

  let best: { id: string; overlap: number; distance: number } | null = null;
  for (const related of sampled) {
    const match = compare(sourceWords, sourceTokens, excerpt(related.body));
    if (!match) continue;
    const overlap = match.sourceWords.size;
    const distance = Math.abs(source.at - related.at);
    if (!best || overlap > best.overlap || (overlap === best.overlap && distance > best.distance)) {
      best = { id: related.id, overlap, distance };
    }
  }
  return best?.id ?? null;
}

function sampleAcrossRecord<T>(newestFirst: T[], limit: number): T[] {
  if (newestFirst.length <= limit) return newestFirst;
  const recent = limit / 2;
  const older = newestFirst.length - recent;
  return [
    ...newestFirst.slice(0, recent),
    ...Array.from({ length: recent }, (_, i) =>
      newestFirst[recent + Math.round(i * (older - 1) / (recent - 1))]),
  ];
}

export type MeaningCandidate = { id: string; excerpt: string };
export type MeaningMatch = { sourceExcerpt: string; candidate: MeaningCandidate };

export function meaningExcerpt(thought: Material): string | null {
  const text = excerpt(thought.body, false);
  // Short fragments and bare links do not provide enough evidence for a meaning comparison.
  if (/https?:\/\//iu.test(text) || (text.match(/\p{L}/gu)?.length ?? 0) < 22) return null;
  return text;
}

export function meaningCandidates(
  source: Material, sourceExcerpt: string, newestFirst: Material[], rejected: ReadonlySet<string>,
): MeaningCandidate[] {
  const sourceTokens = tokens(sourceExcerpt);
  const eligible = newestFirst.filter((thought) =>
    !rejected.has(thought.id) && connectionCandidate(source, thought) && thought.body.trim()
  );
  return sampleAcrossRecord(eligible, MEANING_CANDIDATES).flatMap((thought) => {
    const candidateExcerpt = meaningExcerpt(thought);
    if (!candidateExcerpt || sharedRun(sourceTokens, tokens(candidateExcerpt))) return [];
    return [{ id: thought.id, excerpt: candidateExcerpt }];
  });
}

export function chooseMeaningMatch(
  candidates: MeaningCandidate[], scores: (number | null)[],
): MeaningCandidate | null {
  if (scores.length !== candidates.length) return null;
  const ranked = scores.flatMap((score, index) => score !== null && Number.isFinite(score) && score >= -1 && score <= 1
    ? [{ score, index }] : []).sort((a, b) => b.score - a.score);
  const [best, next] = ranked;
  if (!best || best.score < (next ? MIN_MEANING_SCORE : MIN_SINGLE_MEANING_SCORE) ||
    (next && best.score - next.score < MIN_MEANING_LEAD)) return null;
  return candidates[best.index];
}

export function meaningConnectionBetween(source: Material, related: Material, match: MeaningMatch): Connection | null {
  if (!connectionCandidate(source, related) || related.id !== match.candidate.id ||
    meaningExcerpt(source) !== match.sourceExcerpt || meaningExcerpt(related) !== match.candidate.excerpt) return null;
  return {
    related,
    sourceExcerpt: [{ t: match.sourceExcerpt, m: false, n: true }],
    relatedExcerpt: [{ t: match.candidate.excerpt, m: false, n: true }],
  };
}
