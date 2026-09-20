import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createBridge, type LegacyEntryRow } from '../bridge';
import { createRecordStore, UNDO_WINDOW_MS } from '../store';

const T0 = new Date('2026-09-19T17:10:00.000Z').getTime();

async function fresh() {
  const db = openTestDb();
  await migrate(db);
  let clock = T0;
  let seq = 0;

  const queued: LegacyEntryRow[] = [];
  const tombstoned: string[] = [];

  const bridge = createBridge(db, {
    now: () => clock,
    enqueue: async (_d, entry) => {
      queued.push(entry);
    },
    dequeue: async (_d, id) => {
      for (let i = queued.length - 1; i >= 0; i -= 1) {
        if (queued[i].id === id) queued.splice(i, 1);
      }
    },
    tombstone: async (_d, id) => {
      tombstoned.push(id);
    },
  });

  const store = createRecordStore(db, {
    now: () => clock,
    newId: () => `f${++seq}`,
    onChanged: (id) => {
      void bridge.mirrorFragment(id);
    },
  });

  return {
    db,
    store,
    bridge,
    queued,
    tombstoned,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

const entries = (db: Awaited<ReturnType<typeof fresh>>['db']) =>
  db.getAllAsync<{ id: string; text: string; created_at: string }>(
    'SELECT id, text, created_at FROM entries ORDER BY created_at'
  );

describe('Record → legacy', () => {
  it('mirrors a capture as an entry with the same id', async () => {
    const { db, store, bridge, queued } = await fresh();
    const m = await store.capture({ body: 'dinner friday' });
    await bridge.mirrorFragment(m.id);

    expect(await entries(db)).toEqual([
      { id: m.id, text: 'dinner friday', created_at: new Date(T0).toISOString() },
    ]);
    expect(queued).toEqual([
      { id: m.id, text: 'dinner friday', createdAt: new Date(T0).toISOString() },
    ]);
    db.close();
  });

  it('is idempotent — mirroring twice is one row', async () => {
    const { db, store, bridge } = await fresh();
    const m = await store.capture({ body: 'once' });
    await bridge.mirrorFragment(m.id);
    await bridge.mirrorFragment(m.id);
    expect(await entries(db)).toHaveLength(1);
    db.close();
  });

  it('carries a correction as the same entry, keeping its date', async () => {
    const { db, store, bridge, tick } = await fresh();
    const m = await store.capture({ body: 'pasta water too salty' });
    await bridge.mirrorFragment(m.id);
    tick(60_000);
    await store.correct(m.id, 'pasta water too salty again. less.');
    await bridge.mirrorFragment(m.id);

    const rows = await entries(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('pasta water too salty again. less.');
    expect(rows[0].created_at).toBe(new Date(T0).toISOString());
    db.close();
  });

  it('sends a Continue as its OWN entry, never appended to the earlier one', async () => {
    const { db, store, bridge, tick } = await fresh();
    const first = await store.capture({ body: 'filing feels like work' });
    await bridge.mirrorFragment(first.id);
    tick(3 * 864e5);
    const second = (await store.continueFrom(first.id, { body: "and isn't" }))!;
    await bridge.mirrorFragment(second.id);

    const rows = await entries(db);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.text)).toEqual(['filing feels like work', "and isn't"]);
    // The earlier entry is byte-identical to what it was.
    expect(rows[0].text).toBe('filing feels like work');
    expect(rows[0].created_at).not.toBe(rows[1].created_at);
    db.close();
  });

  it('waits for a voice fragment to have something to say', async () => {
    const { db, store, bridge, tick } = await fresh();
    const m = await store.capture({
      body: '',
      method: 'voice',
      voice: { audioPath: 'a.m4a', durationMs: 9000 },
    });
    expect(await bridge.mirrorFragment(m.id)).toBe(false);
    expect(await entries(db)).toHaveLength(0);

    tick(1000);
    await store.setTranscript(m.id, { state: 'ok', text: 'ref four four seven one' });
    expect(await bridge.mirrorFragment(m.id)).toBe(true);
    expect((await entries(db))[0].text).toBe('ref four four seven one');
    db.close();
  });

  it('leaves audio, encounters and holds behind — the wire cannot carry them', async () => {
    const { db, store, bridge } = await fresh();
    const v = await store.capture({
      body: 'said something',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f1.m4a', durationMs: 9000 },
    });
    const u = await store.capture({ body: 'https://theatlantic.com/x?utm_source=a' });
    await store.hold(v.id);
    await bridge.mirrorFragment(v.id);
    await bridge.mirrorFragment(u.id);

    const rows = await entries(db);
    // Exactly three columns' worth of information, and nothing else.
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['created_at', 'id', 'text']);
    }
    expect(rows.find((r) => r.id === u.id)!.text).toBe('https://theatlantic.com/x?utm_source=a');
    db.close();
  });

  it('never resurrects something removed on another device', async () => {
    const { db, bridge, queued } = await fresh();
    // The removal reached this phone first, so the id is suppressed before the catch-up
    // pass ever looks at the fragment.
    await db.runAsync(
      'INSERT INTO firestore_ingest_suppressed_ids (id, suppressed_at) VALUES (?, ?)',
      'gone',
      new Date(T0).toISOString()
    );
    await db.runAsync(
      `INSERT INTO fragments (id, body, captured_at, capture_method, capture_origin)
       VALUES ('gone', 'removed elsewhere', ?, 'typed', 'mobile')`,
      new Date(T0).toISOString()
    );

    expect(await bridge.mirrorFragment('gone')).toBe(false);
    expect(await bridge.mirrorCatchUp()).toBe(0);
    expect(await entries(db)).toHaveLength(0);
    expect(queued).toEqual([]);
    db.close();
  });

  it('catches up everything the legacy table has not seen', async () => {
    const { db, store, bridge } = await fresh();
    for (let i = 0; i < 20; i += 1) await store.capture({ body: `moment ${i}` });
    await db.execAsync('DELETE FROM entries');

    expect(await bridge.mirrorCatchUp()).toBe(20);
    expect(await entries(db)).toHaveLength(20);
    // And a second pass has nothing to do.
    expect(await bridge.mirrorCatchUp()).toBe(0);
    db.close();
  });
});

describe('legacy → Record', () => {
  it('imports an unseen entry without guessing how it was captured', async () => {
    const { db, bridge } = await fresh();
    expect(
      await bridge.projectEntry({
        id: 'desk-1',
        text: 'written on the mac',
        createdAt: '2026-09-18T10:00:00.000Z',
      })
    ).toBe('created');

    const row = (await db.getFirstAsync<{
      capture_method: string;
      capture_origin: string;
      legacy_entry_id: string;
      captured_at: string;
    }>('SELECT capture_method, capture_origin, legacy_entry_id, captured_at FROM fragments WHERE id = ?', 'desk-1'))!;
    expect(row.capture_method).toBe('imported');
    expect(row.capture_origin).toBe('desktop');
    expect(row.legacy_entry_id).toBe('desk-1');
    expect(row.captured_at).toBe('2026-09-18T10:00:00.000Z');
    db.close();
  });

  it('does nothing when the same row comes back round the loop', async () => {
    const { db, store, bridge } = await fresh();
    const m = await store.capture({ body: 'went out, came back' });
    await bridge.mirrorFragment(m.id);

    expect(
      await bridge.projectEntry({
        id: m.id,
        text: 'went out, came back',
        createdAt: new Date(T0).toISOString(),
      })
    ).toBe('unchanged');
    expect(
      (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM fragments'))!.n
    ).toBe(1);
    db.close();
  });
});

describe('a moment worded twice', () => {
  it('keeps both and asks, rather than overwriting', async () => {
    const { db, store, bridge, tick } = await fresh();
    const m = await store.capture({ body: 'the return should only come back if it can show me why' });
    await bridge.mirrorFragment(m.id);

    tick(60_000);
    const verdict = await bridge.projectEntry({
      id: m.id,
      text: 'the return should only come back if it can show me the words it matched',
      createdAt: new Date(T0).toISOString(),
    });
    expect(verdict).toBe('conflict');

    // The local wording is untouched and still what the record shows.
    expect((await store.getFragment(m.id))!.body).toBe(
      'the return should only come back if it can show me why'
    );
    // And crucially: no revision was manufactured out of a sync message.
    expect(
      (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM fragment_revisions'))!.n
    ).toBe(0);
    expect((await store.getFragment(m.id))!.correctionCount).toBe(0);

    const open = await bridge.openConflicts();
    expect(open).toHaveLength(1);
    expect(open[0].shows).toBe('local');
    expect(open[0].remoteText).toContain('the words it matched');
    db.close();
  });

  it('keeps the local wording as earlier wording when the other one is chosen', async () => {
    const { db, store, bridge, tick } = await fresh();
    const m = await store.capture({ body: 'this iphone said it this way' });
    await bridge.mirrorFragment(m.id);
    tick(1000);
    await bridge.projectEntry({
      id: m.id,
      text: 'the macbook said it that way',
      createdAt: new Date(T0).toISOString(),
    });

    tick(1000);
    await bridge.resolveConflict(m.id, 'remote', store.correct);

    const after = (await store.getFragment(m.id))!;
    expect(after.body).toBe('the macbook said it that way');
    expect(after.previousBody).toBe('this iphone said it this way');
    expect(await bridge.openConflicts()).toEqual([]);
    db.close();
  });

  it('settling on the local wording changes nothing but closes the question', async () => {
    const { db, store, bridge, tick } = await fresh();
    const m = await store.capture({ body: 'mine' });
    await bridge.mirrorFragment(m.id);
    tick(1000);
    await bridge.projectEntry({ id: m.id, text: 'theirs', createdAt: new Date(T0).toISOString() });
    await bridge.resolveConflict(m.id, 'local', store.correct);

    expect((await store.getFragment(m.id))!.body).toBe('mine');
    expect((await store.getFragment(m.id))!.correctionCount).toBe(0);
    expect(await bridge.openConflicts()).toEqual([]);
    // The other wording is still on record, under the moment.
    const row = (await db.getFirstAsync<{ remote_text: string }>(
      'SELECT remote_text FROM wording_conflicts WHERE fragment_id = ?',
      m.id
    ))!;
    expect(row.remote_text).toBe('theirs');
    db.close();
  });
});

describe('removal across the bridge', () => {
  it('publishes nothing until the eight seconds are up', async () => {
    const { db, store, bridge, tombstoned, queued, tick } = await fresh();
    const m = await store.capture({ body: 'a mistake' });
    await bridge.mirrorFragment(m.id);
    expect(queued).toHaveLength(1);

    await store.remove(m.id);
    // Mid-window: the legacy row is still there and nothing has been told to anyone.
    await bridge.publishDueRemovals(await store.dueRemovals());
    expect(await entries(db)).toHaveLength(1);
    expect(tombstoned).toEqual([]);

    tick(UNDO_WINDOW_MS);
    await bridge.publishDueRemovals(await store.dueRemovals());
    expect(await entries(db)).toHaveLength(0);
    expect(tombstoned).toEqual([m.id]);
    db.close();
  });

  it('a bring back inside the window reaches the network never', async () => {
    const { db, store, bridge, tombstoned, tick } = await fresh();
    const m = await store.capture({ body: 'do not lose this' });
    await bridge.mirrorFragment(m.id);

    await store.remove(m.id);
    tick(3000);
    await bridge.publishDueRemovals(await store.dueRemovals());
    expect(tombstoned).toEqual([]);

    expect(await store.bringBack(m.id)).toBe(true);
    tick(60_000);
    await bridge.publishDueRemovals(await store.dueRemovals());

    expect(tombstoned).toEqual([]);
    expect(await entries(db)).toHaveLength(1);
    expect((await store.loadRecord()).map((x) => x.id)).toContain(m.id);
    db.close();
  });

  it('soft-removes rather than destroying when the removal came from elsewhere', async () => {
    const { db, store, bridge } = await fresh();
    const m = await store.capture({ body: 'removed on the mac' });
    await bridge.mirrorFragment(m.id);

    expect(await bridge.applyRemoteTombstone(m.id)).toBe(true);
    expect((await store.loadRecord()).map((x) => x.id)).not.toContain(m.id);
    // Still recoverable from this phone: the material was not destroyed.
    expect((await store.getFragment(m.id))!.body).toBe('removed on the mac');
    expect(await entries(db)).toHaveLength(0);
    db.close();
  });
});
