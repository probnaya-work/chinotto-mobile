/**
 * Whether {@link startMobileFirestoreIngest} should be active. Pausing while the Enable sync sheet
 * is open avoids pulling remote thoughts into the stream until the user returns to capture.
 */
export function shouldRunMobileFirestoreIngest(params: {
  dbReady: boolean;
  subscriptionLoaded: boolean;
  syncModalVisible: boolean;
}): boolean {
  return params.dbReady && params.subscriptionLoaded && !params.syncModalVisible;
}
