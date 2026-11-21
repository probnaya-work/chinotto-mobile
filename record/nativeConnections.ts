export type MeaningScores = { scores: (number | null)[] } | { preparing: true } | null;
export type ScoreMeaning = (source: string, candidates: string[]) => Promise<MeaningScores>;

export const scoreMeaning: ScoreMeaning = async () => null;
