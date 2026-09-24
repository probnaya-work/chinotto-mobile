/**
 * Reading retained recordings back as words, later, on this iPhone only.
 *
 * A recording made while this iPhone had no local recogniser for the language — or before
 * speech recognition was allowed — keeps its audio and has no words. Nothing is sent
 * anywhere to get them. Instead, when the phone says it can recognise locally, each such
 * recording is read back once, from its own file, by the same on-device-only path a live
 * capture uses (`VoiceCaptureModule.transcribeFile`).
 *
 * What makes this safe to run in the background:
 *
 *   * **Not blind.** A pass starts by asking whether local recognition is available at all,
 *     which asks nothing of the person. If it is not, nothing is attempted and the next
 *     check waits longer than the last one.
 *   * **Once per recording.** A recogniser that actually ran records its `model` on the
 *     transcript, success or not, and a transcript with a local model is never picked up
 *     again. A recording that could not be tried — the recogniser went away, the phone was
 *     recording — is left exactly as it was, still waiting.
 *   * **One pass at a time.** Overlapping triggers share the pass that is running.
 *   * **Nothing new is made.** A result updates the one transcript row that already exists;
 *     it never creates a fragment, a file or a second transcript. And it is only written if
 *     the moment is still in the record — a removal made while the file was being read wins.
 *   * **The person's words win.** `setTranscript` fills the body only while nobody has
 *     worded the moment themselves (4.11).
 */

import type { RecordDb } from './db';
import type { RecordStore } from './store';

/** The only label a machine transcript made on this phone carries: recognised locally. */
export const ON_DEVICE_MODEL = 'ios-on-device';

/**
 * What older builds wrote, which may have been recognised on Apple's servers. Transcripts
 * carrying `ios-on-device` from before this build are relabelled to this by
 * `relabelUnconfirmedTranscripts`: the label was a claim those builds could not make.
 */
export const UNCONFIRMED_MODEL = 'ios-speech';

/** Why a recording has no words. Stored as `voice_transcripts.failure`. */
export const TRANSCRIPT_UNAVAILABLE = 'not transcribed · no on-device recognition for this language';
export const TRANSCRIPT_DENIED = 'not transcribed · speech recognition is not allowed';
export const TRANSCRIPT_NOTHING_HEARD = 'nothing was recognised';
export const TRANSCRIPT_RECOGNISER_FAILED = 'the on-device recogniser stopped';

/** A `pending` transcript older than this was orphaned by a kill between capture and settle. */
export const PENDING_STALE_MS = 10 * 60_000;
/** First wait after a pass that found no local recognition, then doubling. */
export const RETRY_BACKOFF_MIN_MS = 5 * 60_000;
export const RETRY_BACKOFF_MAX_MS = 24 * 60 * 60_000;
/** How many recordings one pass reads. The rest wait for the next pass. */
export const RETRY_BATCH = 20;

export type LocalStatus = 'available' | 'unavailable' | 'denied' | 'not_determined';

export type FileResult =
  | { status: 'ok'; text: string }
  | { status: 'no_speech' | 'unavailable' | 'denied' | 'failed' | 'busy' | 'missing' };

export type TranscriptRetryDeps = {
  db: RecordDb;
  store: RecordStore;
  /** Never prompts. */
  status: () => Promise<LocalStatus>;
  /** Local-only recognition of a retained file. Never prompts. */
  transcribe: (relativePath: string) => Promise<FileResult>;
  fileExists: (relativePath: string) => boolean;
  now?: () => number;
};

export type RetryPass =
  | { ran: false; why: 'running' | 'backing-off' | LocalStatus }
  | { ran: true; transcribed: number; heardNothing: number; stillWaiting: number };

type Candidate = { id: string; audio_path: string };

/**
 * Recordings that have never been read by a local recogniser and could be now.
 *
 * `model` is the marker: a local attempt always writes one. Legacy failures from older
 * builds have none, so each of those gets its one local reading too.
 */
export async function retryCandidates(
  db: RecordDb,
  now: number,
  limit = RETRY_BATCH
): Promise<Candidate[]> {
  return db.getAllAsync<Candidate>(
    `SELECT f.id, v.audio_path
       FROM fragments f
       JOIN voice_captures v ON v.fragment_id = f.id
       JOIN voice_transcripts t ON t.fragment_id = f.id
      WHERE f.removed_at IS NULL
        AND v.audio_missing = 0
        AND (t.model IS NULL OR t.model <> ?)
        AND (t.state = 'failed' OR (t.state = 'pending' AND v.recorded_at <= ?))
      ORDER BY f.captured_at DESC
      LIMIT ?`,
    ON_DEVICE_MODEL,
    new Date(now - PENDING_STALE_MS).toISOString(),
    limit
  );
}

export function createTranscriptRetry(deps: TranscriptRetryDeps) {
  const now = deps.now ?? (() => Date.now());
  let running: Promise<RetryPass> | null = null;
  let backoffMs = 0;
  let notBefore = 0;

  function backOff() {
    backoffMs = backoffMs === 0 ? RETRY_BACKOFF_MIN_MS : Math.min(backoffMs * 2, RETRY_BACKOFF_MAX_MS);
    notBefore = now() + backoffMs;
  }

  /** Still in the record, still without a local reading, still pointing at this file. */
  async function stillWanted(c: Candidate): Promise<boolean> {
    const row = await deps.db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n
         FROM fragments f
         JOIN voice_captures v ON v.fragment_id = f.id
         JOIN voice_transcripts t ON t.fragment_id = f.id
        WHERE f.id = ? AND f.removed_at IS NULL AND v.audio_path = ?
          AND (t.model IS NULL OR t.model <> ?)`,
      c.id,
      c.audio_path,
      ON_DEVICE_MODEL
    );
    return (row?.n ?? 0) > 0;
  }

  async function pass(): Promise<RetryPass> {
    if (now() < notBefore) return { ran: false, why: 'backing-off' };

    const status = await deps.status().catch((): LocalStatus => 'unavailable');
    if (status !== 'available') {
      backOff();
      return { ran: false, why: status };
    }

    const candidates = await retryCandidates(deps.db, now());
    let transcribed = 0;
    let heardNothing = 0;
    let stillWaiting = 0;

    for (const c of candidates) {
      if (!deps.fileExists(c.audio_path)) {
        await deps.store.markAudioMissing(c.id);
        continue;
      }

      const result = await deps.transcribe(c.audio_path).catch((): FileResult => ({ status: 'failed' }));

      // Nothing was tried: the phone was recording, or the recogniser went away between the
      // check and the file. The recording stays exactly as it was, and waits.
      if (result.status === 'busy' || result.status === 'unavailable' || result.status === 'denied') {
        stillWaiting += 1;
        continue;
      }
      // The native side would not read it — gone since the check above, or a path that is
      // not plainly one of ours. Nothing is recorded about it on that basis alone.
      if (result.status === 'missing') continue;
      // Removed, or already read, while the file was being read: the result is not written.
      if (!(await stillWanted(c))) continue;

      if (result.status === 'ok') {
        await deps.store.setTranscript(c.id, { state: 'ok', text: result.text, model: ON_DEVICE_MODEL });
        transcribed += 1;
      } else {
        await deps.store.setTranscript(c.id, {
          state: 'failed',
          failure: result.status === 'no_speech' ? TRANSCRIPT_NOTHING_HEARD : TRANSCRIPT_RECOGNISER_FAILED,
          model: ON_DEVICE_MODEL,
        });
        heardNothing += 1;
      }
    }

    // Available, and everything it could read has been read: the next change of state is
    // worth noticing promptly again. Something left waiting backs off like a miss.
    if (stillWaiting > 0) backOff();
    else backoffMs = 0;

    return { ran: true, transcribed, heardNothing, stillWaiting };
  }

  /**
   * Forgets the backoff. For when something has just shown local recognition works — a
   * capture recognised on this iPhone — so recordings waiting for it are not kept waiting.
   */
  function reset(): void {
    backoffMs = 0;
    notBefore = 0;
  }

  /** Runs a pass, or joins the one already running. Never throws. */
  function run(): Promise<RetryPass> {
    if (running) return running;
    running = pass()
      .catch((): RetryPass => ({ ran: false, why: 'unavailable' }))
      .finally(() => {
        running = null;
      });
    return running;
  }

  return { run, reset };
}

export type TranscriptRetry = ReturnType<typeof createTranscriptRetry>;

const RELABEL_KEY = 'transcripts.unconfirmed-relabelled';

/**
 * Once, at the first launch of a build that only recognises on-device.
 *
 * Earlier builds labelled every transcript `ios-on-device` whether or not the recogniser had
 * actually stayed on the phone — for a language without local support it had not. Those
 * labels are claims the data cannot support, so they become `ios-speech`: Apple speech
 * recognition, path unknown. The transcripts themselves are untouched, and none of them is
 * re-read: they are words somebody already has.
 *
 * Runs from `migrate`, before anything can write a new transcript, and records that it ran
 * so a transcript made by this build is never relabelled.
 */
export async function relabelUnconfirmedTranscripts(
  db: RecordDb,
  meta: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  }
): Promise<number> {
  if ((await meta.get(RELABEL_KEY)) === '1') return 0;
  let changed = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      'UPDATE voice_transcripts SET model = ? WHERE model = ?',
      UNCONFIRMED_MODEL,
      ON_DEVICE_MODEL
    );
    changed = res.changes;
    await meta.set(RELABEL_KEY, '1');
  });
  return changed;
}
