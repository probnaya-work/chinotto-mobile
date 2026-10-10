import { Directory, File, Paths } from 'expo-file-system';

const active = new Set<string>();
const namePattern = /^(?:chinotto-record-[a-zA-Z0-9-]+\.zip|snapshot-[a-zA-Z0-9-]+\.db(?:-(?:wal|shm))?)$/;

export function exportDirectory(): Directory {
  const directory = new Directory(Paths.cache, 'chinotto-exports');
  directory.create({ idempotent: true });
  return directory;
}

export function keepExportFile(file: File): void {
  active.add(file.uri);
}

export function releaseExportFile(file: File): void {
  active.delete(file.uri);
}

/** Removes only our abandoned files; an in-process share or writer keeps its lease. */
export function cleanupAbandonedExports(): void {
  const directory = exportDirectory();
  for (const item of directory.list()) {
    if (!(item instanceof File) || !namePattern.test(item.name) ||
        active.has(item.uri) || active.has(item.uri.replace(/-(?:wal|shm)$/, ''))) continue;
    try {
      item.delete();
    } catch {
      // A later launch retries. Never interfere with an active or unrelated file.
    }
  }
}
