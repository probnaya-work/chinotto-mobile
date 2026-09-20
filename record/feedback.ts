/**
 * The one thing the record is allowed to make you feel.
 *
 * This is not a new haptic language and is deliberately not an opportunity for one. The
 * shipping app fires exactly one impact, `Light`, behind one stored preference, at the
 * moment a thought is persisted — "not on keypress or failed save", as its own comment puts
 * it. That is the behaviour being kept, and nothing else.
 *
 * Its other five call sites belonged to v1 surfaces that no longer exist: a search chrome
 * toggle, a month rack, a sheet opening, a temporal boundary. They are not reassigned to
 * whatever the new surface does in roughly the same place — a haptic moved to a different
 * event is a different haptic.
 *
 * `v1` also had no toggle for this (`storage/settingsPrefs.ts` says so outright), so neither
 * does this: the preference is read, honoured, and defaults to on, exactly as it does for an
 * install upgrading from v1 that already has the key.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { getHapticsEnabled } from '../storage/settingsPrefs';

/** Read once and cached, so landing a thought never waits on storage. */
let enabled: boolean | null = null;

export async function loadFeedbackPreference(): Promise<void> {
  enabled = await getHapticsEnabled();
}

/**
 * A thought has landed in the record — typed, spoken, continued or shared.
 *
 * Called after it is persisted, never before, because the feeling is a confirmation and a
 * confirmation of something that has not happened is a lie you can feel.
 */
export function thoughtLanded(): void {
  if (enabled === false || Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Tests only. */
export function setFeedbackPreferenceForTests(value: boolean | null): void {
  enabled = value;
}
