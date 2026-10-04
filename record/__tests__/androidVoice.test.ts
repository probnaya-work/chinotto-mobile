/**
 * A voice moment on Android, from the circle to its erasure, over a real database.
 *
 * The engine here speaks exactly as `modules/chinotto-voice` does: on a phone whose
 * recogniser the gate refuses (Android 12, a recogniser that could reach the network, a
 * language not installed) the final event carries the kept audio, no words, and
 * `recognition: 'unavailable'`. What follows is the same shared path the iPhone takes, and is
 * asserted here end to end for the Android shape:
 *
 *   · the recording is kept, without words, and waits;
 *   · when the phone can read it locally, it is read once, from its own file, and labelled;
 *   · removing it can be undone inside the window, with audio and words intact;
 *   · once the removal is permanent, the file and every wording are gone.
 */

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { createBridge } from '../bridge';
import { migrate } from '../migrate';
import { createRecordStore, UNDO_WINDOW_MS } from '../store';
import {
  ON_DEVICE_MODEL,
  TRANSCRIPT_UNAVAILABLE,
  createTranscriptRetry,
  type FileResult,
  type LocalStatus,
} from '../transcripts';
import { createVoiceCapture, type VoiceEngine } from '../voice';

const T0 = new Date('2026-09-24T09:00:00.000Z').getTime();

async function harness() {
  const db = openTestDb();
  await migrate(db);
  let clock = T0;
  let seq = 0;
  const onDisk = new Set<string>();
  const started: { audioFileName: string }[] = [];

  const bridge = createBridge(db, {
    now: () => clock,
    tombstone: async () => {},
    deleteAudio: (p) => onDisk.delete(p),
  });
  const store = createRecordStore(db, {
    now: () => clock,
    newId: () => `s${++seq}`,
    onChanged: (id) => void bridge.mirrorFragment(id),
  });

  const engine: VoiceEngine = {
    start: async (opts) => {
      started.push(opts);
      onDisk.add(opts.audioFileName); // the native side opens the file before anything else
    },
    stop: () => {},
    subscribe: () => () => {},
  };
  const voice = createVoiceCapture({
    store,
    engine,
    newId: () => `f${++seq}`,
    now: () => clock,
    ensureDirectory: () => true,
    fileExists: (p) => onDisk.has(p),
    deleteFile: (p) => onDisk.delete(p),
  });

  let status: LocalStatus = 'unavailable';
  const readBack: string[] = [];
  const retry = createTranscriptRetry({
    db,
    store,
    status: async () => status,
    transcribe: async (p): Promise<FileResult> => {
      readBack.push(p);
      return { status: 'ok', text: 'ferry at six forty' };
    },
    fileExists: (p) => onDisk.has(p),
    now: () => clock,
  });

  const transcript = (id: string) =>
    db.getFirstAsync<{ state: string; model: string | null; failure: string | null; machine_transcript: string | null }>(
      'SELECT state, model, failure, machine_transcript FROM voice_transcripts WHERE fragment_id = ?',
      id
    );

  /** What the Android module emits when the gate says no. */
  async function recordWithoutWords() {
    const { id, audioPath } = await voice.start();
    const outcome = await voice.settle('', { path: audioPath, durationMs: 5200 }, undefined, 'unavailable');
    return { id, audioPath, outcome };
  }

  return {
    db,
    store,
    bridge,
    voice,
    retry,
    onDisk,
    started,
    readBack,
    transcript,
    recordWithoutWords,
    setStatus: (s: LocalStatus) => {
      status = s;
    },
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('an Android recording without a recogniser', () => {
  it('is kept, with its audio and no words, and waits', async () => {
    const h = await harness();
    const { id, audioPath, outcome } = await h.recordWithoutWords();

    expect(outcome.kind).toBe('kept');
    expect(h.started[0].audioFileName).toBe(audioPath);
    expect(audioPath).toMatch(/^chinotto\/audio\/.+\.m4a$/);
    expect(h.onDisk.has(audioPath)).toBe(true);
    expect(await h.transcript(id)).toMatchObject({
      state: 'failed',
      model: null,
      failure: TRANSCRIPT_UNAVAILABLE,
    });
  });

  it('is not read while the phone cannot read it locally, and nothing else is asked', async () => {
    const h = await harness();
    await h.recordWithoutWords();
    expect(await h.retry.run()).toEqual({ ran: false, why: 'unavailable' });
    expect(h.readBack).toEqual([]);
  });

  it('is read once, from its own file, when the phone can', async () => {
    const h = await harness();
    const { id, audioPath } = await h.recordWithoutWords();
    h.setStatus('available');

    expect(await h.retry.run()).toMatchObject({ ran: true, transcribed: 1 });
    expect(h.readBack).toEqual([audioPath]);
    expect(await h.transcript(id)).toMatchObject({
      state: 'ok',
      model: ON_DEVICE_MODEL,
      machine_transcript: 'ferry at six forty',
    });

    // Never again: a local reading is final.
    h.advance(24 * 60 * 60_000);
    await h.retry.run();
    expect(h.readBack).toEqual([audioPath]);
  });
});

describe('removing an Android voice moment', () => {
  it('can be brought back inside the window, audio and words intact', async () => {
    const h = await harness();
    const { id, audioPath } = await h.recordWithoutWords();
    h.setStatus('available');
    await h.retry.run();

    await h.store.remove(id);
    h.advance(UNDO_WINDOW_MS - 1000);
    await h.bridge.publishDueRemovals(await h.store.dueRemovals());
    expect(await h.store.bringBack(id)).toBe(true);

    expect(h.onDisk.has(audioPath)).toBe(true);
    expect(await h.transcript(id)).toMatchObject({ state: 'ok', machine_transcript: 'ferry at six forty' });
  });

  it('erases the recording and its words once the removal is permanent', async () => {
    const h = await harness();
    const { id, audioPath } = await h.recordWithoutWords();
    h.setStatus('available');
    await h.retry.run();

    await h.store.remove(id);
    h.advance(UNDO_WINDOW_MS + 1000);
    await h.bridge.publishDueRemovals(await h.store.dueRemovals());

    expect(h.onDisk.has(audioPath)).toBe(false);
    expect(await h.transcript(id)).toBeNull();
    expect(await h.store.bringBack(id)).toBe(false);
  });
});
