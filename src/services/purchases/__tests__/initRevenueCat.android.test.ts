/**
 * Android sells nothing yet, so the purchases SDK is never configured there — not even when
 * an Android key is present in the environment, where a build could otherwise pick it up.
 */

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    setLogHandler: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(async () => null),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG', ERROR: 'ERROR' },
}));

jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default },
}));

import Purchases from 'react-native-purchases';

describe('initRevenueCat on android', () => {
  const key = 'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY';
  const prev = process.env[key];
  afterEach(() => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });

  it('never configures the SDK, even with an android key set', () => {
    process.env[key] = 'goog_example';
    const { initRevenueCat } = require('../initRevenueCat') as typeof import('../initRevenueCat');
    initRevenueCat();
    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(Purchases.setLogLevel).not.toHaveBeenCalled();
  });

  it('does not ask the SDK for customer info at launch', async () => {
    const { bootstrapRevenueCat } = require('../initRevenueCat') as typeof import('../initRevenueCat');
    await bootstrapRevenueCat();
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
    expect(Purchases.configure).not.toHaveBeenCalled();
  });
});
