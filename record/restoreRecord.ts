import type { RecordArchive, ArchiveRow } from './archiveFormat';
import type { Digest } from './syncProtocol';
import { serializeRecordWrite, type RecordDb } from './db';
import { rebuildLineIndex } from './lineIndex';

export type RestorePreview = {
  newMoments: number; duplicates: number; changed: number; removed: number; waitingLinks: number;
  skippedJudgements: number; audioFiles: number; newArchived: number; from: string | null; to: string | null;
  sample: { body: string; at: string }[]; fingerprint: string;
};
const stopped = (signal?: AbortSignal, allowed = () => true) => {
  if (signal?.aborted || !allowed()) throw new Error('Restore cancelled. Your existing Record is unchanged.');
};
export async function previewRecordRestore(db: RecordDb, archive: RecordArchive, digest: Digest): Promise<RestorePreview> {
  const existing = new Map((await db.getAllAsync<{ id: string; body: string; captured_at: string; removed_at: string | null; correction_count: number }>(
    'SELECT id, body, captured_at, removed_at, correction_count FROM fragments')).map((r) => [r.id, r]));
  const blocked = new Set((await db.getAllAsync<{ id: string }>('SELECT id FROM firestore_ingest_suppressed_ids')).map((r) => r.id));
  const old = new Set((await db.getAllAsync<{ id: string }>('SELECT id FROM archived_material')).map((r) => r.id));
  const held = (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM holds WHERE released_at IS NULL'))?.n ?? 0;
  const added = archive.moments.filter((m) => !existing.has(String(m.fragment.id)) && !blocked.has(String(m.fragment.id)));
  const live = new Set([...existing.values()].filter((r) => !r.removed_at && !blocked.has(r.id)).map((r) => r.id));
  added.forEach((m) => live.add(String(m.fragment.id)));
  for (const m of archive.moments) {
    const row = existing.get(String(m.fragment.id));
    if (row && Date.parse(row.captured_at) !== Date.parse(String(m.fragment.captured_at))) throw new Error('A moment ID belongs to a different capture. The archive cannot be combined safely.');
  }
  const newHolds = added.filter((m) => m.holds.some((h) => h.released_at === null)).length;
  if (held + newHolds > 5) throw new Error(`Release ${held + newHolds - 5} held thoughts before restoring this archive.`);
  const dates = added.map((m) => String(m.fragment.captured_at)).sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    newMoments: added.length,
    duplicates: archive.moments.filter((m) => existing.has(String(m.fragment.id)) && !existing.get(String(m.fragment.id))!.removed_at && !blocked.has(String(m.fragment.id))).length,
    changed: archive.moments.filter((m) => { const r = existing.get(String(m.fragment.id)); return r && !r.removed_at && (r.body !== m.fragment.body || r.correction_count !== m.fragment.correction_count); }).length,
    removed: archive.moments.filter((m) => blocked.has(String(m.fragment.id)) || existing.get(String(m.fragment.id))?.removed_at).length,
    waitingLinks: added.filter((m) => m.continuations.some((c) => !live.has(String(c.continues_id)))).length,
    skippedJudgements: added.reduce((n, m) => n + m.judgements.filter((j) => !live.has(String(j.related_id))).length, 0),
    audioFiles: added.filter((m) => m.audio !== null).length,
    newArchived: archive.archived.filter((r) => !old.has(String(r.id))).length,
    from: dates[0] ?? null, to: dates[dates.length - 1] ?? null,
    sample: added.slice(0, 3).map((m) => ({ body: String(m.fragment.body).slice(0, 220), at: String(m.fragment.captured_at) })),
    fingerprint: await digest(JSON.stringify([archive.moments.map((m) => [m.fragment.id, existing.get(String(m.fragment.id)) ?? null, blocked.has(String(m.fragment.id))]), held, [...old].sort()])),
  };
}
export type RestoreFiles = {
  recovery(db: RecordDb): Promise<void>;
  install(id: string, audio: { path: string; bytes: number } | null): Promise<string>;
  rollback(): Promise<void>;
  finish(): Promise<void>;
};
async function insert(db: RecordDb, table: string, row: ArchiveRow) {
  const keys = Object.keys(row);
  // Both table names and columns come from the format's fixed allowlist, never archive SQL.
  return db.runAsync(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((key) => row[key]));
}
export const restoreRecord = serializeRecordWrite(async (
  db: RecordDb, archive: RecordArchive, preview: RestorePreview, digest: Digest, files: RestoreFiles,
  signal?: AbortSignal, allowed: () => boolean = () => true,
): Promise<RestorePreview> => {
  stopped(signal, allowed);
  const current = await previewRecordRestore(db, archive, digest);
  if (current.fingerprint !== preview.fingerprint) throw new Error('The Record changed after the preview. Choose the archive again to review it.');
  if (!current.newMoments && !current.newArchived) return current;
  await files.recovery(db);
  stopped(signal, allowed);
  let committed = false;
  try {
    await db.withTransactionAsync(async () => {
      const existing = new Set((await db.getAllAsync<{ id: string }>('SELECT id FROM fragments UNION SELECT id FROM firestore_ingest_suppressed_ids')).map((r) => r.id));
      const added = archive.moments.filter((m) => !existing.has(String(m.fragment.id)));
      for (const m of added) {
        stopped(signal, allowed);
        const id = String(m.fragment.id);
        await insert(db, 'fragments', m.fragment);
        for (const row of m.revisions) await insert(db, 'fragment_revisions', { ...row, fragment_id: id });
        for (const row of m.holds) await insert(db, 'holds', { ...row, fragment_id: id });
        for (const encounter of m.encounters) {
          const made = await insert(db, 'encounters', { ...encounter.row, fragment_id: id });
          if (encounter.enrichment) await insert(db, 'encounter_enrichment', { ...encounter.enrichment, encounter_id: made.lastInsertRowId });
        }
        if (m.voice) {
          const path = await files.install(id, m.audio);
          await insert(db, 'voice_captures', { ...m.voice, fragment_id: id, audio_path: path });
        }
        if (m.transcript) await insert(db, 'voice_transcripts', { ...m.transcript, fragment_id: id });
        if (m.conflict) await insert(db, 'wording_conflicts', { ...m.conflict, fragment_id: id });
        if (m.wording) await db.runAsync('UPDATE record_sync_state SET state = ?, dirty = 1 WHERE fragment_id = ?', m.wording, id);
      }
      const live = new Set((await db.getAllAsync<{ id: string }>(
        'SELECT id FROM fragments WHERE removed_at IS NULL AND id NOT IN (SELECT id FROM firestore_ingest_suppressed_ids)')).map((r) => r.id));
      for (const m of added) {
        stopped(signal, allowed); const id = String(m.fragment.id);
        for (const row of m.continuations) {
          const target = String(row.continues_id);
          // Missing predecessors remain pending, without inventing a placeholder fragment.
          const removed = await db.getFirstAsync<{ id: string }>('SELECT id FROM fragments WHERE id = ? AND removed_at IS NOT NULL UNION SELECT id FROM firestore_ingest_suppressed_ids WHERE id = ?', target, target);
          if (!removed) {
            await insert(db, 'record_sync_links', { ...row, fragment_id: id });
            if (live.has(target)) await insert(db, 'continuations', { ...row, fragment_id: id });
          }
        }
        for (const row of m.judgements) if (live.has(String(row.related_id))) await insert(db, 'trace_judgements', { ...row, fragment_id: id });
      }
      const pending = await db.getAllAsync<{ fragment_id: string; continues_id: string; linked_at: string; origin: string }>(
        `SELECT l.* FROM record_sync_links l JOIN fragments f ON f.id=l.fragment_id AND f.removed_at IS NULL
         JOIN fragments p ON p.id=l.continues_id AND p.removed_at IS NULL
         WHERE NOT EXISTS(SELECT 1 FROM continuations c WHERE c.fragment_id=l.fragment_id)
         AND NOT EXISTS(SELECT 1 FROM firestore_ingest_suppressed_ids s WHERE s.id=l.fragment_id OR s.id=l.continues_id)`);
      for (const link of pending) {
        const cycle = await db.getFirstAsync(`WITH RECURSIVE ancestors(id) AS (
          SELECT ? UNION SELECT c.continues_id FROM continuations c JOIN ancestors a ON c.fragment_id=a.id
        ) SELECT id FROM ancestors WHERE id=? LIMIT 1`, link.continues_id, link.fragment_id);
        if (!cycle) await insert(db, 'continuations', link);
      }
      const old = new Set((await db.getAllAsync<{ id: string }>('SELECT id FROM archived_material')).map((r) => r.id));
      for (const row of archive.archived) if (!old.has(String(row.id))) await insert(db, 'archived_material', row);
      await rebuildLineIndex(db);
      const fts = await db.getFirstAsync<{ value: string }>("SELECT value FROM record_meta WHERE key = 'fts.available'");
      if (fts?.value === '1') for (const m of added) await db.runAsync(
        `INSERT INTO fragments_fts (fragment_id, body, transcript, source)
         SELECT f.id, f.body, COALESCE(t.machine_transcript,''), COALESCE((
           SELECT group_concat(e.url_raw || ' ' || COALESCE(e.selected_text,'') || ' ' || COALESCE(x.url_canonical,'') || ' ' ||
             COALESCE(x.title,'') || ' ' || COALESCE(x.domain,'') || ' ' || COALESCE(x.site_name,'') || ' ' || COALESCE(x.extraction,''), ' ')
           FROM encounters e LEFT JOIN encounter_enrichment x ON x.encounter_id=e.id WHERE e.fragment_id=f.id
         ), '') FROM fragments f LEFT JOIN voice_transcripts t ON t.fragment_id=f.id WHERE f.id=?`, m.fragment.id);
      // Bridge the restored words without changing dates or inventing a capture method.
      for (const m of added) await db.runAsync('INSERT OR IGNORE INTO entries (id,text,created_at) VALUES (?,?,?)', m.fragment.id, m.fragment.body, m.fragment.captured_at);
      stopped(signal, allowed);
    });
    committed = true;
    return current;
  } finally {
    if (!committed) await files.rollback();
    else await files.finish().catch(() => { /* A retained journal is retried on launch. */ });
  }
});
