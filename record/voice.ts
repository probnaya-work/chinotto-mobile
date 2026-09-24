/**
 * Voice capture, with the audio as the canonical material.
 *
 * The ordering here is the feature, not an implementation detail:
 *
 *   1. an id is generated, and the recording is opened **under that id** before anything is
 *      listened to, so the file and the fragment can never disagree about what they are;
 *   2. the native module writes every buffer to that file from the same tap that feeds the
 *      recogniser, so a recording exists before transcription can succeed or fail;
 *   3. when recording stops, the **fragment is created from the audio** — with an empty body
 *      if that is all there is — and only then is the transcript applied;
 *   4. a transcript that never arrives, or fails, changes nothing about 1–3.
 *
 * The one thing that is thrown away is a recording under 0.8 seconds, which the prototype
 * drops silently: a circle pressed and released is not a thought, and asking about it would
 * be worse than losing it.
 *
 * Recognition runs on this iPhone or not at all (see `VoiceCaptureModule.swift`). The native
 * side says which happened, and a transcript is labelled `ios-on-device` only when it did.
 * A recording made without a local recogniser keeps its audio and waits, retryable, for
 * `record/transcripts.ts`.
 *
 * Everything the platform provides is injected, so this can be exercised without a device.
 */

import { audioPathFor, deleteRecordFile, ensureAudioDirectory, recordFileExists } from './files';
import {
  ON_DEVICE_MODEL,
  TRANSCRIPT_DENIED,
  TRANSCRIPT_NOTHING_HEARD,
  TRANSCRIPT_UNAVAILABLE,
  type FileResult,
  type LocalStatus,
} from './transcripts';
import { motion } from './ui/tokens';
import type { Material } from './model/material';
import type { RecordStore } from './store';

export type RetainedAudio = { path: string; durationMs: number };

/** What the native side says recognition did. `null` when it did not say. */
export type VoiceRecognition = 'on_device' | 'unavailable' | 'denied' | 'failed';

/** The native surface this needs, and nothing more. */
export type VoiceEngine = {
  start(options: { audioFileName: string }): Promise<void>;
  stop(): void;
  subscribe(handlers: {
    onStateChange?: (state: 'idle' | 'listening') => void;
    onTranscriptPartial?: (text: string) => void;
    onTranscriptFinal?: (
      text: string,
      reason: string,
      audio: RetainedAudio | null,
      audioFailure?: string,
      recognition?: VoiceRecognition | null
    ) => void;
    onError?: (code: string, message?: string) => void;
  }): () => void;
  /** Whether a retained recording could be read back locally now. Never prompts. */
  localStatus?: () => Promise<LocalStatus>;
  /** Reads a retained recording back as words, on the device only. Never prompts. */
  transcribeFile?: (relativePath: string) => Promise<FileResult>;
};

export type VoiceDeps = {
  store: RecordStore;
  engine: VoiceEngine;
  newId: () => string;
  now?: () => number;
  /** Called once the fragment exists, so the legacy bridge and the surface can catch up. */
  onCaptured?: (material: Material) => void;
  ensureDirectory?: () => boolean;
  fileExists?: (path: string) => boolean;
  deleteFile?: (path: string) => boolean;
};

export type VoiceOutcome =
  | { kind: 'kept'; material: Material }
  /** Under 0.8s. Dropped without comment, as the prototype does. */
  | { kind: 'too-short' }
  /** Nothing reached disk and nothing was heard: there is nothing to keep. */
  | { kind: 'nothing' };

export function createVoiceCapture(deps: VoiceDeps) {
  const now = deps.now ?? (() => Date.now());
  const ensureDirectory = deps.ensureDirectory ?? ensureAudioDirectory;
  const fileExists = deps.fileExists ?? recordFileExists;
  const removeFile = deps.deleteFile ?? deleteRecordFile;

  let pendingId: string | null = null;
  let pendingPath: string | null = null;

  /**
   * Opens a recording. The id and the path are decided here, before the microphone is
   * touched, so that whatever comes back can be attached to the right moment.
   */
  async function start(): Promise<{ id: string; audioPath: string }> {
    const id = deps.newId();
    const audioPath = audioPathFor(id);
    ensureDirectory();

    pendingId = id;
    pendingPath = audioPath;

    await deps.engine.start({ audioFileName: audioPath });
    return { id, audioPath };
  }

  function stop(): void {
    deps.engine.stop();
  }

  /**
   * What to do with what came back.
   *
   * Called from the engine's final event. It is deliberately tolerant: a transcript with no
   * audio still becomes a moment (something was said, even if it could not be kept), and
   * audio with no transcript certainly does.
   */
  async function settle(
    text: string,
    audio: RetainedAudio | null,
    audioFailure?: string,
    recognition: VoiceRecognition | null = null
  ): Promise<VoiceOutcome> {
    const id = pendingId;
    const path = pendingPath;
    pendingId = null;
    pendingPath = null;

    if (!id) return { kind: 'nothing' };

    const spoken = text.trim();
    const durationMs = audio?.durationMs ?? 0;

    // Too short to be a thought. The file goes with it; nothing is recorded anywhere.
    if (durationMs > 0 && durationMs < motion.minRecordingMs) {
      if (path) removeFile(path);
      return { kind: 'too-short' };
    }

    // Neither heard nor recorded. Pressing the circle by accident should cost nothing.
    if (!audio && !spoken) {
      if (path) removeFile(path);
      return { kind: 'nothing' };
    }

    // The fragment is created FROM the audio. The body starts empty and the transcript is
    // applied afterwards, so the order on disk matches the order of the claim: this is a
    // recording, and here is what a machine made of it.
    const material = await deps.store.capture({
      id,
      body: '',
      method: 'voice',
      origin: 'mobile',
      at: now(),
      voice: audio ? { audioPath: audio.path, durationMs: audio.durationMs } : null,
    });

    // Words only ever come from a local recogniser, but the label is not inferred from
    // that: it is applied when the native side said so, and left off when it did not.
    const local = recognition === 'on_device' || recognition === 'failed';
    if (spoken) {
      await deps.store.setTranscript(id, {
        state: 'ok',
        text: spoken,
        ...(local ? { model: ON_DEVICE_MODEL } : {}),
      });
    } else if (recognition === 'unavailable' || recognition === 'denied') {
      // No recogniser ran. Left without a model, which is what keeps it retryable.
      await deps.store.setTranscript(id, {
        state: 'failed',
        failure: recognition === 'denied' ? TRANSCRIPT_DENIED : TRANSCRIPT_UNAVAILABLE,
      });
    } else {
      await deps.store.setTranscript(id, {
        state: 'failed',
        failure: audioFailure ?? TRANSCRIPT_NOTHING_HEARD,
        // A local recogniser listened to all of it and heard nothing: an answer, not a
        // failure to ask. A recogniser that broke partway is left retryable.
        ...(recognition === 'on_device' ? { model: ON_DEVICE_MODEL } : {}),
      });
    }

    // A recording the file system claims to have and does not is said out loud rather than
    // discovered later by a play button that does nothing.
    if (audio && !fileExists(audio.path)) {
      await deps.store.markAudioMissing(id);
    }

    const settled = (await deps.store.getFragment(id)) ?? material;
    deps.onCaptured?.(settled);
    return { kind: 'kept', material: settled };
  }

  /** Checks retained audio is where the database says it is, and records the truth if not. */
  async function verifyAudio(material: Material): Promise<boolean> {
    if (material.method !== 'voice' || material.audioMissing) return false;
    const path = await deps.store.audioPathOf(material.id);
    if (!path) return false;
    if (fileExists(path)) return true;
    await deps.store.markAudioMissing(material.id);
    return false;
  }

  return { start, stop, settle, verifyAudio };
}

export type VoiceCapture = ReturnType<typeof createVoiceCapture>;
