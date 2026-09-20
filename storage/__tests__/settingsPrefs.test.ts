import AsyncStorage from '@react-native-async-storage/async-storage';

import { getHapticsEnabled, setHapticsEnabled } from '../settingsPrefs';

describe('settingsPrefs', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults haptics to enabled', async () => {
    expect(await getHapticsEnabled()).toBe(true);
  });

  it('persists haptics toggle', async () => {
    await setHapticsEnabled(false);
    expect(await getHapticsEnabled()).toBe(false);

    await setHapticsEnabled(true);
    expect(await getHapticsEnabled()).toBe(true);
  });
});
