/**
 * What is left of a moment once its removal can no longer be undone.
 *
 * ## Where "for good" is
 *
 * Removal is soft and deferred (5.1–5.3): `remove` sets `removed_at` and writes a
 * `pending_removals` row; `bring back` is possible exactly while that row exists; and when
 * the window has passed, `publishDueRemovals` takes the row away and tombstones the legacy
 * entry. After that nothing on this phone can restore the moment — `bringBack` finds no row,
 * the record never shows removed material, and the bridge never re-projects a fragment that
 * exists removed. Remote tombstones now reach the Record through
 * `storage/entryRepository.ts` and use the same erasure operation.
 *
 * So the boundary is precise and durable: **`removed_at` set and no `pending_removals`
 * row**. It is decided inside the same transaction that publishes the removal, and a
 * `bring back` racing it loses cleanly, because both begin by deleting that one row.
 *
 * ## What goes, and what stays
 *
 * For every moment, at that boundary:
 *
 *   * the recording (`.m4a`) — deleted after the transaction commits;
 *   * current and earlier wording (`fragments.body`, `fragment_revisions`,
 *     `wording_conflicts`) and any machine transcript;
 *   * voice and encounter metadata, relationships, holds, and judgements;
 *   * search text, cached Traces and Returns that quote it.
 *
 * What stays is the content-free `fragments` row and sync outbox/suppression rows keyed on
 * the id. A pending audio-erasure path remains only until its file is removed. Those are what stop a
 * removed moment coming back through sync — the bridge will not re-project an id it already
 * holds as removed — and they carry no content.
 *
 * `fragment_revisions` is otherwise append-only. This is its one deletion, and it is made
 * because the person asked for the moment to be gone.
 */

import { tableExists, type RecordDb } from './db';
import { isRetainedAudioPath } from './files';
import { rebuildLineIndex } from './lineIndex';

/**
 * Erases a removed moment's content, inside the caller's transaction.
 *
 * Returns a recording to delete once the transaction has committed, or null.
 */
export async function eraseRemovedContent(db: RecordDb, fragmentId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ capture_method: string; audio_path: string | null }>(
    `SELECT f.capture_method, v.audio_path
       FROM fragments f
       LEFT JOIN voice_captures v ON v.fragment_id = f.id
      WHERE f.id = ? AND f.removed_at IS NOT NULL`,
    fragmentId
  );
  if (!row) return null;
  await db.runAsync('DELETE FROM wording_conflicts WHERE fragment_id = ?', fragmentId);
  // A Return about this moment, or one whose evidence quotes it (a shared phrase is words).
  await db.runAsync(
    `DELETE FROM returns
      WHERE fragment_id = ?
         OR id IN (SELECT return_id FROM return_evidence WHERE related_id = ?)`,
    fragmentId,
    fragmentId
  );
  // Cached relationships carry the shared words themselves as evidence.
  await db.runAsync('DELETE FROM traces WHERE fragment_id = ? OR related_id = ?', fragmentId, fragmentId);
  await db.runAsync('DELETE FROM trace_judgements WHERE fragment_id = ? OR related_id = ?', fragmentId, fragmentId);
  await db.runAsync('DELETE FROM holds WHERE fragment_id = ?', fragmentId);
  await db.runAsync('DELETE FROM continuations WHERE fragment_id = ? OR continues_id = ?', fragmentId, fragmentId);
  await db.runAsync('DELETE FROM encounters WHERE fragment_id = ?', fragmentId);
  await db.runAsync('DELETE FROM entry_engagement WHERE entry_id = ?', fragmentId);
  if (await tableExists(db, 'entry_themes')) {
    await db.runAsync('DELETE FROM entry_themes WHERE entry_id = ?', fragmentId);
  }
  await rebuildLineIndex(db);
  if (await tableExists(db, 'fragments_fts')) {
    await db.runAsync('DELETE FROM fragments_fts WHERE fragment_id = ?', fragmentId);
  }

  await db.runAsync('DELETE FROM fragment_revisions WHERE fragment_id = ?', fragmentId);
  // correction_count == COUNT(fragment_revisions) is an invariant, so it goes to zero with them.
  await db.runAsync(
    `UPDATE fragments SET body = '', correction_count = 0 WHERE id = ?`,
    fragmentId
  );
  await db.runAsync('DELETE FROM voice_transcripts WHERE fragment_id = ?', fragmentId);
  await db.runAsync('DELETE FROM voice_captures WHERE fragment_id = ?', fragmentId);

  if (row.audio_path && isRetainedAudioPath(row.audio_path)) {
    await db.runAsync(
      'INSERT OR IGNORE INTO pending_audio_erasure (fragment_id, audio_path) VALUES (?, ?)',
      fragmentId, row.audio_path
    );
    return row.audio_path;
  }
  return null;
}

export async function finishAudioErasure(db: RecordDb, path: string, deleteAudio: (path: string) => boolean): Promise<boolean> {
  if (!isRetainedAudioPath(path) || !deleteAudio(path)) return false;
  await db.runAsync('DELETE FROM pending_audio_erasure WHERE audio_path = ?', path);
  return true;
}

/** Removed for good: `removed_at` set and no `pending_removals` row. See the module comment. */
const REMOVED_FOR_GOOD = `f.removed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pending_removals p WHERE p.fragment_id = f.id)`;

export type SweepReport = {
  /** Removed-for-good moments whose content was still in the database. */
  erased: number;
  /** Recordings deleted from disk. */
  deletedFiles: number;
  /**
   * Files in the audio directory that nothing proves are removed for good — no fragment,
   * a name that is not an id, a live fragment that does not point at them. Kept.
   */
  keptUnproven: string[];
  /** The directory could not be listed; only the database half ran. */
  listingFailed: boolean;
};

export type SweepDeps = {
  listAudio: () => string[] | null;
  deleteAudio: (relativePath: string) => boolean;
};

let sweeping: Promise<SweepReport> | null = null;

/**
 * Finishes what earlier builds left: removals published before content was erased at the
 * boundary, and recordings whose erasure was interrupted between the database and the disk.
 *
 * Deletes only what it can prove is removed for good, by the rule above. A file with no
 * fragment at all is kept — a capture is briefly exactly that (8.14) — and reported.
 * Idempotent, never throws, and one sweep at a time.
 */
export function sweepRemovedVoice(db: RecordDb, deps: SweepDeps): Promise<SweepReport> {
  if (sweeping) return sweeping;
  sweeping = sweep(db, deps)
    .catch(
      (): SweepReport => ({ erased: 0, deletedFiles: 0, keptUnproven: [], listingFailed: true })
    )
    .finally(() => {
      sweeping = null;
    });
  return sweeping;
}

async function sweep(db: RecordDb, deps: SweepDeps): Promise<SweepReport> {
  const report: SweepReport = { erased: 0, deletedFiles: 0, keptUnproven: [], listingFailed: false };

  // 1. Content still in the database for moments removed for good.
  const owed = await db.getAllAsync<{ id: string }>(
    `SELECT f.id FROM fragments f
      WHERE ${REMOVED_FOR_GOOD}
        AND (f.body <> '' OR EXISTS (SELECT 1 FROM voice_captures v WHERE v.fragment_id = f.id)
          OR EXISTS (SELECT 1 FROM voice_transcripts t WHERE t.fragment_id = f.id)
          OR EXISTS (SELECT 1 FROM fragment_revisions r WHERE r.fragment_id = f.id)
          OR EXISTS (SELECT 1 FROM encounters e WHERE e.fragment_id = f.id)
          OR EXISTS (SELECT 1 FROM wording_conflicts w WHERE w.fragment_id = f.id)
          OR EXISTS (SELECT 1 FROM holds h WHERE h.fragment_id = f.id)
          OR EXISTS (SELECT 1 FROM continuations c WHERE c.fragment_id = f.id OR c.continues_id = f.id)
          OR EXISTS (SELECT 1 FROM trace_judgements j WHERE j.fragment_id = f.id OR j.related_id = f.id)
          OR EXISTS (SELECT 1 FROM traces tr WHERE tr.fragment_id = f.id OR tr.related_id = f.id)
          OR EXISTS (SELECT 1 FROM returns rt WHERE rt.fragment_id = f.id)
          OR EXISTS (SELECT 1 FROM return_evidence re WHERE re.related_id = f.id)
          OR EXISTS (SELECT 1 FROM entry_engagement eg WHERE eg.entry_id = f.id))`
  );
  for (const { id } of owed) {
    const done: { erased: boolean; audio: string | null } = { erased: false, audio: null };
    await db.withTransactionAsync(async () => {
      // Checked again inside the transaction: the rule is what licenses the erasure.
      const still = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM fragments f WHERE f.id = ? AND ${REMOVED_FOR_GOOD}`,
        id
      );
      if ((still?.n ?? 0) === 0) return;
      done.audio = await eraseRemovedContent(db, id);
      done.erased = true;
    });
    if (done.erased) report.erased += 1;
    if (done.audio && await finishAudioErasure(db, done.audio, deps.deleteAudio)) report.deletedFiles += 1;
  }

  // 2. Files on disk whose moment is removed for good but whose erasure did not reach them.
  const files = deps.listAudio();
  if (files === null) {
    report.listingFailed = true;
    return report;
  }
  const queued = await db.getAllAsync<{ audio_path: string }>('SELECT audio_path FROM pending_audio_erasure');
  const queuedPaths = new Set(queued.map((row) => row.audio_path));
  for (const { audio_path: path } of queued) {
    if (!files.includes(path)) {
      await db.runAsync('DELETE FROM pending_audio_erasure WHERE audio_path = ?', path);
    } else if (await finishAudioErasure(db, path, deps.deleteAudio)) {
      report.deletedFiles += 1;
    }
  }
  for (const path of files) {
    if (queuedPaths.has(path)) continue;
    if (!isRetainedAudioPath(path)) {
      report.keptUnproven.push(path);
      continue;
    }
    const claimed = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM voice_captures WHERE audio_path = ?',
      path
    );
    // Something still points at it: live, or inside its undo window. Not ours to touch.
    if ((claimed?.n ?? 0) > 0) continue;

    // Unclaimed. The file name is the fragment id (`audioPathFor`); only an exact match on
    // a voice moment that is removed for good proves anything.
    const id = path.slice(path.lastIndexOf('/') + 1, -'.m4a'.length);
    const owner = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM fragments f
        WHERE f.id = ? AND f.capture_method = 'voice' AND ${REMOVED_FOR_GOOD}`,
      id
    );
    if ((owner?.n ?? 0) > 0) {
      if (deps.deleteAudio(path)) report.deletedFiles += 1;
    } else {
      report.keptUnproven.push(path);
    }
  }
  return report;
}
