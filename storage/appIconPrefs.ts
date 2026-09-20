import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  parseAppIconVariantId,
  type AppIconVariantId,
} from '../src/services/icons/iconVariants';

const KEY_APP_ICON = '@chinotto/app_icon_variant_v1';

export async function getStoredAppIconVariant(): Promise<AppIconVariantId | null> {
  try {
    // Parsing handles the retired palette: a stored colour that no longer exists resolves
    // to the default icon rather than to nothing.
    return parseAppIconVariantId(await AsyncStorage.getItem(KEY_APP_ICON));
  } catch {
    return null;
  }
}

export async function setStoredAppIconVariant(id: AppIconVariantId): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_APP_ICON, id);
  } catch {
    /* ignore */
  }
}
