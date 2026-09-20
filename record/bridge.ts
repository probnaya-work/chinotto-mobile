/**
 * Temporary compatibility boundary between the Record and legacy `entries`.
 *
 * The Record is canonical on this phone. `entries` survives only because the deployed
 * Firestore protocol and the desktop app's own bridge both speak it, and neither can be
 * changed from here. This module is the whole of that compatibility surface, and it is meant
 * to be deleted.
 *
 * ## The one rule
 *
 * The legacy model is `{ id, text, created_at }`. It cannot express a Line, a correction
 * history, retained audio or an encounter. So the bridge **degrades** — it sends the parts
 * that fit and leaves the rest behind — and never **fabricates**: it does not invent a
 * capture method it was not told, does not flatten two dated moments into one entry with
 * appended text, and does not synthesise revisions from a text change arriving over sync.
 *
 * ## Loops
 *
 * Both directions are keyed on the same id, which makes the id the idempotency token:
 *
 *   * a fragment mirrored out keeps its id, so when that row comes back through ingest it
 *     finds the fragment already there and does nothing;
 *   * an entry projected in keeps its id, so mirroring it back out writes the same row.
 *
 * ## What the wire cannot carry, and what happens to it
 *
 * | Stays local | Because |
 * |---|---|
 * | retained audio | the protocol has no blob path, and the audio is the canonical source |
 * | encounters, `url_key`, selected text | no columns; re-derived locally on each device |
 * | `continuations` | see `mirrorFragment` — a Continue is its own entry, never appended |
 * | `fragment_revisions` | no wording history on the wire (see 6.7 in unspecified-decisions) |
 * | holds, traces, judgements, returns | decisions and caches, not material |
 */

import { NOT_BLANK } from './migrate';
import type { RecordDb } from './db';

export type LegacyEntryRow = {
  id: string;
  text: string;
  createdAt: string;
};

export type BridgeOptions = {
  now?: () => number;
  /** Enqueue for the existing sync engine. Omitted in tests and when sync is not configured. */
  enqueue?: (db: RecordDb, entry: LegacyEntryRow) => Promise<void>;
  /** Remove queued work for an id, ahead of a tombstone. */
  dequeue?: (db: RecordDb, id: string) => Promise<void>;
  /** Suppression + tombstone outbox, as the v1 delete path does it. */
  tombstone?: (db: RecordDb, id: string) => Promise<void>;
};

const iso = (ms: number) => new Date(ms).toISOString();

export function createBridge(db: RecordDb, options: BridgeOptions = {}) {
  const now = options.now ?? (() => Date.now());

  /**
   * Mirrors one fragment into `entries` so the existing sync can carry it.
   *
   * Idempotent: mirroring twice updates the same row rather than creating a second one.
   *
   * A fragment with an empty body is skipped — a voice capture exists before its transcript
   * does, and the ingest path rejects empty text anyway. It is mirrored later, when there is
   * something to mirror.
   *
   * A Continue is mirrored as **its own entry**, with its own id and its own date. It is
   * never appended to the text of the moment it continues: that would rewrite something the
   * person wrote at a different time, and the Line would be unrecoverable afterwards.
   */
  async function mirrorFragment(fragmentId: string): Promise<boolean> {
    const row = await db.getFirstAsync<{
      body: string;
      captured_at: string;
      removed_at: string | null;
    }>('SELECT body, captured_at, removed_at FROM fragments WHERE id = ?', fragmentId);

    if (!row) return false;
    if (row.removed_at !== null) return false;
    if (!row.body || !row.body.trim()) return false;

    // Never resurrect something removed on another device.
    const suppressed = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM firestore_ingest_suppressed_ids WHERE id = ?',
      fragmentId
    );
    if ((suppressed?.n ?? 0) > 0) return false;

    const entry: LegacyEntryRow = {
      id: fragmentId,
      text: row.body.trim(),
      createdAt: row.captured_at,
    };

    await db.runAsync(
      `INSERT INTO entries (id, text, created_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET text = excluded.text`,
      entry.id,
      entry.text,
      entry.createdAt
    );

    if (options.dequeue) await options.dequeue(db, entry.id);
    if (options.enqueue) await options.enqueue(db, entry);
    return true;
  }

  /** Mirrors everything the Record holds that the legacy table has not seen. */
  async function mirrorCatchUp(limit = 500): Promise<number> {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT f.id FROM fragments f
         LEFT JOIN entries e ON e.id = f.id
        WHERE f.removed_at IS NULL
          AND ${NOT_BLANK('f.body')}
          AND (e.id IS NULL OR e.text <> TRIM(f.body))
        ORDER BY f.captured_at DESC
        LIMIT ?`,
      limit
    );
    let n = 0;
    for (const r of rows) {
      if (await mirrorFragment(r.id)) n += 1;
    }
    return n;
  }

  /**
   * Projects one legacy entry into the Record.
   *
   * `capture_method` is `imported` and the origin is whatever we were told — never a guess.
   * The sync payload says nothing about how a thing was captured, so the Record records that
   * it does not know.
   *
   * Returns what happened, because the three cases are genuinely different:
   *   * `created`   — new material arrived
   *   * `unchanged` — we already have it, identical
   *   * `conflict`  — we already have it and the wording differs (see `noticeRemoteWording`)
   */
  async function projectEntry(
    entry: LegacyEntryRow,
    origin: string = 'desktop'
  ): Promise<'created' | 'unchanged' | 'conflict'> {
    if (!entry.text || !entry.text.trim()) return 'unchanged';

    const existing = await db.getFirstAsync<{ body: string; removed_at: string | null }>(
      'SELECT body, removed_at FROM fragments WHERE id = ?',
      entry.id
    );

    if (!existing) {
      await db.runAsync(
        `INSERT INTO fragments (id, body, captured_at, capture_method, capture_origin, legacy_entry_id)
         VALUES (?, ?, ?, 'imported', ?, ?)`,
        entry.id,
        entry.text,
        entry.createdAt,
        origin,
        entry.id
      );
      return 'created';
    }

    if (existing.body === entry.text) return 'unchanged';

    await noticeRemoteWording(entry.id, entry.text, existing.body);
    return 'conflict';
  }

  /**
   * The same moment, worded in two places while the devices were apart.
   *
   * What is **not** done here is the point of it. The remote text is not written into the
   * fragment, and it is not pushed onto `fragment_revisions` — a revision means "this is a
   * wording that was replaced here", and nothing of the sort happened. The legacy contract
   * carries no wording history, so which one is later is genuinely unknown, and inventing an
   * order would be the product overwriting words somebody wrote.
   *
   * The record keeps showing the local wording until the person says otherwise.
   */
  async function noticeRemoteWording(
    fragmentId: string,
    remoteText: string,
    localText: string
  ): Promise<void> {
    await db.runAsync(
      `INSERT INTO wording_conflicts (fragment_id, remote_text, local_text, noticed_at, shows)
       VALUES (?, ?, ?, ?, 'local')
       ON CONFLICT(fragment_id) DO UPDATE SET
         remote_text = excluded.remote_text,
         local_text  = excluded.local_text,
         noticed_at  = excluded.noticed_at`,
      fragmentId,
      remoteText,
      localText,
      iso(now())
    );
  }

  /** Unresolved conflicts, for the sync surface's `one moment was worded twice · both kept`. */
  async function openConflicts(): Promise<
    { fragmentId: string; remoteText: string; localText: string; shows: 'local' | 'remote'; noticedAt: number }[]
  > {
    const rows = await db.getAllAsync<{
      fragment_id: string;
      remote_text: string;
      local_text: string;
      shows: 'local' | 'remote';
      noticed_at: string;
    }>(
      'SELECT fragment_id, remote_text, local_text, shows, noticed_at FROM wording_conflicts WHERE resolved_at IS NULL ORDER BY noticed_at DESC'
    );
    return rows.map((r) => ({
      fragmentId: r.fragment_id,
      remoteText: r.remote_text,
      localText: r.local_text,
      shows: r.shows,
      noticedAt: new Date(r.noticed_at).getTime(),
    }));
  }

  /**
   * `show this one instead`. Choosing the remote wording is a correction like any other, so
   * it goes through the revision history — the local wording is kept, under the moment, as
   * `earlier wording`. Nothing is thrown away either way.
   */
  async function resolveConflict(
    fragmentId: string,
    keep: 'local' | 'remote',
    correct: (id: string, body: string) => Promise<unknown>
  ): Promise<void> {
    const row = await db.getFirstAsync<{ remote_text: string }>(
      'SELECT remote_text FROM wording_conflicts WHERE fragment_id = ? AND resolved_at IS NULL',
      fragmentId
    );
    if (!row) return;
    if (keep === 'remote') await correct(fragmentId, row.remote_text);
    await db.runAsync(
      'UPDATE wording_conflicts SET shows = ?, resolved_at = ? WHERE fragment_id = ?',
      keep,
      iso(now()),
      fragmentId
    );
  }

  /**
   * A removal arriving from another device soft-removes here rather than destroying, so the
   * material is still recoverable from this phone if the removal turns out to be a mistake
   * made somewhere else.
   */
  async function applyRemoteTombstone(fragmentId: string): Promise<boolean> {
    const res = await db.runAsync(
      'UPDATE fragments SET removed_at = ? WHERE id = ? AND removed_at IS NULL',
      iso(now()),
      fragmentId
    );
    await db.runAsync('DELETE FROM entries WHERE id = ?', fragmentId);
    await db.runAsync('DELETE FROM pending_removals WHERE fragment_id = ?', fragmentId);
    return res.changes > 0;
  }

  /**
   * Publishes removals whose undo window has passed.
   *
   * This is the other half of the eight seconds. Nothing reaches the network until the
   * window is over, so a `bring back` on either device can still find the material.
   */
  async function publishDueRemovals(dueIds: string[]): Promise<number> {
    let n = 0;
    for (const id of dueIds) {
      await db.runAsync('DELETE FROM entries WHERE id = ?', id);
      if (options.dequeue) await options.dequeue(db, id);
      if (options.tombstone) await options.tombstone(db, id);
      await db.runAsync('DELETE FROM pending_removals WHERE fragment_id = ?', id);
      n += 1;
    }
    return n;
  }

  return {
    mirrorFragment,
    mirrorCatchUp,
    projectEntry,
    noticeRemoteWording,
    openConflicts,
    resolveConflict,
    applyRemoteTombstone,
    publishDueRemovals,
  };
}

export type RecordBridge = ReturnType<typeof createBridge>;
