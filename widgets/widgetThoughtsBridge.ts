import { NativeModules, Platform } from 'react-native';

import { getRecentEntries } from '../storage/entryRepository';
import type { Entry } from '../types/entry';

type WidgetThought = { id: string; text: string };

type WidgetThoughtsNativeModule = {
  setRecentThoughts(json: string): Promise<void>;
};

/** Large widget shows up to 5; payload is shared across sizes. */
export const WIDGET_THOUGHTS_SYNC_LIMIT = 5;

const MAX_WIDGET_TEXT_LEN = 120;

/** Newest first for home-screen widget (explicit sort; callers may already be ordered). */
export function entriesNewestFirstForWidget(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    const aOk = !Number.isNaN(ta);
    const bOk = !Number.isNaN(tb);
    if (aOk && bOk && tb !== ta) {
      return tb - ta;
    }
    if (aOk !== bOk) {
      return aOk ? -1 : 1;
    }
    return b.id.localeCompare(a.id);
  });
}

function normalizeThoughtText(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= MAX_WIDGET_TEXT_LEN) {
    return compact;
  }
  return `${compact.slice(0, MAX_WIDGET_TEXT_LEN - 1).trimEnd()}…`;
}

function mapThoughts(entries: Entry[]): WidgetThought[] {
  return entriesNewestFirstForWidget(entries)
    .slice(0, WIDGET_THOUGHTS_SYNC_LIMIT)
    .map((entry) => ({
      id: entry.id,
      text: normalizeThoughtText(entry.text),
    }));
}

export async function syncRecentThoughtsToWidget(entries: Entry[]): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }
  const mod = NativeModules.WidgetThoughtsBridge as WidgetThoughtsNativeModule | undefined;
  if (!mod?.setRecentThoughts) {
    if (__DEV__) {
      console.warn('[WidgetThoughtsBridge] Native module is unavailable.');
    }
    return;
  }
  try {
    await mod.setRecentThoughts(JSON.stringify({ thoughts: mapThoughts(entries) }));
  } catch (err) {
    if (__DEV__) {
      console.warn('[WidgetThoughtsBridge] Failed to sync thoughts', err);
    }
    // Best-effort bridge for widget re-engagement; never block capture flow.
  }
}

/**
 * Refreshes widget payload from SQLite (newest first) without waiting for the Record to write.
 * Use after DB init and on foreground so home-screen widgets aren’t stale after reinstall.
 */
export async function refreshWidgetThoughtsFromLocalDb(): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }
  try {
    const entries = await getRecentEntries(WIDGET_THOUGHTS_SYNC_LIMIT);
    await syncRecentThoughtsToWidget(entries);
  } catch (err) {
    if (__DEV__) {
      console.warn('[WidgetThoughtsBridge] refreshWidgetThoughtsFromLocalDb failed', err);
    }
  }
}
