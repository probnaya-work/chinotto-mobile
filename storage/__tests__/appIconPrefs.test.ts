import AsyncStorage from '@react-native-async-storage/async-storage';

import { getStoredAppIconVariant, setStoredAppIconVariant } from '../appIconPrefs';

describe('appIconPrefs', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns null by default', async () => {
    expect(await getStoredAppIconVariant()).toBeNull();
  });

  it('stores and retrieves icon variant ids', async () => {
    await setStoredAppIconVariant('light');
    expect(await getStoredAppIconVariant()).toBe('light');
  });

  it('gives somebody who chose a retired colour the default icon', async () => {
    await AsyncStorage.setItem('@chinotto/app_icon_variant_v1', 'violet');
    expect(await getStoredAppIconVariant()).toBe('dark');
  });

  it('returns null for something it cannot read at all', async () => {
    await AsyncStorage.setItem('@chinotto/app_icon_variant_v1', 'chartreuse');
    expect(await getStoredAppIconVariant()).toBeNull();
  });
});
