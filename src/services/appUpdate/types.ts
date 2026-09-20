/**
 * Remote update policy (future: fetch from CDN, Firebase Remote Config, or your API).
 * Validation happens in {@link resolveUpdateGate}; invalid shapes fail closed (no gate).
 */
export type UpdateConfig = {
  enabled: boolean;
  minSupportedVersion: string;
  latestVersion: string;
  /** When true and the app is below {@link UpdateConfig.latestVersion}, treat as a hard block (same UX as below min). */
  forceUpdate: boolean;
  title?: string;
  message?: string;
  iosStoreUrl?: string;
  /** Omit until the Android app is in Play Store; without it, `withStoreUrl` yields no store URL on Android. */
  androidStoreUrl?: string;
};

export type UpdateGate =
  | {
      kind: 'forced';
      title: string;
      message: string;
      storeUrl: string | null;
      /** {@link UpdateConfig.latestVersion}: the version the store has, never the running one. */
      latestVersion: string;
    }
  | {
      kind: 'soft';
      title: string;
      message: string;
      storeUrl: string | null;
      /** {@link UpdateConfig.latestVersion}: the version the store has, never the running one. */
      latestVersion: string;
    };
