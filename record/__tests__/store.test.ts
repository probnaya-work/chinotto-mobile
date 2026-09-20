import { openTestDb, type TestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createRecordStore, HoldLimitReached, MAX_HELD, UNDO_WINDOW_MS } from '../store';
import { lineOf } from '../model/lines';

const T0 = new Date('2026-09-19T17:10:00.000Z').getTime();

async function fresh(start = T0) {
  const db = openTestDb();
  await migrate(db);
  let clock = start;
  let seq = 0;
  const store = createRecordStore(db, {
    now: () => clock,
    newId: () => `f${++seq}`,
  });
  return {
    db,
    store,
    tick: (ms: number) => {
      clock += ms;
    },
    at: () => clock,
  };
}

describe('capture', () => {
  it('cannot be refused anything: no type, no title, no destination', async () => {
    const { db, store } = await fresh();
    const m = await store.capture({ body: 'dinner friday' });
    expect(m.body).toBe('dinner friday');
    expect(m.method).toBe('typed');
    expect(m.origin).toBe('mobile');
    expect(m.at).toBe(T0);
    expect(m.correctionCount).toBe(0);
    expect(m.lineId).toBeNull();
    db.close();
  });

  it('records where it came from when the system knows', async () => {
    const { db, store } = await fresh();
    const w = await store.capture({ body: 'from the widget', origin: 'widget' });
    const s = await store.capture({ body: 'from the share sheet', origin: 'share', method: 'shared' });
    expect(w.origin).toBe('widget');
    expect(s.method).toBe('shared');
    db.close();
  });

  it('treats a body that is exactly one URL as an encounter', async () => {
    const { db, store } = await fresh();
    const m = await store.capture({
      body: 'https://www.theatlantic.com/ideas/archive/2026/09/second-brain-apps/?utm_source=feed',
    });
    expect(m.method).toBe('url');
    // The raw URL is kept byte-for-byte; the key is the normalised identity.
    expect(m.url).toContain('utm_source=feed');
    expect(m.urlKey).toBe('theatlantic.com/ideas/archive/2026/09/second-brain-apps');
    expect(m.domain).toBe('theatlantic.com');
    expect(m.enrichmentState).toBe('pending');
    db.close();
  });

  it('leaves a body with two links as plain text', async () => {
    const { db, store } = await fresh();
    const m = await store.capture({ body: 'https://a.com/x and https://b.com/y' });
    expect(m.method).toBe('typed');
    expect(m.url).toBeNull();
    db.close();
  });

  it('notices a source it has met before, offline', async () => {
    const { db, store } = await fresh();
    const first = await store.capture({ body: 'https://theatlantic.com/second-brain/' });
    const second = await store.capture({
      body: 'https://www.theatlantic.com/second-brain?utm_campaign=x#section',
    });
    expect(second.urlKey).toBe(first.urlKey);
    const met = await store.encountersOf(second.urlKey!, second.id);
    expect(met.map((m) => m.id)).toEqual([first.id]);
    db.close();
  });
});

describe('correction', () => {
  it('keeps the earlier wording and does not move the moment', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({ body: 'pasta water too salty' });
    tick(60_000);
    const c = (await store.correct(m.id, 'pasta water too salty again. less.'))!;

    expect(c.body).toBe('pasta water too salty again. less.');
    expect(c.at).toBe(m.at); // captured_at is immutable
    expect(c.correctedAt).toBe(T0 + 60_000);
    expect(c.correctionCount).toBe(1);
    expect(c.previousBody).toBe('pasta water too salty');
    db.close();
  });

  it('holds correction_count === COUNT(fragment_revisions) through many corrections', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({ body: 'v0' });
    for (let i = 1; i <= 12; i += 1) {
      tick(1000);
      await store.correct(m.id, `v${i}`);
    }
    const row = (await db.getFirstAsync<{ correction_count: number }>(
      'SELECT correction_count FROM fragments WHERE id = ?',
      m.id
    ))!;
    const revs = (await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM fragment_revisions WHERE fragment_id = ?',
      m.id
    ))!;
    expect(row.correction_count).toBe(12);
    expect(revs.n).toBe(12);

    const history = await store.wordingHistory(m.id);
    expect(history.map((h) => h.body)).toEqual(
      Array.from({ length: 13 }, (_, i) => `v${i}`)
    );
    db.close();
  });

  it('manufactures nothing when the wording has not changed', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({ body: 'quiet' });
    tick(1000);
    await store.correct(m.id, 'quiet');
    await store.correct(m.id, '   ');
    const revs = (await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM fragment_revisions'
    ))!;
    expect(revs.n).toBe(0);
    expect((await store.getFragment(m.id))!.correctedAt).toBeNull();
    db.close();
  });

  it('never deletes or rewrites a revision once written', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({ body: 'first' });
    tick(1000);
    await store.correct(m.id, 'second');
    const before = await db.getAllAsync('SELECT * FROM fragment_revisions');
    tick(1000);
    await store.correct(m.id, 'third');
    const after = await db.getAllAsync<{ body: string }>(
      'SELECT * FROM fragment_revisions ORDER BY revision_index'
    );
    expect(after.slice(0, 1)).toEqual(before);
    expect(after.map((r) => r.body)).toEqual(['first', 'second']);
    db.close();
  });
});

describe('Continue and the Line', () => {
  it('appends a new dated moment and never edits the earlier one', async () => {
    const { db, store, tick } = await fresh();
    const first = await store.capture({ body: 'filing feels like work' });
    tick(3 * 864e5);
    const second = (await store.continueFrom(first.id, { body: "and isn't" }))!;

    expect(second.at).toBe(T0 + 3 * 864e5);
    const reloaded = (await store.getFragment(first.id))!;
    expect(reloaded.body).toBe('filing feels like work');
    expect(reloaded.correctionCount).toBe(0);
    expect(reloaded.lineId).toBe(first.id);
    expect(second.lineId).toBe(first.id);
    db.close();
  });

  it('builds a chain across years, read oldest first', async () => {
    const { db, store, tick } = await fresh();
    let head = await store.capture({ body: 'moment 0' });
    const ids = [head.id];
    for (let i = 1; i < 8; i += 1) {
      tick(200 * 864e5);
      head = (await store.continueFrom(head.id, { body: `moment ${i}` }))!;
      ids.push(head.id);
    }
    const all = await store.loadRecord();
    const line = lineOf(head, all);
    expect(line.map((m) => m.id)).toEqual(ids);
    expect(line).toHaveLength(8);
    db.close();
  });

  it('extends an existing line when the accepted moment is the later one', async () => {
    const { db, store, tick } = await fresh();
    const a = await store.capture({ body: 'a' });
    tick(1000);
    const b = (await store.continueFrom(a.id, { body: 'b' }))!;
    tick(1000);
    const c = await store.capture({ body: 'c' });

    // c is later than b and continues nothing, so this appends: a → b → c.
    expect(await store.linkContinuation(b.id, c.id)).toBe(true);
    const all = await store.loadRecord();
    expect(lineOf(all.find((m) => m.id === c.id)!, all).map((m) => m.id)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
    db.close();
  });

  it('refuses to re-point a fragment that already continues something', async () => {
    const { db, store, tick } = await fresh();
    const a = await store.capture({ body: 'a' });
    tick(1000);
    const between = await store.capture({ body: 'between' });
    tick(1000);
    const b = (await store.continueFrom(a.id, { body: 'b' }))!;

    // b already continues a. Accepting an offer against `between` would have to move that
    // edge, and a chain is never silently re-pointed: the earlier link is a decision too.
    expect(await store.linkContinuation(between.id, b.id)).toBe(false);
    const all = await store.loadRecord();
    expect(lineOf(all.find((m) => m.id === b.id)!, all).map((m) => m.id)).toEqual([a.id, b.id]);
    db.close();
  });

  it('links an accepted offer with the later moment continuing the earlier', async () => {
    const { db, store, tick } = await fresh();
    const earlier = await store.capture({ body: 'the folder thing' });
    tick(864e5);
    const later = await store.capture({ body: 'the folder thing again' });

    // Passed the "wrong" way round on purpose.
    expect(await store.linkContinuation(later.id, earlier.id)).toBe(true);
    const all = await store.loadRecord();
    expect(lineOf(all.find((m) => m.id === later.id)!, all).map((m) => m.id)).toEqual([
      earlier.id,
      later.id,
    ]);
    db.close();
  });

  it('will not let a moment continue itself', async () => {
    const { db, store } = await fresh();
    const a = await store.capture({ body: 'a' });
    expect(await store.linkContinuation(a.id, a.id)).toBe(false);
    db.close();
  });
});

describe('Hold', () => {
  it('is bounded, and refuses rather than evicting', async () => {
    const { db, store } = await fresh();
    const ids: string[] = [];
    for (let i = 0; i < MAX_HELD; i += 1) {
      const m = await store.capture({ body: `held ${i}` });
      ids.push(m.id);
      await store.hold(m.id);
    }
    expect(await store.heldIds()).toHaveLength(MAX_HELD);

    const extra = await store.capture({ body: 'one too many' });
    await expect(store.hold(extra.id)).rejects.toBeInstanceOf(HoldLimitReached);
    // Nothing was auto-released: that would be an ordering system.
    expect(await store.heldIds()).toEqual(ids);
    db.close();
  });

  it('keeps released rows, so a Return can say you kept this present', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({ body: 'boiler guy — Tues between 12 and 3' });
    await store.hold(m.id);
    tick(1000);
    await store.release(m.id);

    expect(await store.heldIds()).toEqual([]);
    const row = (await db.getFirstAsync<{ released_at: string | null }>(
      'SELECT released_at FROM holds WHERE fragment_id = ?',
      m.id
    ))!;
    expect(row.released_at).not.toBeNull();
    db.close();
  });

  it('holding twice is not two holds', async () => {
    const { db, store } = await fresh();
    const m = await store.capture({ body: 'once' });
    await store.hold(m.id);
    await store.hold(m.id);
    expect(await store.heldIds()).toEqual([m.id]);
    db.close();
  });
});

describe('removal and the eight seconds', () => {
  it('is soft, and publishes nothing inside the window', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({ body: 'a mistake' });
    await store.remove(m.id);

    // Gone from the record immediately...
    expect((await store.loadRecord()).map((x) => x.id)).not.toContain(m.id);
    // ...but still here, and not yet anybody else's business.
    expect((await store.getFragment(m.id))!.removedAt).toBe(T0);
    expect(await store.dueRemovals()).toEqual([]);
    expect(await store.undoSecondsLeft(m.id)).toBe(8);

    tick(UNDO_WINDOW_MS - 1);
    expect(await store.dueRemovals()).toEqual([]);
    tick(1);
    expect(await store.dueRemovals()).toEqual([m.id]);
    db.close();
  });

  it('brings it back inside the window, with everything intact', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({ body: 'do not lose this' });
    tick(1000);
    await store.correct(m.id, 'do not lose this, corrected');
    await store.remove(m.id);
    tick(3000);

    expect(await store.bringBack(m.id)).toBe(true);
    const back = (await store.getFragment(m.id))!;
    expect(back.removedAt).toBeNull();
    expect(back.body).toBe('do not lose this, corrected');
    expect(back.previousBody).toBe('do not lose this');
    expect(back.correctionCount).toBe(1);
    expect((await store.loadRecord()).map((x) => x.id)).toContain(m.id);
    db.close();
  });

  it('cannot bring back something already published', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({ body: 'gone' });
    await store.remove(m.id);
    tick(UNDO_WINDOW_MS);
    await store.markRemovalPublished(m.id);

    expect(await store.bringBack(m.id)).toBe(false);
    expect((await store.getFragment(m.id))!.removedAt).not.toBeNull();
    db.close();
  });

  it('publishes a removal whose window elapsed while the app was closed', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({ body: 'removed just before backgrounding' });
    await store.remove(m.id);
    // The app is killed here; hours pass.
    tick(6 * 3600e3);
    expect(await store.dueRemovals()).toEqual([m.id]);
    expect(await store.undoSecondsLeft(m.id)).toBe(0);
    db.close();
  });
});

describe('voice', () => {
  it('exists the moment recording stops, before any transcript', async () => {
    const { db, store } = await fresh();
    const m = await store.capture({
      body: '',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f1.m4a', durationMs: 42_000 },
    });
    expect(m.method).toBe('voice');
    expect(m.durationMs).toBe(42_000);
    expect(m.transcriptState).toBe('pending');
    expect(m.body).toBe('');
    expect(await store.audioPathOf(m.id)).toBe('chinotto/audio/f1.m4a');
    db.close();
  });

  it('loses nothing when transcription fails', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({
      body: '',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f1.m4a', durationMs: 9000 },
    });
    tick(2000);
    await store.setTranscript(m.id, { state: 'failed', failure: 'no speech recogniser' });

    const after = (await store.getFragment(m.id))!;
    expect(after.transcriptState).toBe('failed');
    // The recording is untouched and the fragment is still in the record.
    expect(await store.audioPathOf(m.id)).toBe('chinotto/audio/f1.m4a');
    expect((await store.loadRecord()).map((x) => x.id)).toContain(m.id);
    db.close();
  });

  it('fills the body from the machine only while nobody has worded it themselves', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({
      body: '',
      method: 'voice',
      voice: { audioPath: 'a.m4a', durationMs: 5000 },
    });
    tick(1000);
    await store.setTranscript(m.id, { state: 'ok', text: 'ref four four seven one', model: 'ios' });
    expect((await store.getFragment(m.id))!.body).toBe('ref four four seven one');

    // The person corrects what the machine heard...
    tick(1000);
    await store.correct(m.id, 'ref 4471');
    // ...and a later re-transcription must not undo that.
    tick(1000);
    await store.setTranscript(m.id, { state: 'ok', text: 'ref four four seven one', model: 'ios' });

    const after = (await store.getFragment(m.id))!;
    expect(after.body).toBe('ref 4471');
    expect(after.previousBody).toBe('ref four four seven one');
    db.close();
  });

  it('correcting a transcript never touches the audio row', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({
      body: '',
      method: 'voice',
      voice: { audioPath: 'a.m4a', durationMs: 5000 },
    });
    const before = await db.getAllAsync('SELECT * FROM voice_captures WHERE fragment_id = ?', m.id);
    tick(1000);
    await store.setTranscript(m.id, { state: 'ok', text: 'heard this' });
    tick(1000);
    await store.correct(m.id, 'meant that');
    const after = await db.getAllAsync('SELECT * FROM voice_captures WHERE fragment_id = ?', m.id);
    expect(after).toEqual(before);
    db.close();
  });

  it('says the audio is gone rather than pretending it has it', async () => {
    const { db, store } = await fresh();
    const m = await store.capture({
      body: 'said something',
      method: 'voice',
      voice: { audioPath: 'a.m4a', durationMs: 5000 },
    });
    await store.markAudioMissing(m.id);
    expect((await store.getFragment(m.id))!.audioMissing).toBe(true);
    db.close();
  });
});

describe('a Return is never written without its evidence', () => {
  it('writes both, or neither', async () => {
    const { db, store } = await fresh();
    const old = await store.capture({ body: 'the folder thing' });
    const because = await store.capture({ body: 'the folder thing again' });
    const id = await store.recordReturn(old.id, 'repeated_language', {
      kind: 'shared_phrase',
      detail: 'the folder thing',
      occurredAt: T0,
      relatedId: because.id,
    });

    const ev = await db.getAllAsync<{ detail: string }>(
      'SELECT detail FROM return_evidence WHERE return_id = ?',
      id
    );
    expect(ev).toHaveLength(1);

    // A reason outside the closed set is refused by the schema, and takes the evidence with it.
    await expect(
      store.recordReturn(old.id, 'because_i_felt_like_it', {
        kind: 'shared_phrase',
        detail: 'x',
        occurredAt: T0,
        relatedId: because.id,
      })
    ).rejects.toThrow();
    expect(
      (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM returns'))!.n
    ).toBe(1);
    db.close();
  });

  it('does not press the same thing twice', async () => {
    const { db, store, tick } = await fresh();
    const m = await store.capture({ body: 'x' });
    await store.recordReturn(m.id, 'repeated_language', {
      kind: 'shared_phrase',
      detail: 'x',
      occurredAt: T0,
      relatedId: m.id,
    });
    expect([...(await store.recentlyReturned(7 * 864e5))]).toEqual([m.id]);
    tick(30 * 864e5);
    expect([...(await store.recentlyReturned(7 * 864e5))]).toEqual([]);
    db.close();
  });
});

describe('a judgement outlives the cache', () => {
  it('survives recomputation, because a person made it', async () => {
    const { db, store } = await fresh();
    const a = await store.capture({ body: 'a' });
    const b = await store.capture({ body: 'b' });
    await store.judgeTrace(a.id, b.id, 'inferred', 'rejected');

    // The derived cache is thrown away entirely.
    await db.execAsync('DELETE FROM traces');
    expect(await store.traceJudgements()).toEqual({ [b.id]: 'rejected' });
    db.close();
  });
});

describe('at scale', () => {
  let db: TestDb;
  afterAll(() => db?.close());

  it('loads a heavy record and orders it by distance', async () => {
    const f = await fresh();
    db = f.db;
    // 4 000 fragments over six years, written the way the app writes them.
    await f.db.execAsync('BEGIN');
    for (let i = 0; i < 4000; i += 1) {
      await f.db.runAsync(
        'INSERT INTO fragments (id, body, captured_at, capture_method, capture_origin) VALUES (?, ?, ?, ?, ?)',
        `bulk${i}`,
        `moment ${i}`,
        new Date(T0 - i * 13 * 3600e3).toISOString(),
        'typed',
        'mobile'
      );
    }
    await f.db.execAsync('COMMIT');

    const started = Date.now();
    const all = await f.store.loadRecord();
    expect(all).toHaveLength(4000);
    expect(all[0].at).toBeGreaterThan(all[all.length - 1].at);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});
