import AsyncStorage from '@react-native-async-storage/async-storage';

import { isPaywallEnabled } from '../paywallConfig';
import {
  loadSubscriptionState,
  persistSubscribed,
  resetSubscriptionStateForTests,
  stubCompleteChinottoPlusPurchase,
} from '../subscriptionState';
import { getSyncAccessPolicyDebug, hasSyncAccess, isSyncAccessBlocked } from '../syncAccessPolicy';

jest.mock('../paywallConfig', () => ({
  isPaywallEnabled: jest.fn(() => false),
}));

const mockPaywall = jest.mocked(isPaywallEnabled);

describe('syncAccessPolicy', () => {
  beforeEach(async () => {
    mockPaywall.mockReturnValue(false);
    resetSubscriptionStateForTests();
    await AsyncStorage.multiRemove([
      '@chinotto/plus_subscribed_v1',
      '@chinotto/plus_trial_started_at_v1',
    ]);
    await loadSubscriptionState();
  });

  it('treats everyone as having sync access when paywall is off', () => {
    expect(hasSyncAccess()).toBe(true);
    expect(isSyncAccessBlocked()).toBe(false);
    expect(getSyncAccessPolicyDebug()).toEqual({
      paywallEnabled: false,
      subscriptionHydrated: true,
      hasEntitlement: false,
      hasSyncAccess: true,
      thisDeviceRevoked: false,
    });
  });

  it('blocks sync when paywall is on and user is not entitled after hydration', async () => {
    mockPaywall.mockReturnValue(true);
    await loadSubscriptionState();
    expect(hasSyncAccess()).toBe(false);
    expect(isSyncAccessBlocked()).toBe(true);
  });

  it('allows sync when paywall is on and user is subscribed', async () => {
    mockPaywall.mockReturnValue(true);
    await persistSubscribed(true);
    expect(hasSyncAccess()).toBe(true);
    expect(isSyncAccessBlocked()).toBe(false);
  });

  it('allows sync when paywall is on and user has active trial (stub)', async () => {
    mockPaywall.mockReturnValue(true);
    resetSubscriptionStateForTests();
    await stubCompleteChinottoPlusPurchase();
    expect(hasSyncAccess()).toBe(true);
    expect(isSyncAccessBlocked()).toBe(false);
  });
});


describe('a device that was removed from the record', () => {
  it('stops syncing whether or not this build charges for sync', () => {
    const {
      setThisDeviceRevoked,
      resetThisDeviceRevokedForTests,
      // eslint-disable-next-line @typescript-eslint/no-var-requires
    } = require('../../sync/deviceRevocation');

    try {
      setThisDeviceRevoked(true);
      // Nothing to do with entitlement: removal is about this device, not this account.
      expect(isSyncAccessBlocked()).toBe(true);
    } finally {
      resetThisDeviceRevokedForTests();
    }
    expect(isSyncAccessBlocked()).toBe(false);
  });
});
