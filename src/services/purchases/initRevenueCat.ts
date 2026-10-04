import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfoUpdateListener } from 'react-native-purchases';

import { isPaywallEnabled } from '../../../monetization/paywallConfig';

function iosStoreKitVersionFromEnv():
  | typeof Purchases.STOREKIT_VERSION.STOREKIT_1
  | typeof Purchases.STOREKIT_VERSION.STOREKIT_2
  | undefined {
  const raw = process.env.EXPO_PUBLIC_REVENUECAT_IOS_STOREKIT_VERSION?.trim().toUpperCase();
  if (raw === 'STOREKIT_1') {
    return Purchases.STOREKIT_VERSION.STOREKIT_1;
  }
  if (raw === 'STOREKIT_2') {
    return Purchases.STOREKIT_VERSION.STOREKIT_2;
  }
  return undefined;
}

import { REVENUECAT_IOS_API_KEY } from './constants';
import { syncEntitlementCacheFromCustomerInfo } from './entitlementCache';
import { warnIfActiveSubscriptionButMissingChinottoProEntitlement } from './entitlements';
import { isRevenueCatQuietMode } from './revenueCatQuiet';
import { mirrorChinottoSyncAccessToFirestore } from '../../../sync/firestoreSyncAccessMirror';
import { logRevenueCatSubscriptionsAndProducts } from './revenueCatDebugLog';
import { refreshEntitlementCacheFromRevenueCat } from './revenueCat';

let didConfigure = false;

/**
 * RevenueCat / App Store setup checklist: `docs/internal/billing/revenuecat-dashboard.md` (entitlement **Chinotto Pro**, products, current offering).
 *
 * **Customer info:** registers the canonical `addCustomerInfoUpdateListener` that keeps `entitlementCache` in sync.
 * Avoid stacking a second listener for the same job (see `useSubscription` — prefer refresh helpers until consolidated).
 *
 * Configures the native Purchases SDK **once** per JS runtime.
 * - Verbose logs in development unless `EXPO_PUBLIC_REVENUECAT_QUIET` — then a no-op log handler is set
 *   **before** `configure` so the SDK does not attach the default `console.*` bridge (avoids LogBox banners).
 * - iOS: uses {@link REVENUECAT_IOS_API_KEY}.
 * - Android: never configures. Whether and how Android sells Chinotto Pro is undecided
 *   (`docs/unspecified-decisions.md` §10), so no key — in `.env` or on EAS — may switch it on.
 * - Web / unsupported: no-op.
 *
 * Must run on a **development build** with native code (not Expo Go).
 */
export function initRevenueCat(): void {
  if (didConfigure) {
    return;
  }
  // Only the iPhone sells anything. Android and web never touch the native SDK at all.
  if (Platform.OS !== 'ios') {
    return;
  }

  const quiet = isRevenueCatQuietMode();

  try {
    if (quiet) {
      // Default handler is installed inside `configure` only when no handler exists; it maps ERROR →
      // `console.error`, which triggers React Native LogBox (red bottom banner). Swallow everything.
      Purchases.setLogHandler(() => {});
    }

    void Purchases.setLogLevel(
      quiet ? LOG_LEVEL.ERROR : __DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR
    );

    if (Platform.OS === 'ios') {
      const iosKey = REVENUECAT_IOS_API_KEY;
      if (iosKey === '') {
        if (__DEV__ && !quiet) {
          console.warn(
            '[RevenueCat] iOS key missing. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY (appl_...) to enable Purchases.',
          );
        }
        return;
      }
      if (
        !quiet &&
        !__DEV__ &&
        isPaywallEnabled() &&
        iosKey.startsWith('test_')
      ) {
        console.error(
          '[RevenueCat] Paywall is on but the embedded iOS key is test_* — set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY (appl_…) on EAS and rebuild. Purchases will not work in this binary.',
        );
        return;
      }
      const storeKitVersion = iosStoreKitVersionFromEnv();
      Purchases.configure({
        apiKey: iosKey,
        ...(storeKitVersion != null ? { storeKitVersion } : {}),
      });
    } else {
      return;
    }

    didConfigure = true;

    // Keep non-React gating in sync whenever RC pushes an update (renewal, restore, etc.).
    const onCustomerInfoUpdated: CustomerInfoUpdateListener = (customerInfo) => {
      syncEntitlementCacheFromCustomerInfo(customerInfo);
      warnIfActiveSubscriptionButMissingChinottoProEntitlement(customerInfo);
      void mirrorChinottoSyncAccessToFirestore();
    };
    Purchases.addCustomerInfoUpdateListener(onCustomerInfoUpdated);
  } catch (err) {
    if (__DEV__ && !quiet) {
      console.warn('[RevenueCat] initRevenueCat failed', err);
    }
  }
}

/**
 * App root: configure SDK (once) + initial CustomerInfo fetch into entitlement cache.
 */
export async function bootstrapRevenueCat(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  initRevenueCat();
  const info = await refreshEntitlementCacheFromRevenueCat();
  await logRevenueCatSubscriptionsAndProducts(info, 'bootstrap');
}
