import { isThisDeviceRevoked } from '../sync/deviceRevocation';
import { isPaywallEnabled } from './paywallConfig';
import { getCachedHasSyncEntitlement, isSubscriptionHydrated } from './subscriptionState';

/**
 * Whether the user may use cloud sync under current product rules.
 * When paywall feature is off, everyone is treated as entitled.
 */
export function hasSyncAccess(): boolean {
  if (!isPaywallEnabled()) {
    return true;
  }
  if (!isSubscriptionHydrated()) {
    return false;
  }
  return getCachedHasSyncEntitlement();
}

/**
 * When true, outbound/inbound Firestore sync must not run.
 *
 * Two reasons, and they are different: the subscription does not currently allow sync, or
 * **this device** has been removed from the record somewhere else. The second is not about
 * entitlement at all, which is why it is checked whether or not there is a paywall — a
 * removed device stays removed in a build that charges for nothing.
 */
export function isSyncAccessBlocked(): boolean {
  if (isThisDeviceRevoked()) {
    return true;
  }
  return isPaywallEnabled() && !hasSyncAccess();
}

/**
 * **`__DEV__` / diagnostics:** why {@link hasSyncAccess} may be false (mirror writes `active: false`).
 */
export function getSyncAccessPolicyDebug(): {
  paywallEnabled: boolean;
  subscriptionHydrated: boolean;
  hasEntitlement: boolean;
  hasSyncAccess: boolean;
  thisDeviceRevoked: boolean;
} {
  return {
    thisDeviceRevoked: isThisDeviceRevoked(),
    paywallEnabled: isPaywallEnabled(),
    subscriptionHydrated: isSubscriptionHydrated(),
    hasEntitlement: getCachedHasSyncEntitlement(),
    hasSyncAccess: hasSyncAccess(),
  };
}
