/**
 * What a recording says about how its words were made.
 *
 * Recognition happens on this iPhone or not at all. The native side reports which, and the
 * transcript is labelled `ios-on-device` only when it said so. A recording made without a
 * local recogniser — unsupported language, speech recognition refused — is kept with its
 * audio and left waiting, retryable, rather than lost or sent anywhere.
 */

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createRecordStore } from '../store';
import {
  ON_DEVICE_MODEL,
  TRANSCRIPT_DENIED,
  TRANSCRIPT_NOTHING_HEARD,
  TRANSCRIPT_UNAVAILABLE,
  retryCandidates,
} from '../transcripts';
import { createVoiceCapture, type VoiceEngine, type VoiceRecognition } from '../voice';

const T0 = new Date('2026-09-24T09:00:00.000Z').getTime();

async function harness() {
  const db = openTestDb();
  await migrate(db);
  let seq = 0;
  const deleted: string[] = [];
  const engine: VoiceEngine = { start: async () => {}, stop: () => {}, subscribe: () => () => {} };
  const store = createRecordStore(db, { now: () => T0, newId: () => `s${++seq}` });
  const voice = createVoiceCapture({
    store,
    engine,
    newId: () => `f${++seq}`,
    now: () => T0,
    ensureDirectory: () => true,
    fileExists: () => true,
    deleteFile: (p) => {
      deleted.push(p);
      return true;
    },
  });

  const transcript = (id: string) =>
    db.getFirstAsync<{ state: string; model: string | null; failure: string | null; machine_transcript: string | null }>(
      'SELECT state, model, failure, machine_transcript FROM voice_transcripts WHERE fragment_id = ?',
      id
    );

  async function record(text: string, recognition: VoiceRecognition | null) {
    const { id, audioPath } = await voice.start();
    const outcome = await voice.settle(text, { path: audioPath, durationMs: 6000 }, undefined, recognition);
    return { id, audioPath, outcome };
  }

  return { db, store, voice, deleted, transcript, record };
}

describe('the transcript says how it was made', () => {
  it('labels words recognised on this iPhone as on-device', async () => {
    const h = await harness();
    const { id } = await h.record('a thought said aloud', 'on_device');
    expect(await h.transcript(id)).toMatchObject({
      state: 'ok',
      model: ON_DEVICE_MODEL,
      machine_transcript: 'a thought said aloud',
    });
    h.db.close();
  });

  it('labels words from a local recogniser that failed partway as on-device too', async () => {
    const h = await harness();
    const { id } = await h.record('half of it', 'failed');
    expect(await h.transcript(id)).toMatchObject({ state: 'ok', model: ON_DEVICE_MODEL });
    h.db.close();
  });

  it('does not claim on-device when the native side did not say so', async () => {
    const h = await harness();
    const { id } = await h.record('words from somewhere', null);
    expect((await h.transcript(id))?.model).toBeNull();
    h.db.close();
  });
});

describe('local recognition unavailable', () => {
  it('keeps the recording, with no words, and leaves it waiting', async () => {
    const h = await harness();
    const { id, audioPath, outcome } = await h.record('', 'unavailable');

    expect(outcome.kind).toBe('kept');
    expect(h.deleted).toEqual([]);
    expect(await h.store.audioPathOf(id)).toBe(audioPath);
    const m = (await h.store.getFragment(id))!;
    expect(m.method).toBe('voice');
    expect(m.body).toBe('');
    expect(m.transcriptState).toBe('failed');
    expect(await h.transcript(id)).toMatchObject({ failure: TRANSCRIPT_UNAVAILABLE, model: null });
    expect((await retryCandidates(h.db, T0)).map((c) => c.id)).toEqual([id]);
    h.db.close();
  });
});

describe('speech recognition refused', () => {
  it('still records, and says why there are no words', async () => {
    const h = await harness();
    const { id, audioPath, outcome } = await h.record('', 'denied');

    expect(outcome.kind).toBe('kept');
    expect(await h.store.audioPathOf(id)).toBe(audioPath);
    expect(await h.transcript(id)).toMatchObject({ state: 'failed', failure: TRANSCRIPT_DENIED, model: null });
    // Allowing it later is enough for this one to get its words.
    expect((await retryCandidates(h.db, T0)).map((c) => c.id)).toEqual([id]);
    h.db.close();
  });
});

describe('a local recogniser that heard nothing', () => {
  it('is an answer, and is not asked again', async () => {
    const h = await harness();
    const { id } = await h.record('', 'on_device');
    expect(await h.transcript(id)).toMatchObject({
      state: 'failed',
      failure: TRANSCRIPT_NOTHING_HEARD,
      model: ON_DEVICE_MODEL,
    });
    expect(await retryCandidates(h.db, T0)).toEqual([]);
    h.db.close();
  });

  it('a recogniser that broke with nothing heard is left to try again', async () => {
    const h = await harness();
    const { id } = await h.record('', 'failed');
    expect((await h.transcript(id))?.model).toBeNull();
    expect((await retryCandidates(h.db, T0)).map((c) => c.id)).toEqual([id]);
    h.db.close();
  });
});

describe('the existing thresholds still hold without a recogniser', () => {
  it('a press-and-release is still dropped, file and all', async () => {
    const h = await harness();
    const { audioPath } = await h.voice.start();
    const outcome = await h.voice.settle('', { path: audioPath, durationMs: 400 }, undefined, 'unavailable');
    expect(outcome).toEqual({ kind: 'too-short' });
    expect(h.deleted).toEqual([audioPath]);
    h.db.close();
  });

  it('a recording of exactly the threshold is kept', async () => {
    const h = await harness();
    const { audioPath } = await h.voice.start();
    const outcome = await h.voice.settle('', { path: audioPath, durationMs: 800 }, undefined, 'denied');
    expect(outcome.kind).toBe('kept');
    h.db.close();
  });
});
