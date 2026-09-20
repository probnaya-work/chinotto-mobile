/**
 * Whether this person has found settings yet.
 *
 * Settings is reached by pulling down from the top edge — decision 10 of the handoff, and
 * not up for revision. But the strip that takes the pull draws nothing until it is already
 * being pulled, so there was nothing on screen that said the gesture existed. The first
 * person to use the build on a phone reported exactly that, in those words.
 *
 * So the words are shown at rest until the pull has worked once, and then they are not.
 * This remembers that one fact, and nothing else about it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@chinotto/pull_for_settings_found_v1';

export async function hasFoundSettings(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    // Storage failing is not a reason to keep telling somebody something they know. It is
    // a reason to keep telling somebody something they may not — so the hint stays.
    return false;
  }
}

export async function rememberFoundSettings(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    /* the hint stays one more launch; nothing else is lost */
  }
}
