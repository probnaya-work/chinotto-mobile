import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { RecordDb } from '../record/db';

import type { Entry } from '../types/entry';
import { getDatabase } from '../storage/db';
import { runSerializedDb } from '../storage/runSerializedDb';

/** `payload.id` is the stable entry id; remote ingest should dedupe on it when sync retries. */
export type SyncItem = {
  id: string;
  payload: Entry;
  status: 'pending' | 'synced';
};

function rowToSyncItem(row: { id: string; payload: string; status: string }): SyncItem {
  const payload = JSON.parse(row.payload) as Entry;
  const status = row.status === 'synced' ? 'synced' : 'pending';
  return { id: row.id, payload, status };
}

/** Insert one pending row using an existing DB handle (e.g. inside `withTransactionAsync`). */
export async function insertPendingSyncItem(db: SQLiteDatabase, entry: Entry): Promise<void> {
  const id = randomUUID();
  await db.runAsync(
    'INSERT INTO sync_queue (id, payload, status) VALUES (?, ?, ?)',
    id,
    JSON.stringify(entry),
    'pending'
  );
}

/**
 * Enqueue a pending sync row on its own DB pass.
 * **Capture path:** `saveEntry` uses `insertPendingSyncItem` inside the same transaction as the entry insert — prefer that for new thoughts. This helper remains for tests and any non-save enqueue needs.
 */
export async function enqueueForSync(entry: Entry): Promise<void> {
  await runSerializedDb(async () => {
    const db = await getDatabase();
    await insertPendingSyncItem(db, entry);
  });
}

export async function getPendingSyncItems(limit: number): Promise<SyncItem[]> {
  return runSerializedDb(async () => {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ id: string; payload: string; status: string }>(
      `SELECT id, payload, status FROM sync_queue WHERE status = 'pending' ORDER BY rowid ASC LIMIT ?`,
      limit
    );
    return rows.map(rowToSyncItem);
  });
}

/** Pending create-sync rows (upload not yet marked synced). */
export async function getPendingSyncCount(): Promise<number> {
  return runSerializedDb(async () => {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM sync_queue WHERE status = 'pending'`
    );
    return row?.c ?? 0;
  });
}

export async function markSynced(queueItemId: string): Promise<void> {
  await runSerializedDb(async () => {
    const db = await getDatabase();
    await db.runAsync("UPDATE sync_queue SET status = 'synced' WHERE id = ?", queueItemId);
  });
}

/** Remove pending create-sync rows for an entry (e.g. after local delete before push). */
/** Clears operational sync upload state after account deletion (local entries are untouched). */
export async function clearPendingSyncQueue(): Promise<void> {
  await runSerializedDb(async () => {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM sync_queue WHERE status = 'pending'`);
  });
}

export async function removePendingSyncItemsForEntry(db: RecordDb, entryId: string): Promise<void> {
  const rows = await db.getAllAsync<{ id: string; payload: string }>(
    `SELECT id, payload FROM sync_queue WHERE status = 'pending'`
  );
  for (const row of rows) {
    try {
      const p = JSON.parse(row.payload) as { id?: string };
      if (p != null && typeof p.id === 'string' && p.id === entryId) {
        await db.runAsync('DELETE FROM sync_queue WHERE id = ?', row.id);
      }
    } catch {
      /* ignore malformed */
    }
  }
}
