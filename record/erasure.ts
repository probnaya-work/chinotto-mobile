/**
 * What is left of a voice moment once its removal can no longer be undone.
 *
 * ## Where "for good" is
 *
 * Removal is soft and deferred (5.1–5.3): `remove` sets `removed_at` and writes a
 * `pending_removals` row; `bring back` is possible exactly while that row exists; and when
 * the window has passed, `publishDueRemovals` takes the row away and tombstones the legacy
 * entry. After that nothing on this phone can restore the moment — `bringBack` finds no row,
 * the record never shows removed material, and the bridge never re-projects a fragment that
 * exists removed. Remote tombstones do not reach the Record at all (`applyRemoteTombstone`
 * has no caller), so a local removal is the only way material leaves it.
 *
 * So the boundary is precise and durable: **`removed_at` set and no `pending_removals`
 * row**. It is decided inside the same transaction that publishes the removal, and a
 * `bring back` racing it loses cleanly, because both begin by deleting that one row.
 *
 * ## What goes, and what stays
 *
 * For a voice moment, at that boundary:
 *
 *   * the recording (`.m4a`) — deleted after the transaction commits;
 *   * the machine transcript, the wording it became (`fragments.body`) and every earlier
 *     wording (`fragment_revisions`, `wording_conflicts`) — the words are the recording's
 *     content, whoever typed the last version of them;
 *   * the voice metadata — duration, path, transcript state, failure, model;
 *   * search text, cached Traces and Returns that quote it.
 *
 * What stays is the `fragments` row with its id, `captured_at`, `capture_method` and
 * `removed_at`, and the sync outbox/suppression rows keyed on the id. Those are what stop a
 * removed moment coming back through sync — the bridge will not re-project an id it already
 * holds as removed — and they carry no content.
 *
 * `fragment_revisions` is otherwise append-only. This is its one deletion, and it is made
 * because the person asked for the moment to be gone.
 */

import { tableExists, type RecordDb } from './db';
import { isRetainedAudioPath } from './files';

/**
 * Erases a removed voice moment's content, inside the caller's transaction.
 *
 * Returns the recording to delete once the transaction has committed, or null. Idempotent:
 * a second call finds nothing left and changes nothing. A moment that is not voice is left
 * alone — only voice content is in scope here.
 */
export async function eraseVoiceContent(db: RecordDb, fragmentId: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ capture_method: string; audio_path: string | null }>(
    `SELECT f.capture_method, v.audio_path
       FROM fragments f
       LEFT JOIN voice_captures v ON v.fragment_id = f.id
      WHERE f.id = ? AND f.removed_at IS NOT NULL`,
    fragmentId
  );
  if (!row) return null;
  if (row.capture_method !== 'voice' && row.audio_path === null) return null;

  await db.runAsync('DELETE FROM fragment_revisions WHERE fragment_id = ?', fragmentId);
  // correction_count == COUNT(fragment_revisions) is an invariant, so it goes to zero with them.
  await db.runAsync(
    `UPDATE fragments SET body = '', correction_count = 0 WHERE id = ?`,
    fragmentId
  );
  await db.runAsync('DELETE FROM voice_transcripts WHERE fragment_id = ?', fragmentId);
  await db.runAsync('DELETE FROM voice_captures WHERE fragment_id = ?', fragmentId);
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
  if (await tableExists(db, 'fragments_fts')) {
    await db.runAsync('DELETE FROM fragments_fts WHERE fragment_id = ?', fragmentId);
  }

  return row.audio_path && isRetainedAudioPath(row.audio_path) ? row.audio_path : null;
}

/** Removed for good: `removed_at` set and no `pending_removals` row. See the module comment. */
const REMOVED_FOR_GOOD = `f.removed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pending_removals p WHERE p.fragment_id = f.id)`;

export type SweepReport = {
  /** Removed-for-good voice moments whose content was still in the database. */
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
        AND (EXISTS (SELECT 1 FROM voice_captures v WHERE v.fragment_id = f.id)
          OR EXISTS (SELECT 1 FROM voice_transcripts t WHERE t.fragment_id = f.id))`
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
      done.audio = await eraseVoiceContent(db, id);
      done.erased = true;
    });
    if (done.erased) report.erased += 1;
    if (done.audio && deps.deleteAudio(done.audio)) report.deletedFiles += 1;
  }

  // 2. Files on disk whose moment is removed for good but whose erasure did not reach them.
  const files = deps.listAudio();
  if (files === null) {
    report.listingFailed = true;
    return report;
  }
  for (const path of files) {
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
