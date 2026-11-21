import {
  chooseMeaningMatch, meaningCandidates, meaningExcerpt, possibleConnection, type MeaningMatch,
} from './model/connections';
import type { Material } from './model/material';
import { scoreMeaning, type ScoreMeaning } from './nativeConnections';

export type ConnectionResult = { id: string; meaning?: MeaningMatch } | 'empty' | 'preparing';

/** Prefer the evidence we can point at word for word. Search by meaning only on request. */
export async function findConnection(
  source: Material, newestFirst: Material[], rejected: ReadonlySet<string>, score: ScoreMeaning = scoreMeaning,
): Promise<ConnectionResult> {
  const id = possibleConnection(source, newestFirst, rejected);
  if (id) return { id };
  const sourceExcerpt = meaningExcerpt(source);
  if (!sourceExcerpt || source.removedAt !== null) return 'empty';
  const candidates = meaningCandidates(source, sourceExcerpt, newestFirst, rejected);
  if (candidates.length === 0) return 'empty';
  const result = await score(sourceExcerpt, candidates.map((candidate) => candidate.excerpt)).catch(() => null);
  if (!result) return 'empty';
  if ('preparing' in result) return 'preparing';
  const candidate = chooseMeaningMatch(candidates, result.scores);
  return candidate ? { id: candidate.id, meaning: { sourceExcerpt, candidate } } : 'empty';
}
