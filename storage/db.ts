import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { migrate, type MigrationReport } from '../record/migrate';
import { archiveThemesIfNeeded } from '../record/themeArchive';
import { writeRecordText } from '../record/files';
import { ensureThemeSchema } from './themeSchema';

let initPromise: Promise<SQLiteDatabase> | null = null;
let lastReport: MigrationReport | null = null;

/**
 * Opens the DB, brings the schema to the version this build expects, and resolves once
 * ready. Call from app startup so the first capture pays minimal cold cost.
 *
 * The v1 schema is no longer written here: `record/migrate.ts` owns it as step 1 of the
 * ladder, so the boot path and the migration cannot drift apart. The v1 tables themselves
 * are unchanged and are not dropped — the deployed Firestore contract still speaks them,
 * and reverting this build must keep working.
 *
 * `ensureThemeSchema` stays for the same reason: themes are retired from the product in this
 * release, but their tables and their sync path remain until the desktop/mobile transition
 * is over. What people wrote is copied into `archived_material` first (see `themeArchive`).
 */
export function initDatabase(): Promise<SQLiteDatabase> {
  initPromise ??= (async () => {
    const db = await openDatabaseAsync('chinotto.db');
    lastReport = await migrate(db);
    await ensureThemeSchema(db);

    // Deliberately not awaited: the archive is bounded by how many themes someone made, and
    // capture must never wait on it. If it fails, `themes.archive` stays owed and the next
    // boot tries again — the material is already durable in `archived_material` by then.
    void archiveThemesIfNeeded(db, { writeFile: writeRecordText }).catch(() => {
      /* retried next boot */
    });

    return db;
  })();
  return initPromise;
}

/** Same initialization as initDatabase; use from repositories. */
export function getDatabase(): Promise<SQLiteDatabase> {
  return initDatabase();
}

/** What the last migration did, for the dev surface and for support. Null before boot. */
export function lastMigrationReport(): MigrationReport | null {
  return lastReport;
}
