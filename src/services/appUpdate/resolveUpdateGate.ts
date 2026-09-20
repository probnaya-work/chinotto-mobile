import { compareSemanticVersions, parseSemver } from './compareVersions';
import type { UpdateConfig, UpdateGate } from './types';

const FORCED_TITLE_DEFAULT = 'Update required';
const FORCED_MESSAGE_DEFAULT = 'A newer version is needed.';
const SOFT_TITLE_DEFAULT = 'New version available';
const SOFT_MESSAGE_DEFAULT = 'Stay current.';

/**
 * Decide forced vs soft vs none from remote policy + the running app version.
 *
 * **Forced** when: `current < minSupportedVersion`, or (`current < latestVersion` and `forceUpdate`).
 * **Soft** when: `current >= minSupportedVersion` and `current < latestVersion` and not `forceUpdate`.
 * **None** when: disabled, parse errors, or already at/above `latestVersion`.
 */
export function resolveUpdateGate(currentVersion: string, config: UpdateConfig): UpdateGate | null {
  if (!config.enabled) {
    return null;
  }
  const current = currentVersion.trim();
  if (parseSemver(current) == null) {
    return null;
  }
  const min = config.minSupportedVersion.trim();
  const latest = config.latestVersion.trim();
  if (parseSemver(min) == null || parseSemver(latest) == null) {
    return null;
  }

  const belowMin = compareSemanticVersions(current, min);
  const belowLatest = compareSemanticVersions(current, latest);
  if (belowMin == null || belowLatest == null) {
    return null;
  }

  if (belowLatest >= 0) {
    return null;
  }

  const titleForced = config.title?.trim() || FORCED_TITLE_DEFAULT;
  const messageForced = config.message?.trim() || FORCED_MESSAGE_DEFAULT;
  const titleSoft = config.title?.trim() || SOFT_TITLE_DEFAULT;
  const messageSoft = config.message?.trim() || SOFT_MESSAGE_DEFAULT;

  if (belowMin < 0 || config.forceUpdate) {
    return {
      kind: 'forced',
      title: titleForced,
      message: messageForced,
      storeUrl: null,
      latestVersion: latest,
    };
  }

  return {
    kind: 'soft',
    title: titleSoft,
    message: messageSoft,
    storeUrl: null,
    latestVersion: latest,
  };
}

/**
 * Attach store URL for the current platform after gate resolution (presentation concern).
 */
export function withStoreUrl(
  gate: UpdateGate,
  platform: 'ios' | 'android' | 'web',
  config: UpdateConfig,
): UpdateGate {
  const url =
    platform === 'ios'
      ? (config.iosStoreUrl?.trim() || null)
      : platform === 'android'
        ? (config.androidStoreUrl?.trim() || null)
        : null;
  return { ...gate, storeUrl: url && url.length > 0 ? url : null };
}
