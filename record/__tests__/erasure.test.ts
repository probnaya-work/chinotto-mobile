/**
 * Removed for good means gone: the recording and its words, at the moment a removal can no
 * longer be brought back — and not a moment before.
 */

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { createBridge } from '../bridge';
import { sweepRemovedVoice } from '../erasure';
import { migrate } from '../migrate';
import { createRecordStore, UNDO_WINDOW_MS } from '../store';

const T0 = new Date('2026-09-24T09:00:00.000Z').getTime();

async function harness() {
  const db = openTestDb();
  await migrate(db);
  let clock = T0;
  let seq = 0;
  const onDisk = new Set<string>();
  const deleted: string[] = [];
  const tombstoned: string[] = [];
  const published: string[][] = [];

  const deleteAudio = (path: string) => {
    deleted.push(path);
    return onDisk.delete(path);
  };
  const bridge = createBridge(db, {
    now: () => clock,
    tombstone: async (d, id) => {
      tombstoned.push(id);
      await d.runAsync(
        'INSERT OR REPLACE INTO sync_tombstone_outbox (entry_id, enqueued_at) VALUES (?, ?)',
        id,
        new Date(clock).toISOString()
      );
    },
    deleteAudio,
    onPublished: (ids) => published.push(ids),
  });
  const store = createRecordStore(db, {
    now: () => clock,
    newId: () => `t${++seq}`,
    onChanged: (id) => void bridge.mirrorFragment(id),
  });

  async function voiceMoment(words = 'the words that were said') {
    const id = `v${++seq}`;
    const audioPath = `chinotto/audio/${id}.m4a`;
    onDisk.add(audioPath);
    await store.capture({ id, body: '', method: 'voice', voice: { audioPath, durationMs: 7000 } });
    await store.setTranscript(id, { state: 'ok', text: words, model: 'ios-on-device' });
    await bridge.mirrorFragment(id);
    return { id, audioPath };
  }

  const flush = async () => bridge.publishDueRemovals(await store.dueRemovals());
  const count = async (sql: string, ...params: unknown[]) =>
    (await db.getFirstAsync<{ n: number }>(sql, ...params))?.n ?? 0;

  async function contentOf(id: string) {
    return {
      body: (await db.getFirstAsync<{ body: string }>('SELECT body FROM fragments WHERE id = ?', id))?.body,
      captures: await count('SELECT COUNT(*) AS n FROM voice_captures WHERE fragment_id = ?', id),
      transcripts: await count('SELECT COUNT(*) AS n FROM voice_transcripts WHERE fragment_id = ?', id),
      revisions: await count('SELECT COUNT(*) AS n FROM fragment_revisions WHERE fragment_id = ?', id),
      entries: await count('SELECT COUNT(*) AS n FROM entries WHERE id = ?', id),
    };
  }

  return {
    db,
    store,
    bridge,
    onDisk,
    deleted,
    tombstoned,
    published,
    voiceMoment,
    flush,
    count,
    contentOf,
    deleteAudio,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

describe('inside the undo window', () => {
  it('nothing is erased, and bring back restores everything', async () => {
    const h = await harness();
    const { id, audioPath } = await h.voiceMoment();

    await h.store.remove(id);
    h.tick(UNDO_WINDOW_MS - 1);
    expect(await h.flush()).toBe(0);
    expect(h.deleted).toEqual([]);

    expect(await h.store.bringBack(id)).toBe(true);
    h.tick(60_000);
    await h.flush();

    expect(h.onDisk.has(audioPath)).toBe(true);
    const m = (await h.store.getFragment(id))!;
    expect(m.removedAt).toBeNull();
    expect(m.body).toBe('the words that were said');
    expect(m.durationMs).toBe(7000);
    expect(h.tombstoned).toEqual([]);
    h.db.close();
  });
});

describe('at the permanent boundary', () => {
  it('deletes the recording and every wording, and keeps only what sync needs', async () => {
    const h = await harness();
    const { id, audioPath } = await h.voiceMoment();
    await h.store.correct(id, 'what I actually meant');
    await h.store.remove(id);

    h.tick(UNDO_WINDOW_MS);
    expect(await h.flush()).toBe(1);

    expect(h.deleted).toEqual([audioPath]);
    expect(h.onDisk.has(audioPath)).toBe(false);
    expect(await h.contentOf(id)).toEqual({ body: '', captures: 0, transcripts: 0, revisions: 0, entries: 0 });

    // The tombstone: an id, a moment, the fact of removal. No content.
    const row = await h.db.getFirstAsync<Record<string, unknown>>(
      'SELECT id, body, captured_at, capture_method, removed_at, correction_count FROM fragments WHERE id = ?',
      id
    );
    expect(row).toEqual({
      id,
      body: '',
      captured_at: new Date(T0).toISOString(),
      capture_method: 'voice',
      removed_at: new Date(T0).toISOString(),
      correction_count: 0,
    });
    expect(h.tombstoned).toEqual([id]);
    expect(await h.count('SELECT COUNT(*) AS n FROM sync_tombstone_outbox WHERE entry_id = ?', id)).toBe(1);
    expect(h.published).toEqual([[id]]);
    h.db.close();
  });

  it('cannot be brought back once erased, and is never resurrected by the bridge', async () => {
    const h = await harness();
    const { id } = await h.voiceMoment();
    await h.store.remove(id);
    h.tick(UNDO_WINDOW_MS);
    await h.flush();

    expect(await h.store.bringBack(id)).toBe(false);
    expect((await h.store.getFragment(id))!.removedAt).not.toBeNull();

    // The same id arriving over the wire does not come back as material.
    await h.db.runAsync(
      'INSERT INTO entries (id, text, created_at) VALUES (?, ?, ?)',
      id,
      'the words that were said',
      new Date(T0).toISOString()
    );
    await h.bridge.projectCatchUp();
    expect((await h.store.getFragment(id))!.body).toBe('');
    expect(await h.store.loadRecord()).toEqual([]);
    h.db.close();
  });

  it('a bring back that wins the race is neither tombstoned nor erased', async () => {
    const h = await harness();
    const { id, audioPath } = await h.voiceMoment();
    await h.store.remove(id);
    h.tick(UNDO_WINDOW_MS);

    // The flush read the due list, then the person pressed bring back.
    const due = await h.store.dueRemovals();
    expect(await h.store.bringBack(id)).toBe(true);
    expect(await h.bridge.publishDueRemovals(due)).toBe(0);

    expect(h.tombstoned).toEqual([]);
    expect(h.deleted).toEqual([]);
    expect(h.onDisk.has(audioPath)).toBe(true);
    expect((await h.store.getFragment(id))!.body).toBe('the words that were said');
    h.db.close();
  });

  it('overlapping flushes publish and erase once', async () => {
    const h = await harness();
    const { id } = await h.voiceMoment();
    await h.store.remove(id);
    h.tick(UNDO_WINDOW_MS);

    const due = await h.store.dueRemovals();
    const [a, b] = await Promise.all([h.bridge.publishDueRemovals(due), h.bridge.publishDueRemovals(due)]);
    expect(a + b).toBe(1);
    expect(h.tombstoned).toEqual([id]);
    expect(h.deleted).toHaveLength(1);
    h.db.close();
  });

  it('a recording already missing from disk is not an error', async () => {
    const h = await harness();
    const { id, audioPath } = await h.voiceMoment();
    h.onDisk.delete(audioPath);
    await h.store.remove(id);
    h.tick(UNDO_WINDOW_MS);
    expect(await h.flush()).toBe(1);
    expect(await h.contentOf(id)).toMatchObject({ captures: 0, transcripts: 0, body: '' });
    h.db.close();
  });

  it('repeating it changes nothing', async () => {
    const h = await harness();
    const { id } = await h.voiceMoment();
    await h.store.remove(id);
    h.tick(UNDO_WINDOW_MS);
    await h.flush();
    expect(await h.bridge.publishDueRemovals([id])).toBe(0);
    expect(h.tombstoned).toEqual([id]);
    expect(h.deleted).toHaveLength(1);
    h.db.close();
  });

  it('leaves a typed moment’s wording as it was — only voice content is in scope', async () => {
    const h = await harness();
    const m = await h.store.capture({ body: 'typed, not said' });
    await h.store.remove(m.id);
    h.tick(UNDO_WINDOW_MS);
    await h.flush();
    expect((await h.store.getFragment(m.id))!.body).toBe('typed, not said');
    expect(h.deleted).toEqual([]);
    h.db.close();
  });

  it('takes Returns and Traces that quote the moment with it', async () => {
    const h = await harness();
    const { id } = await h.voiceMoment('a phrase worth returning to');
    const other = await h.store.capture({ body: 'a phrase worth returning to, again' });
    await h.store.recordReturn(other.id, 'repeated_language', {
      kind: 'shared_phrase',
      detail: 'a phrase worth returning to',
      occurredAt: T0,
      relatedId: id,
    });
    await h.db.runAsync(
      `INSERT INTO traces (fragment_id, related_id, kind, evidence, computed_at)
       VALUES (?, ?, 'repeated_language', 'a phrase worth returning to', ?)`,
      other.id,
      id,
      new Date(T0).toISOString()
    );
    await h.store.remove(id);
    h.tick(UNDO_WINDOW_MS);
    await h.flush();
    expect(await h.count('SELECT COUNT(*) AS n FROM return_evidence WHERE related_id = ?', id)).toBe(0);
    expect(await h.count('SELECT COUNT(*) AS n FROM traces WHERE related_id = ? OR fragment_id = ?', id, id)).toBe(0);
    expect(await h.count('SELECT COUNT(*) AS n FROM returns')).toBe(0);
    h.db.close();
  });
});

describe('recordings earlier builds left behind', () => {
  /** A removal published by a build that did not erase: content and file both still there. */
  async function publishedWithoutErasure(h: Awaited<ReturnType<typeof harness>>) {
    const { id, audioPath } = await h.voiceMoment('left behind by 2.0.0');
    await h.store.remove(id);
    await h.db.runAsync('DELETE FROM pending_removals WHERE fragment_id = ?', id);
    await h.db.runAsync('DELETE FROM entries WHERE id = ?', id);
    return { id, audioPath };
  }

  const deps = (h: Awaited<ReturnType<typeof harness>>) => ({
    listAudio: () => [...h.onDisk],
    deleteAudio: h.deleteAudio,
  });

  it('finishes the erasure for a removal that was published without one', async () => {
    const h = await harness();
    const { id, audioPath } = await publishedWithoutErasure(h);

    const report = await sweepRemovedVoice(h.db, deps(h));

    expect(report).toEqual({ erased: 1, deletedFiles: 1, keptUnproven: [], listingFailed: false });
    expect(h.onDisk.has(audioPath)).toBe(false);
    expect(await h.contentOf(id)).toMatchObject({ body: '', captures: 0, transcripts: 0 });
    h.db.close();
  });

  it('deletes a file whose erasure was interrupted after the database', async () => {
    const h = await harness();
    const { id, audioPath } = await h.voiceMoment();
    await h.store.remove(id);
    h.tick(UNDO_WINDOW_MS);
    // The app died between the commit and the file: the transaction ran, the delete did not.
    await h.bridge.publishDueRemovals(await h.store.dueRemovals());
    h.onDisk.add(audioPath);

    const report = await sweepRemovedVoice(h.db, deps(h));
    expect(report.deletedFiles).toBe(1);
    expect(h.onDisk.has(audioPath)).toBe(false);
    h.db.close();
  });

  it('touches nothing that could still be brought back or is still in the record', async () => {
    const h = await harness();
    const live = await h.voiceMoment();
    const pending = await h.voiceMoment();
    await h.store.remove(pending.id);

    const report = await sweepRemovedVoice(h.db, deps(h));

    expect(report).toEqual({ erased: 0, deletedFiles: 0, keptUnproven: [], listingFailed: false });
    expect(h.onDisk.has(live.audioPath)).toBe(true);
    expect(h.onDisk.has(pending.audioPath)).toBe(true);
    expect(await h.store.bringBack(pending.id)).toBe(true);
    expect((await h.store.getFragment(pending.id))!.body).toBe('the words that were said');
    h.db.close();
  });

  it('keeps and reports files nothing proves are removed for good', async () => {
    const h = await harness();
    // A capture between the native file and the database row: no fragment yet.
    h.onDisk.add('chinotto/audio/in-flight.m4a');
    // A name that is not a plain id.
    h.onDisk.add('chinotto/audio/..sneaky.m4a');
    // A live fragment that does not point at the file.
    const typed = await h.store.capture({ body: 'typed' });
    h.onDisk.add(`chinotto/audio/${typed.id}.m4a`);

    const report = await sweepRemovedVoice(h.db, deps(h));

    expect(report.deletedFiles).toBe(0);
    expect(report.keptUnproven.sort()).toEqual(
      ['chinotto/audio/in-flight.m4a', 'chinotto/audio/..sneaky.m4a', `chinotto/audio/${typed.id}.m4a`].sort()
    );
    expect(h.deleted).toEqual([]);
    h.db.close();
  });

  it('is idempotent and survives an unreadable directory', async () => {
    const h = await harness();
    await publishedWithoutErasure(h);
    await sweepRemovedVoice(h.db, deps(h));
    expect(await sweepRemovedVoice(h.db, deps(h))).toEqual({
      erased: 0,
      deletedFiles: 0,
      keptUnproven: [],
      listingFailed: false,
    });
    expect((await sweepRemovedVoice(h.db, { listAudio: () => null, deleteAudio: h.deleteAudio })).listingFailed).toBe(
      true
    );
    h.db.close();
  });
});
