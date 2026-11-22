import type { Material } from './material';
import { sharedRun, substantiveToken, tokens, wordParts, type TextPart, type Token } from './words';

const MAX_EXCERPT = 240;
// Sample across the whole loaded Record when a library is larger than the local search budget.
const MAX_CANDIDATES = 1600;
const RECENT_CANDIDATES = MAX_CANDIDATES / 2;
const MIN_SHARED = 3;

export type Connection = {
  related: Material;
  sourceExcerpt: TextPart[];
  relatedExcerpt: TextPart[];
};

function excerpt(body: string): string {
  const text = body.trim();
  if (text.length <= MAX_EXCERPT) return text;
  const window = text.slice(0, MAX_EXCERPT);
  const end = window.search(/\s+\S*$/u);
  return `${window.slice(0, end > 0 ? end : MAX_EXCERPT)}…`;
}

function candidateFor(source: Material, related: Material): boolean {
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
  if (!candidateFor(source, related)) return null;
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
    !rejected.has(related.id) && candidateFor(source, related) && related.body.trim()
  );
  const older = eligible.length - RECENT_CANDIDATES;
  const sampled = eligible.length <= MAX_CANDIDATES ? eligible : [
    ...eligible.slice(0, RECENT_CANDIDATES),
    ...Array.from({ length: RECENT_CANDIDATES }, (_, i) =>
      eligible[RECENT_CANDIDATES + Math.round(i * (older - 1) / (RECENT_CANDIDATES - 1))]),
  ];

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
