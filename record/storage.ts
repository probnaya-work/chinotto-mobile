import { Paths } from 'expo-file-system';

import { listRetainedAudio, recordFileSize } from './files';

/** Null means at least one retained file could not be measured, not zero use. */
export function retainedAudioBytes(): number | null {
  const paths = listRetainedAudio();
  if (paths === null) return null;
  let total = 0;
  for (const path of paths) {
    const size = recordFileSize(path);
    if (size === null) return null;
    total += size;
  }
  return total;
}

/** Measured free device bytes, or null if the platform cannot report them. */
export function availableDeviceBytes(): number | null {
  try {
    const value = Paths.availableDiskSpace;
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export function formatStorage(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** A warning threshold, never a recording limit. A five-minute M4A is usually far smaller. */
export function storageLooksLow(freeBytes: number | null): boolean {
  return freeBytes !== null && freeBytes < 64 * 1024 ** 2;
}
