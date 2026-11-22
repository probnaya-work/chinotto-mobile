import { NativeModules } from 'react-native';
import type { ScoreMeaning } from './nativeConnections';

export const scoreMeaning: ScoreMeaning = async (source, candidates) => {
  const module = NativeModules.ThoughtMeaning as { score: ScoreMeaning } | undefined;
  return module?.score ? module.score(source, candidates) : null;
};
