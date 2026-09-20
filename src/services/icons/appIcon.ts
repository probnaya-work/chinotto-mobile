import { NativeModules, Platform } from 'react-native';

import { getStoredAppIconVariant, setStoredAppIconVariant } from '../../../storage/appIconPrefs';
import {
  appIconIdFromNativeName,
  APP_ICON_VARIANTS,
  type AppIconVariantId,
} from './iconVariants';

type AppIconNativeModule = {
  isSupported: () => Promise<boolean>;
  getCurrentIconName: () => Promise<string | null>;
  setIcon: (name: string | null) => Promise<string | null>;
};

const nativeModule: AppIconNativeModule | undefined = NativeModules.AppIconModule as
  | AppIconNativeModule
  | undefined;

export function supportsDynamicAppIcons(): boolean {
  return Platform.OS === 'ios' && nativeModule != null;
}

export async function getCurrentAppIconVariantId(): Promise<AppIconVariantId> {
  if (supportsDynamicAppIcons() && nativeModule != null) {
    try {
      const supported = await nativeModule.isSupported();
      if (supported) {
        const current = await nativeModule.getCurrentIconName();
        const id = appIconIdFromNativeName(current);
        await setStoredAppIconVariant(id);
        return id;
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[AppIcon] getCurrentIconName failed', error);
      }
    }
  }
  // `dark` is the default icon, and the fallback when nothing has been chosen.
  return (await getStoredAppIconVariant()) ?? 'dark';
}

export async function setCurrentAppIconVariantId(id: AppIconVariantId): Promise<AppIconVariantId> {
  const next = APP_ICON_VARIANTS.find((variant) => variant.id === id) ?? APP_ICON_VARIANTS[0];
  if (supportsDynamicAppIcons() && nativeModule != null) {
    const supported = await nativeModule.isSupported();
    if (supported) {
      await nativeModule.setIcon(next.nativeName);
    } else if (__DEV__) {
      console.warn('[AppIcon] Alternate icons are not supported on this build/device.');
    }
  }
  await setStoredAppIconVariant(next.id);
  return next.id;
}
