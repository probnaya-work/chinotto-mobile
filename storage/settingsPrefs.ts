import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_HAPTICS_ENABLED = '@chinotto/settings_haptics_enabled_v1';

export async function getHapticsEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY_HAPTICS_ENABLED);
    if (raw == null) {
      return true;
    }
    return raw === '1';
  } catch {
    return true;
  }
}

/** Persists preference; there is no Settings toggle (removed) — kept so existing installs and tests stay consistent. */
export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_HAPTICS_ENABLED, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}
