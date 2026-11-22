import type { RecordDb } from './db';
import { rebuildLineIndex } from './lineIndex';
import { prepareRecordSync, type Digest, type SyncCommit, type SyncSnapshot } from './syncProtocol';

type RunDb = <T>(task: () => Promise<T>) => Promise<T>;

export async function readSyncSnapshot(db: RecordDb, id: string): Promise<SyncSnapshot | null> {
  const row = await db.getFirstAsync<{
    id: string; body: string; captured_at: string; state: string | null;
    generation: number; dirty: number; resolved_at: string | null;
  }>(`SELECT f.id, f.body, f.captured_at, s.state, s.generation, s.dirty, w.resolved_at
       FROM fragments f JOIN record_sync_state s ON s.fragment_id = f.id
       LEFT JOIN wording_conflicts w ON w.fragment_id = f.id
      WHERE f.id = ? AND f.removed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM firestore_ingest_suppressed_ids x WHERE x.id = f.id)`, id);
  if (!row || !row.body.trim()) return null;
  const history = await db.getAllAsync<{ body: string; supersededAt: string }>(
    'SELECT body, superseded_at AS supersededAt FROM fragment_revisions WHERE fragment_id = ? ORDER BY revision_index', id);
  const continuation = await db.getFirstAsync<NonNullable<SyncSnapshot['continuation']>>(
    `SELECT continues_id AS continuesId, linked_at AS linkedAt, origin FROM continuations WHERE fragment_id = ?
       UNION ALL SELECT continues_id AS continuesId, linked_at AS linkedAt, origin
         FROM record_sync_links WHERE fragment_id = ? LIMIT 1`, id, id);
  return {
    id, body: row.body, capturedAt: row.captured_at, history, continuation,
    state: row.state, generation: row.generation, dirty: row.dirty !== 0, resolvedAt: row.resolved_at,
  };
}
/** Optimistic commit: an edit made while metadata was being prepared always wins the race. */
export async function commitRecordSync(db: RecordDb, commit: SyncCommit): Promise<boolean> {
  let committed = false;
  await db.withTransactionAsync(async () => {
    const before = await readSyncSnapshot(db, commit.snapshot.id);
    if (!before || before.body !== commit.snapshot.body ||
        before.history.length !== commit.snapshot.history.length ||
        before.generation !== commit.snapshot.generation || before.state !== commit.snapshot.state) return;
    if (commit.state === before.state && !commit.revisions.length && commit.body === before.body) {
      committed = true;
      return;
    }
    for (let i = 0; i < commit.revisions.length; i += 1) {
      const r = commit.revisions[i];
      await db.runAsync(
        'INSERT INTO fragment_revisions (fragment_id, body, superseded_at, revision_index) VALUES (?, ?, ?, ?)',
        before.id, r.body, r.supersededAt, before.history.length + i);
    }
    await db.runAsync(
      'UPDATE fragments SET body = ?, corrected_at = ?, correction_count = ? WHERE id = ?',
      commit.body, commit.correctedAt, before.history.length + commit.revisions.length, before.id);
    await db.runAsync('UPDATE entries SET text = ? WHERE id = ?', commit.body.trim(), before.id);
    if (commit.conflict !== null) {
      await db.runAsync(
        `INSERT INTO wording_conflicts (fragment_id, remote_text, local_text, noticed_at, shows)
         VALUES (?, ?, ?, ?, 'local') ON CONFLICT(fragment_id) DO UPDATE SET
         remote_text = excluded.remote_text, local_text = excluded.local_text,
         noticed_at = excluded.noticed_at, resolved_at = NULL`,
        before.id, commit.conflict, commit.body, new Date().toISOString());
    } else {
      await db.runAsync('DELETE FROM wording_conflicts WHERE fragment_id = ?', before.id);
    }
    const link = commit.wire.continuation;
    if (link) {
      const removed = await db.getFirstAsync<{ n: number }>(
        `SELECT 1 AS n FROM firestore_ingest_suppressed_ids WHERE id = ?
         UNION ALL SELECT 1 AS n FROM fragments WHERE id = ? AND removed_at IS NOT NULL LIMIT 1`,
        link.continuesId, link.continuesId);
      if (!removed) await db.runAsync(
        'INSERT OR IGNORE INTO record_sync_links (fragment_id, continues_id, linked_at, origin) VALUES (?, ?, ?, ?)',
        before.id, link.continuesId, link.linkedAt, link.origin);
    }
    await db.runAsync(
      'UPDATE record_sync_state SET state = ?, dirty = ?, error = NULL WHERE fragment_id = ?',
      commit.state, before.dirty ? 1 : 0, before.id);
    // Keep Find's cache consistent where this build has FTS5.
    const fts = await db.getFirstAsync<{ value: string }>("SELECT value FROM record_meta WHERE key = 'fts.available'");
    if (fts?.value === '1') {
      await db.runAsync('DELETE FROM fragments_fts WHERE fragment_id = ?', before.id);
      await db.runAsync(
        `INSERT INTO fragments_fts (body, transcript, source, fragment_id)
         SELECT f.body, COALESCE(t.machine_transcript, ''),
           COALESCE(e.url_raw, '') || ' ' || COALESCE(e.selected_text, '') || ' ' ||
           COALESCE(x.title, '') || ' ' || COALESCE(x.domain, ''), f.id
         FROM fragments f LEFT JOIN voice_transcripts t ON t.fragment_id = f.id
         LEFT JOIN encounters e ON e.fragment_id = f.id
         LEFT JOIN encounter_enrichment x ON x.encounter_id = e.id WHERE f.id = ?`, before.id);
    }
    committed = true;
  });
  return committed;
}
/** Edges can arrive before either endpoint. Never use a placeholder fragment to satisfy an FK. */
export async function applyPendingSyncLinks(db: RecordDb): Promise<number> {
  const rows = await db.getAllAsync<{
    fragment_id: string; continues_id: string; linked_at: string; origin: string;
  }>(`SELECT l.* FROM record_sync_links l
      JOIN fragments f ON f.id = l.fragment_id AND f.removed_at IS NULL
      JOIN fragments p ON p.id = l.continues_id AND p.removed_at IS NULL
      WHERE NOT EXISTS (SELECT 1 FROM continuations c WHERE c.fragment_id = l.fragment_id)
        AND NOT EXISTS (SELECT 1 FROM firestore_ingest_suppressed_ids s
          WHERE s.id = l.fragment_id OR s.id = l.continues_id)`);
  let changed = 0;
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const cycle = await db.getFirstAsync<{ id: string }>(
        `WITH RECURSIVE ancestors(id) AS (
           SELECT ? UNION SELECT c.continues_id FROM continuations c JOIN ancestors a ON c.fragment_id = a.id
         ) SELECT id FROM ancestors WHERE id = ? LIMIT 1`, row.continues_id, row.fragment_id);
      if (cycle) continue;
      const result = await db.runAsync(
        'INSERT OR IGNORE INTO continuations (fragment_id, continues_id, linked_at, origin) VALUES (?, ?, ?, ?)',
        row.fragment_id, row.continues_id, row.linked_at, row.origin);
      changed += result.changes;
    }
    if (changed) await rebuildLineIndex(db);
  });
  return changed;
}
export async function prepareStoredRecord(
  db: RecordDb, id: string, digest: Digest, incoming?: { wire: unknown; text: string },
  runDb: RunDb = (task) => task(),
): Promise<SyncCommit | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await runDb(() => readSyncSnapshot(db, id));
    if (!snapshot) return null;
    const commit = await prepareRecordSync(snapshot, digest, incoming);
    if (await runDb(() => commitRecordSync(db, commit))) {
      await runDb(() => applyPendingSyncLinks(db));
      return commit;
    }
  }
  throw new Error('Record changed during sync; retrying later');
}

export async function ensureIncomingSyncFragment(db: RecordDb, id: string, text: string, createdAt: string): Promise<boolean> {
  const removed = await db.getFirstAsync<{ n: number }>(
    `SELECT 1 AS n FROM firestore_ingest_suppressed_ids WHERE id = ?
     UNION ALL SELECT 1 AS n FROM fragments WHERE id = ? AND removed_at IS NOT NULL LIMIT 1`, id, id);
  if (removed) return false;
  await db.runAsync(
    `INSERT OR IGNORE INTO fragments (id, body, captured_at, capture_method, capture_origin, legacy_entry_id)
     VALUES (?, ?, ?, 'imported', 'sync', ?)`, id, text, createdAt, id);
  return true;
}
export async function pendingRecordSyncIds(db: RecordDb, limit = 25): Promise<string[]> {
  const rows = await db.getAllAsync<{ fragment_id: string }>(
    `SELECT s.fragment_id FROM record_sync_state s JOIN fragments f ON f.id = s.fragment_id
      WHERE s.dirty = 1 AND f.removed_at IS NULL AND TRIM(f.body) <> ''
      ORDER BY s.error IS NOT NULL,
               CASE WHEN s.error IS NULL THEN s.touched_at END DESC, s.touched_at, s.rowid LIMIT ?`, limit);
  return rows.map((r) => r.fragment_id);
}
export async function acknowledgeRecordSync(db: RecordDb, id: string, generation: number): Promise<void> {
  await db.runAsync('UPDATE record_sync_state SET dirty = 0, error = NULL WHERE fragment_id = ? AND generation = ?', id, generation);
}
export async function activateRecordSyncUser(db: RecordDb, uid: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    const last = await db.getFirstAsync<{ value: string }>("SELECT uid AS value FROM record_sync_account WHERE id = 1");
    if (last?.value === uid) return;
    await db.runAsync('UPDATE record_sync_state SET dirty = 1, error = NULL');
    await db.runAsync(
      "INSERT INTO record_sync_account (id, uid) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET uid = excluded.uid", uid);
  });
}

