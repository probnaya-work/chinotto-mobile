/**
 * Recordings waiting for words are read back later — on this iPhone, once each, and only
 * when it can.
 */

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate, setMeta } from '../migrate';
import { createRecordStore } from '../store';
import {
  ON_DEVICE_MODEL,
  PENDING_STALE_MS,
  RETRY_BACKOFF_MAX_MS,
  RETRY_BACKOFF_MIN_MS,
  TRANSCRIPT_NOTHING_HEARD,
  TRANSCRIPT_UNAVAILABLE,
  UNCONFIRMED_MODEL,
  createTranscriptRetry,
  relabelUnconfirmedTranscripts,
  type FileResult,
  type LocalStatus,
} from '../transcripts';

const T0 = new Date('2026-09-24T09:00:00.000Z').getTime();

async function harness() {
  const db = openTestDb();
  await migrate(db);
  let clock = T0;
  let seq = 0;
  let status: LocalStatus = 'available';
  const results = new Map<string, FileResult>();
  const read: string[] = [];
  const statusChecks: number[] = [];
  let gate: Promise<void> | null = null;

  const store = createRecordStore(db, { now: () => clock, newId: () => `f${++seq}` });
  const retry = createTranscriptRetry({
    db,
    store,
    now: () => clock,
    status: async () => {
      statusChecks.push(clock);
      return status;
    },
    transcribe: async (path) => {
      read.push(path);
      if (gate) await gate;
      return results.get(path) ?? { status: 'ok', text: `words of ${path}` };
    },
    fileExists: () => true,
  });

  /** A voice moment that never got words, as a build without a local recogniser leaves it. */
  async function waiting(opts: { failure?: string; model?: string | null } = {}) {
    const id = `v${++seq}`;
    const audioPath = `chinotto/audio/${id}.m4a`;
    await store.capture({ id, body: '', method: 'voice', voice: { audioPath, durationMs: 5000 } });
    await store.setTranscript(id, {
      state: 'failed',
      failure: opts.failure ?? TRANSCRIPT_UNAVAILABLE,
      ...(opts.model ? { model: opts.model } : {}),
    });
    return { id, audioPath };
  }

  const transcript = (id: string) =>
    db.getFirstAsync<{ state: string; model: string | null; machine_transcript: string | null; failure: string | null }>(
      'SELECT state, model, machine_transcript, failure FROM voice_transcripts WHERE fragment_id = ?',
      id
    );

  return {
    db,
    store,
    retry,
    results,
    read,
    statusChecks,
    waiting,
    transcript,
    setStatus: (s: LocalStatus) => {
      status = s;
    },
    tick: (ms: number) => {
      clock += ms;
    },
    hold: () => {
      let open!: () => void;
      gate = new Promise((resolve) => {
        open = resolve;
      });
      return () => {
        gate = null;
        open();
      };
    },
  };
}

describe('eligibility', () => {
  it('reads back a recording that had no local recogniser, and labels the words on-device', async () => {
    const h = await harness();
    const { id, audioPath } = await h.waiting();

    const pass = await h.retry.run();

    expect(pass).toEqual({ ran: true, transcribed: 1, heardNothing: 0, stillWaiting: 0 });
    expect(h.read).toEqual([audioPath]);
    expect(await h.transcript(id)).toMatchObject({
      state: 'ok',
      model: ON_DEVICE_MODEL,
      machine_transcript: `words of ${audioPath}`,
      failure: null,
    });
    // The body follows, because nobody has worded it.
    expect((await h.store.getFragment(id))!.body).toBe(`words of ${audioPath}`);
    h.db.close();
  });

  it('gives an untranscribed recording from an older build its one local reading', async () => {
    const h = await harness();
    const { id } = await h.waiting({ failure: 'nothing was recognised' });
    await h.retry.run();
    expect((await h.transcript(id))?.model).toBe(ON_DEVICE_MODEL);
    h.db.close();
  });

  it('never reads one a local recogniser has already read', async () => {
    const h = await harness();
    await h.waiting({ failure: TRANSCRIPT_NOTHING_HEARD, model: ON_DEVICE_MODEL });
    await h.retry.run();
    expect(h.read).toEqual([]);
    h.db.close();
  });

  it('leaves transcripts that already have words alone', async () => {
    const h = await harness();
    const m = await h.store.capture({ body: '', method: 'voice', voice: { audioPath: 'chinotto/audio/x.m4a', durationMs: 5000 } });
    await h.store.setTranscript(m.id, { state: 'ok', text: 'already said', model: UNCONFIRMED_MODEL });
    await h.retry.run();
    expect(h.read).toEqual([]);
    h.db.close();
  });

  it('skips removed moments and missing audio', async () => {
    const h = await harness();
    const removed = await h.waiting();
    await h.store.remove(removed.id);
    const missing = await h.waiting();
    await h.store.markAudioMissing(missing.id);
    await h.retry.run();
    expect(h.read).toEqual([]);
    h.db.close();
  });

  it('picks up a pending transcript only once it is clearly orphaned, not mid-capture', async () => {
    const h = await harness();
    const m = await h.store.capture({ body: '', method: 'voice', voice: { audioPath: 'chinotto/audio/p.m4a', durationMs: 5000 } });
    await h.retry.run();
    expect(h.read).toEqual([]);

    h.tick(PENDING_STALE_MS);
    await h.retry.run();
    expect(h.read).toEqual(['chinotto/audio/p.m4a']);
    expect((await h.transcript(m.id))?.state).toBe('ok');
    h.db.close();
  });
});

describe('not blind', () => {
  it('asks whether local recognition is available before touching any recording', async () => {
    const h = await harness();
    const { id } = await h.waiting();
    h.setStatus('unavailable');

    const pass = await h.retry.run();

    expect(pass).toEqual({ ran: false, why: 'unavailable' });
    expect(h.read).toEqual([]);
    // Still waiting, exactly as it was.
    expect(await h.transcript(id)).toMatchObject({ state: 'failed', failure: TRANSCRIPT_UNAVAILABLE, model: null });
    h.db.close();
  });

  it('does nothing while speech recognition is refused or undecided', async () => {
    const h = await harness();
    await h.waiting();
    h.setStatus('denied');
    expect(await h.retry.run()).toEqual({ ran: false, why: 'denied' });
    h.tick(RETRY_BACKOFF_MAX_MS);
    h.setStatus('not_determined');
    expect(await h.retry.run()).toEqual({ ran: false, why: 'not_determined' });
    expect(h.read).toEqual([]);
    h.db.close();
  });
});

describe('backoff', () => {
  it('waits longer after each check that finds no local recognition, up to a day', async () => {
    const h = await harness();
    await h.waiting();
    h.setStatus('unavailable');

    await h.retry.run();
    expect(h.statusChecks).toHaveLength(1);

    // Inside the wait: not even the status is asked.
    h.tick(RETRY_BACKOFF_MIN_MS - 1);
    expect(await h.retry.run()).toEqual({ ran: false, why: 'backing-off' });
    expect(h.statusChecks).toHaveLength(1);

    h.tick(1);
    await h.retry.run();
    expect(h.statusChecks).toHaveLength(2);

    // Doubled.
    h.tick(RETRY_BACKOFF_MIN_MS);
    expect(await h.retry.run()).toEqual({ ran: false, why: 'backing-off' });
    h.tick(RETRY_BACKOFF_MIN_MS);
    await h.retry.run();
    expect(h.statusChecks).toHaveLength(3);

    // Capped.
    for (let i = 0; i < 20; i += 1) {
      h.tick(RETRY_BACKOFF_MAX_MS);
      await h.retry.run();
    }
    const checks = h.statusChecks.length;
    h.tick(RETRY_BACKOFF_MAX_MS);
    await h.retry.run();
    expect(h.statusChecks).toHaveLength(checks + 1);
    h.db.close();
  });

  it('forgets the wait when this iPhone has just recognised locally', async () => {
    const h = await harness();
    const { id } = await h.waiting();
    h.setStatus('unavailable');
    await h.retry.run();

    h.setStatus('available');
    h.retry.reset();
    await h.retry.run();
    expect((await h.transcript(id))?.state).toBe('ok');
    h.db.close();
  });

  it('a recording it could not try keeps waiting, and backs off', async () => {
    const h = await harness();
    const { id, audioPath } = await h.waiting();
    h.results.set(audioPath, { status: 'busy' });

    expect(await h.retry.run()).toEqual({ ran: true, transcribed: 0, heardNothing: 0, stillWaiting: 1 });
    expect(await h.transcript(id)).toMatchObject({ state: 'failed', model: null });
    expect(await h.retry.run()).toEqual({ ran: false, why: 'backing-off' });
    h.db.close();
  });
});

describe('once, and never twice at the same time', () => {
  it('a reading that heard nothing is final', async () => {
    const h = await harness();
    const { id, audioPath } = await h.waiting();
    h.results.set(audioPath, { status: 'no_speech' });

    expect(await h.retry.run()).toEqual({ ran: true, transcribed: 0, heardNothing: 1, stillWaiting: 0 });
    expect(await h.transcript(id)).toMatchObject({
      state: 'failed',
      failure: TRANSCRIPT_NOTHING_HEARD,
      model: ON_DEVICE_MODEL,
    });
    await h.retry.run();
    expect(h.read).toEqual([audioPath]);
    h.db.close();
  });

  it('a local recogniser that failed on the file is not asked again either', async () => {
    const h = await harness();
    const { id, audioPath } = await h.waiting();
    h.results.set(audioPath, { status: 'failed' });
    await h.retry.run();
    await h.retry.run();
    expect(h.read).toEqual([audioPath]);
    expect((await h.transcript(id))?.model).toBe(ON_DEVICE_MODEL);
    h.db.close();
  });

  it('overlapping triggers share one pass, and each recording is read once', async () => {
    const h = await harness();
    const a = await h.waiting();
    const b = await h.waiting();
    const release = h.hold();

    const first = h.retry.run();
    const second = h.retry.run();
    expect(second).toBe(first);
    release();
    await Promise.all([first, second]);
    await h.retry.run();

    expect(h.read.sort()).toEqual([a.audioPath, b.audioPath].sort());
    // One transcript row each, and no new fragments.
    const rows = await h.db.getAllAsync<{ n: number }>('SELECT COUNT(*) AS n FROM voice_transcripts');
    expect(rows[0].n).toBe(2);
    expect(await h.store.loadRecord()).toHaveLength(2);
    h.db.close();
  });

  it('a moment removed while its file was being read does not get the words written back', async () => {
    const h = await harness();
    const { id } = await h.waiting();
    const release = h.hold();

    const pass = h.retry.run();
    await new Promise((r) => setImmediate(r));
    await h.store.remove(id);
    release();
    await pass;

    expect(await h.transcript(id)).toMatchObject({ state: 'failed', model: null, machine_transcript: null });
    h.db.close();
  });

  it('a correction made while the file was being read is not overwritten', async () => {
    const h = await harness();
    const { id } = await h.waiting();
    const release = h.hold();

    const pass = h.retry.run();
    await new Promise((r) => setImmediate(r));
    await h.store.correct(id, 'what I meant');
    release();
    await pass;

    const m = (await h.store.getFragment(id))!;
    expect(m.body).toBe('what I meant');
    expect((await h.transcript(id))?.state).toBe('ok');
    h.db.close();
  });
});

describe('labels older builds could not stand behind', () => {
  it('become ios-speech, once, and leave the words alone', async () => {
    const db = openTestDb();
    await migrate(db);
    const store = createRecordStore(db, { now: () => T0, newId: () => 'old' });
    await store.capture({ id: 'old', body: '', method: 'voice', voice: { audioPath: 'chinotto/audio/old.m4a', durationMs: 5000 } });
    await store.setTranscript('old', { state: 'ok', text: 'said before', model: ON_DEVICE_MODEL });

    // As a database that has never run this build: the marker is absent.
    await setMeta(db, 'transcripts.unconfirmed-relabelled', '0');
    await migrate(db);

    const row = await db.getFirstAsync<{ model: string; machine_transcript: string }>(
      'SELECT model, machine_transcript FROM voice_transcripts WHERE fragment_id = ?',
      'old'
    );
    expect(row).toEqual({ model: UNCONFIRMED_MODEL, machine_transcript: 'said before' });

    // A transcript made by this build is never relabelled by a later boot.
    await store.setTranscript('old', { state: 'ok', text: 'said again', model: ON_DEVICE_MODEL });
    await migrate(db);
    expect(
      (await db.getFirstAsync<{ model: string }>('SELECT model FROM voice_transcripts WHERE fragment_id = ?', 'old'))
        ?.model
    ).toBe(ON_DEVICE_MODEL);
    db.close();
  });

  it('is idempotent on its own', async () => {
    const db = openTestDb();
    await migrate(db);
    const meta = new Map<string, string>();
    const port = {
      get: async (k: string) => meta.get(k) ?? null,
      set: async (k: string, v: string) => {
        meta.set(k, v);
      },
    };
    await relabelUnconfirmedTranscripts(db, port);
    expect(await relabelUnconfirmedTranscripts(db, port)).toBe(0);
    db.close();
  });
});
