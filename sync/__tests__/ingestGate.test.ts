import { shouldRunMobileFirestoreIngest } from '../ingestGate';

describe('shouldRunMobileFirestoreIngest', () => {
  it('is false while the Enable sync sheet is open', () => {
    expect(
      shouldRunMobileFirestoreIngest({
        dbReady: true,
        subscriptionLoaded: true,
        syncModalVisible: true,
      })
    ).toBe(false);
  });

  it('is true when DB and subscription are ready and the sheet is closed', () => {
    expect(
      shouldRunMobileFirestoreIngest({
        dbReady: true,
        subscriptionLoaded: true,
        syncModalVisible: false,
      })
    ).toBe(true);
  });

  it('is false when DB or subscription is not ready', () => {
    expect(
      shouldRunMobileFirestoreIngest({
        dbReady: false,
        subscriptionLoaded: true,
        syncModalVisible: false,
      })
    ).toBe(false);
    expect(
      shouldRunMobileFirestoreIngest({
        dbReady: true,
        subscriptionLoaded: false,
        syncModalVisible: false,
      })
    ).toBe(false);
  });
});
