/**
 * Versioned schema migrations, keyed on `PRAGMA user_version`.
 *
 * Mobile v1 had no migration framework: `storage/db.ts` replayed `CREATE TABLE IF NOT
 * EXISTS` on every boot and columns were added by guarded `ALTER TABLE`. That is fine for
 * adding a column and useless for a change of model, so the Record gets a real ladder — the
 * same one desktop holds in `src-tauri/src/db/migrate.rs`, and for the same reasons.
 *
 * Rules this module holds to (identical to desktop's, deliberately):
 *   * Migrations are forward-only, idempotent, and run inside one transaction each.
 *   * v1 tables are READ, never dropped here. The app stops reading them long before it
 *     stops having them, so a bad release is recoverable by reverting the binary — and the
 *     deployed sync contract keeps working throughout.
 *   * Nothing is invented. Where v1 genuinely does not know something (how a fragment was
 *     captured, what an entry said before it was edited in place), the migration records
 *     that it does not know instead of guessing a plausible value.
 *
 * A note on v1 installs that have never run this code: `user_version` is 0 both for a fresh
 * install and for a phone with four years of entries on it. That is fine — v1 is reached by
 * a step that only ensures the v1 tables exist, which is exactly what the old boot path did.
 */

import {
  RECORD_FTS_SQL,
  RECORD_SCHEMA_SQL,
} from './schema';
import { setUserVersion, tableExists, userVersion, type RecordDb } from './db';

/** Schema version this build expects. Bump when adding a step below. */
export const TARGET_VERSION = 5;

/**
 * The v1 schema, byte-for-byte what shipped. Owned here so the boot path and the migration
 * ladder cannot drift apart. Nothing in it changes: it is the contract the deployed app and
 * the current Firestore sync both speak, and it stays until the transition is over.
 */
export const LEGACY_V1_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'synced'))
);
CREATE TABLE IF NOT EXISTS sync_tombstone_outbox (
  entry_id TEXT PRIMARY KEY NOT NULL,
  enqueued_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS firestore_ingest_suppressed_ids (
  id TEXT PRIMARY KEY NOT NULL,
  suppressed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS firestore_ingest_suppressed_theme_ids (
  id TEXT PRIMARY KEY NOT NULL,
  suppressed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_user_theme_outbox (
  theme_id TEXT PRIMARY KEY NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('upsert', 'tombstone')),
  label TEXT,
  sort_order INTEGER,
  enqueued_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entry_engagement (
  entry_id TEXT PRIMARY KEY NOT NULL,
  open_count INTEGER NOT NULL DEFAULT 0,
  edit_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  last_edited_at TEXT
);
`;

/**
 * SQLite's `TRIM(x)` strips spaces and nothing else — not tabs, not newlines. v1 accepted
 * whitespace-only entries, so trimming with the default character set would carry a row
 * made of two newlines into the Record as a blank fragment. Every blankness test in this
 * codebase goes through here.
 */
export const NOT_BLANK = (col: string): string =>
  `TRIM(${col}, ' ' || CHAR(9) || CHAR(10) || CHAR(11) || CHAR(12) || CHAR(13)) <> ''`;

export type MigrationReport = {
  from: number;
  to: number;
  /** Steps that actually ran, in order. */
  ran: number[];
  /** Fragments created from v1 entries by step 2. */
  fragmentsImported: number;
  /** True when FTS5 is usable in this build. */
  ftsAvailable: boolean;
};

/** Runs every migration needed to reach {@link TARGET_VERSION}. Safe to call on every boot. */
export async function migrate(db: RecordDb): Promise<MigrationReport> {
  const from = await userVersion(db);
  const report: MigrationReport = {
    from,
    to: from,
    ran: [],
    fragmentsImported: 0,
    ftsAvailable: false,
  };

  if (from > TARGET_VERSION) {
    // A newer build has been here. Do not "migrate down" — that is how data is destroyed by
    // a downgrade. Refuse loudly instead; the caller decides whether to run degraded.
    throw new Error(
      `[Record] database is at v${from}, newer than this build's v${TARGET_VERSION}. Refusing to touch it.`
    );
  }

  // Foreign keys are per-connection in SQLite and OFF by default. The Record's cascades
  // depend on them, so they are turned on before anything else. Outside a transaction:
  // this pragma is a no-op inside one.
  await db.execAsync('PRAGMA foreign_keys = ON');

  if (from < 1) {
    await step(db, 1, report, async () => {
      await db.execAsync(LEGACY_V1_SCHEMA_SQL);
    });
  }

  if (from < 2) {
    await step(db, 2, report, async () => {
      await db.execAsync(RECORD_SCHEMA_SQL);
      report.fragmentsImported = await copyEntriesToFragments(db);
    });
  }

  if (from < 3) {
    // The archive itself is written outside the transaction by `archiveThemesIfNeeded`,
    // which the boot path calls after migrating. The step only records that it is owed,
    // so a filesystem failure can never leave the schema half-migrated.
    await step(db, 3, report, async () => {
      const hasThemes = await tableExists(db, 'user_themes');
      const owed = hasThemes ? await countRows(db, 'user_themes') : 0;
      await setMeta(db, 'themes.archive', owed > 0 ? 'owed' : 'not-needed');
    });
  }

  if (from < 4) {
    await step(db, 4, report, async () => {
      // Identity is generated by the caller, which has expo-crypto. The step only makes
      // sure the table is there; `ensureThisDevice` fills it.
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS this_device (
           id TEXT PRIMARY KEY NOT NULL,
           name TEXT NOT NULL,
           created_at TEXT NOT NULL
         );`
      );
    });
  }

  if (from < 5) {
    // FTS5 is a compile-time option. A build without it must still open the database, so
    // this step records availability rather than requiring it. Find falls back to LIKE.
    let available = false;
    try {
      await db.execAsync(RECORD_FTS_SQL);
      available = true;
    } catch {
      available = false;
    }
    await step(db, 5, report, async () => {
      await setMeta(db, 'fts.available', available ? '1' : '0');
    });
  }

  report.ftsAvailable = (await getMeta(db, 'fts.available')) === '1';
  report.to = await userVersion(db);
  return report;
}

async function step(
  db: RecordDb,
  version: number,
  report: MigrationReport,
  body: () => Promise<void>
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await body();
    await setUserVersion(db, version);
  });
  report.ran.push(version);
}

/**
 * v1 `entries` -> `fragments`. Copies forward; drops nothing.
 *
 * What this deliberately does NOT do:
 *   * guess a capture method. v1 recorded none, so every imported row is `imported` with
 *     origin `legacy`. A row that says "typed" would be a claim the database cannot support.
 *   * synthesise correction history. v1 edited text in place, so the earlier wordings are
 *     already gone. `legacy_edit_count` carries what v1 counted; `correction_count` stays 0
 *     so its invariant (`correction_count == COUNT(fragment_revisions)`) holds from the start.
 *   * import a soft-deleted or empty row as material.
 *
 * `INSERT OR IGNORE` on the shared id makes it idempotent and makes re-running it after a
 * partial failure safe.
 */
async function copyEntriesToFragments(db: RecordDb): Promise<number> {
  if (!(await tableExists(db, 'entries'))) {
    return 0;
  }
  const before = await countRows(db, 'fragments');

  const hasEngagement = await tableExists(db, 'entry_engagement');
  const editCount = hasEngagement
    ? `COALESCE((SELECT e2.edit_count FROM entry_engagement e2 WHERE e2.entry_id = e.id), 0)`
    : `0`;

  await db.execAsync(
    `INSERT OR IGNORE INTO fragments
       (id, body, captured_at, capture_method, capture_origin,
        corrected_at, correction_count, removed_at, legacy_entry_id, legacy_edit_count)
     SELECT
       e.id,
       e.text,
       e.created_at,
       'imported',
       'legacy',
       NULL,
       0,
       NULL,
       e.id,
       ${editCount}
     FROM entries e
     WHERE ${NOT_BLANK('e.text')}`
  );

  return (await countRows(db, 'fragments')) - before;
}

async function countRows(db: RecordDb, table: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return row?.n ?? 0;
}

export async function getMeta(db: RecordDb, key: string): Promise<string | null> {
  if (!(await tableExists(db, 'record_meta'))) {
    return null;
  }
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM record_meta WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setMeta(db: RecordDb, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO record_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}
