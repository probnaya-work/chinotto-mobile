/**
 * Voice: the audio is the canonical material, the transcript is derived from it.
 *
 * Every test here is a way that ordering could be broken, written down so it cannot be.
 */

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createRecordStore } from '../store';
import { createVoiceCapture, type VoiceEngine } from '../voice';

const T0 = new Date('2026-09-19T17:10:00.000Z').getTime();

function harness(options: { filesPresent?: boolean } = {}) {
  const db = openTestDb();
  let seq = 0;
  let clock = T0;

  const started: { audioFileName: string }[] = [];
  const deleted: string[] = [];
  const engine: VoiceEngine = {
    start: async (opts) => {
      started.push(opts);
    },
    stop: () => {},
    subscribe: () => () => {},
  };

  const store = createRecordStore(db, { now: () => clock, newId: () => `s${++seq}` });
  const voice = createVoiceCapture({
    store,
    engine,
    newId: () => `f${++seq}`,
    now: () => clock,
    ensureDirectory: () => true,
    fileExists: () => options.filesPresent ?? true,
    deleteFile: (p) => {
      deleted.push(p);
      return true;
    },
  });

  return {
    db,
    store,
    voice,
    started,
    deleted,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

describe('voice capture', () => {
  it('opens the recording under the fragment id, before anything is heard', async () => {
    const h = harness();
    await migrate(h.db);

    const { id, audioPath } = await h.voice.start();
    expect(h.started).toHaveLength(1);
    // The file and the fragment cannot disagree about what they are.
    expect(audioPath).toContain(id);
    expect(h.started[0].audioFileName).toBe(audioPath);
    // And nothing exists in the record yet: capture has not happened.
    expect(await h.store.loadRecord()).toEqual([]);
    h.db.close();
  });

  it('keeps the recording even when nothing was recognised', async () => {
    const h = harness();
    await migrate(h.db);
    const { id, audioPath } = await h.voice.start();

    const outcome = await h.voice.settle('', { path: audioPath, durationMs: 42_000 });

    expect(outcome.kind).toBe('kept');
    const m = (await h.store.getFragment(id))!;
    expect(m.method).toBe('voice');
    expect(m.durationMs).toBe(42_000);
    expect(m.transcriptState).toBe('failed');
    expect(await h.store.audioPathOf(id)).toBe(audioPath);
    // It is in the record, and it is not blank-looking nonsense: it is a recording.
    expect((await h.store.loadRecord()).map((x) => x.id)).toContain(id);
    expect(h.deleted).toEqual([]);
    h.db.close();
  });

  it('applies the transcript as derived, after the fragment exists', async () => {
    const h = harness();
    await migrate(h.db);
    const { id, audioPath } = await h.voice.start();

    await h.voice.settle('ref four four seven one', { path: audioPath, durationMs: 6000 });

    const m = (await h.store.getFragment(id))!;
    expect(m.body).toBe('ref four four seven one');
    expect(m.transcriptState).toBe('ok');
    // The transcript did not become a correction: nobody corrected anything.
    expect(m.correctionCount).toBe(0);
    expect(m.previousBody).toBeNull();
    h.db.close();
  });

  it('never lets a correction be overwritten by the machine', async () => {
    const h = harness();
    await migrate(h.db);
    const { id, audioPath } = await h.voice.start();
    await h.voice.settle('ref four four seven one', { path: audioPath, durationMs: 6000 });

    h.tick(30_000);
    await h.store.correct(id, 'ref 4471');

    // A later re-transcription of the same audio.
    h.tick(1000);
    await h.store.setTranscript(id, { state: 'ok', text: 'ref four four seven one' });

    const m = (await h.store.getFragment(id))!;
    expect(m.body).toBe('ref 4471');
    expect(m.previousBody).toBe('ref four four seven one');
    h.db.close();
  });

  it('correcting a transcript never touches the recording', async () => {
    const h = harness();
    await migrate(h.db);
    const { id, audioPath } = await h.voice.start();
    await h.voice.settle('heard it this way', { path: audioPath, durationMs: 9000 });

    const before = await h.db.getAllAsync('SELECT * FROM voice_captures WHERE fragment_id = ?', id);
    h.tick(1000);
    await h.store.correct(id, 'meant it that way');
    const after = await h.db.getAllAsync('SELECT * FROM voice_captures WHERE fragment_id = ?', id);

    expect(after).toEqual(before);
    expect(await h.store.audioPathOf(id)).toBe(audioPath);
    h.db.close();
  });

  it('drops a press-and-release without comment, and takes the file with it', async () => {
    const h = harness();
    await migrate(h.db);
    const { audioPath } = await h.voice.start();

    const outcome = await h.voice.settle('', { path: audioPath, durationMs: 400 });

    expect(outcome).toEqual({ kind: 'too-short' });
    expect(await h.store.loadRecord()).toEqual([]);
    expect(h.deleted).toEqual([audioPath]);
    h.db.close();
  });

  it('keeps a recording of exactly the threshold', async () => {
    const h = harness();
    await migrate(h.db);
    const { audioPath } = await h.voice.start();
    const outcome = await h.voice.settle('', { path: audioPath, durationMs: 800 });
    expect(outcome.kind).toBe('kept');
    h.db.close();
  });

  it('keeps what was heard even when the recording could not be written', async () => {
    const h = harness();
    await migrate(h.db);
    const { id } = await h.voice.start();

    // The volume was full; the recogniser still worked.
    const outcome = await h.voice.settle('the thing about the ferry', null, 'ENOSPC');

    expect(outcome.kind).toBe('kept');
    const m = (await h.store.getFragment(id))!;
    expect(m.body).toBe('the thing about the ferry');
    expect(m.method).toBe('voice');
    expect(await h.store.audioPathOf(id)).toBeNull();
    h.db.close();
  });

  it('costs nothing when the circle was pressed by accident', async () => {
    const h = harness();
    await migrate(h.db);
    await h.voice.start();
    expect(await h.voice.settle('', null)).toEqual({ kind: 'nothing' });
    expect(await h.store.loadRecord()).toEqual([]);
    h.db.close();
  });

  it('says the audio is gone rather than offering a play button that does nothing', async () => {
    const h = harness({ filesPresent: false });
    await migrate(h.db);
    const { id, audioPath } = await h.voice.start();

    await h.voice.settle('said something', { path: audioPath, durationMs: 5000 });

    const m = (await h.store.getFragment(id))!;
    expect(m.audioMissing).toBe(true);
    // The moment survives. Only the claim to have the audio does not.
    expect(m.body).toBe('said something');
    expect((await h.store.loadRecord()).map((x) => x.id)).toContain(id);
    h.db.close();
  });

  it('notices later that retained audio has gone missing', async () => {
    const h = harness();
    await migrate(h.db);
    const { id, audioPath } = await h.voice.start();
    await h.voice.settle('still here', { path: audioPath, durationMs: 5000 });

    const present = (await h.store.getFragment(id))!;
    expect(await h.voice.verifyAudio(present)).toBe(true);

    // A restore, a cleanup, a bug — the file is no longer there.
    const gone = harness({ filesPresent: false });
    await migrate(gone.db);
    const g = await gone.voice.start();
    await gone.voice.settle('was here', { path: g.audioPath, durationMs: 5000 });
    const m = (await gone.store.getFragment(g.id))!;
    expect(m.audioMissing).toBe(true);
    gone.db.close();
    h.db.close();
  });

  it('survives a very long recording with a very long transcript', async () => {
    const h = harness();
    await migrate(h.db);
    const { id, audioPath } = await h.voice.start();

    const long = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(' ');
    await h.voice.settle(long, { path: audioPath, durationMs: 55 * 60 * 1000 });

    const m = (await h.store.getFragment(id))!;
    expect(m.body.length).toBeGreaterThan(20_000);
    expect(m.durationMs).toBe(55 * 60 * 1000);
    h.db.close();
  });
});
