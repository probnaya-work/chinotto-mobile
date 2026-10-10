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
 * The one thing that is thrown away is a recording under 0.8 seconds: an immediate second
 * tap is not a thought, and asking about it would be worse than losing it.
 *
 * Recognition runs on this iPhone or not at all (see `VoiceCaptureModule.swift`). The native
 * side says which happened, and a transcript is labelled `ios-on-device` only when it did.
 * A recording made without a local recogniser keeps its audio and waits, retryable, for
 * `record/transcripts.ts`.
 *
 * Everything the platform provides is injected, so this can be exercised without a device.
 */

import { audioPathFor, deleteRecordFile, ensureAudioDirectory, recordFileExists, recordFileSize } from './files';
import {
  ON_DEVICE_MODEL,
  TRANSCRIPT_DENIED,
  TRANSCRIPT_NOTHING_HEARD,
  TRANSCRIPT_UNAVAILABLE,
  type FileResult,
  type LocalStatus,
} from './transcripts';
import { motion } from './ui/tokens';
import { availableDeviceBytes, storageLooksLow } from './storage';
import type { Material } from './model/material';
import type { RecordStore } from './store';

export type RetainedAudio = { path: string; durationMs: number };

/** What the native side says recognition did. `null` when it did not say. */
export type VoiceRecognition = 'on_device' | 'unavailable' | 'denied' | 'failed';

export function finalAudioFailure(reason: string, nativeFailure?: string): string | undefined {
  return nativeFailure ?? (reason === 'interruption' || reason === 'background' ? reason : undefined);
}

/** The native surface this needs, and nothing more. */
export type VoiceEngine = {
  start(options: { audioFileName: string }): Promise<void>;
  stop(): void;
  subscribe(handlers: {
    onStateChange?: (state: 'idle' | 'listening') => void;
    /** Normalized microphone input, 0...1. */
    onLevel?: (level: number) => void;
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
  fileSize?: (path: string) => number | null;
  deleteFile?: (path: string) => boolean;
  availableBytes?: () => number | null;
};

export class LowStorageWarning extends Error {
  constructor() {
    super('Device storage is low. A new recording may not be kept. Free some space, or tap again to try.');
  }
}

export type VoiceOutcome =
  | { kind: 'kept'; material: Material; transcriptWriteFailed?: boolean; audioIncomplete: boolean }
  /** Explicitly discarded before it could become a fragment. */
  | { kind: 'cancelled' }
  /** Under 0.8s. Dropped without comment, as the prototype does. */
  | { kind: 'too-short' }
  /** Nothing reached disk and nothing was heard: there is nothing to keep. */
  | { kind: 'nothing' };

export function createVoiceCapture(deps: VoiceDeps) {
  const now = deps.now ?? (() => Date.now());
  const ensureDirectory = deps.ensureDirectory ?? ensureAudioDirectory;
  const fileExists = deps.fileExists ?? recordFileExists;
  const fileSize = deps.fileSize ?? recordFileSize;
  const hasAudioBytes = (path: string) => (fileSize(path) ?? 0) > 0;
  const removeFile = deps.deleteFile ?? deleteRecordFile;
  const freeBytes = deps.availableBytes ?? availableDeviceBytes;

  let pendingId: string | null = null;
  let pendingPath: string | null = null;
  let cancelledId: string | null = null;
  let lowStorageWarned = false;

  /**
   * Opens a recording. The id and the path are decided here, before the microphone is
   * touched, so that whatever comes back can be attached to the right moment.
   */
  async function start(): Promise<{ id: string; audioPath: string }> {
    if (pendingId) throw new Error('A voice capture is already active.');
    if (storageLooksLow(freeBytes())) {
      if (!lowStorageWarned) {
        lowStorageWarned = true;
        throw new LowStorageWarning();
      }
    } else {
      lowStorageWarned = false;
    }
    const id = deps.newId();
    const audioPath = audioPathFor(id);
    if (!ensureDirectory()) throw new Error('Could not prepare space for a recording.');

    pendingId = id;
    pendingPath = audioPath;

    try {
      await deps.engine.start({ audioFileName: audioPath });
      return { id, audioPath };
    } catch (error) {
      if (pendingId === id) {
        pendingId = null;
        pendingPath = null;
      }
      if (cancelledId === id) cancelledId = null;
      // Native start can fail after opening the file. Keep any bytes for orphan recovery.
      if (!fileExists(audioPath)) removeFile(audioPath);
      throw error;
    }
  }

  function stop(): void {
    deps.engine.stop();
  }

  /**
   * Ends the native session but marks this capture as somebody changing their mind. The
   * native side still closes and reports the file normally; `settle` is where that file is
   * deleted, before any fragment can be created from it.
   */
  function cancel(): void {
    if (pendingId) cancelledId = pendingId;
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
    const cancelled = id !== null && cancelledId === id;
    pendingId = null;
    pendingPath = null;
    if (cancelled) cancelledId = null;

    if (!id) return { kind: 'nothing' };

    if (cancelled) {
      if (path) removeFile(path);
      if (audio?.path && audio.path !== path) removeFile(audio.path);
      return { kind: 'cancelled' };
    }

    let spoken = text.trim();
    let recognitionResult = recognition;
    const durationMs = audio?.durationMs ?? 0;

    // Too short to be a thought. The file goes with it; nothing is recorded anywhere.
    if (!audioFailure && durationMs > 0 && durationMs < motion.minRecordingMs) {
      if (path) removeFile(path);
      return { kind: 'too-short' };
    }

    // Neither heard nor recorded. Pressing the circle by accident should cost nothing.
    if (!audio && !spoken && !(audioFailure && path && hasAudioBytes(path))) {
      if (path) removeFile(path);
      return { kind: 'nothing' };
    }

    // A quick second tap can close the live recognition task before it has emitted even a
    // partial, while the complete audio file is already safe. Give that finished file one
    // immediate local pass before showing a permanent-looking transcription failure. This
    // is the same on-device recogniser, not a network fallback, and only runs when one was
    // available for the live session.
    if (
      !spoken &&
      audio &&
      deps.engine.transcribeFile &&
      (recognitionResult === 'on_device' || recognitionResult === 'failed')
    ) {
      const retried = await deps.engine
        .transcribeFile(audio.path)
        .catch((): FileResult => ({ status: 'failed' }));
      if (retried.status === 'ok') {
        spoken = retried.text.trim();
        recognitionResult = 'on_device';
      }
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
      voice: { audioPath: audio?.path ?? path ?? audioPathFor(id), durationMs: audio?.durationMs ?? 0 },
    });
    if (audioFailure) await deps.store.markAudioIncomplete(id);

    // Words only ever come from a local recogniser, but the label is not inferred from
    // that: it is applied when the native side said so, and left off when it did not.
    const local = recognitionResult === 'on_device' || recognitionResult === 'failed';
    let transcriptWriteFailed = false;
    try {
      if (spoken) {
        await deps.store.setTranscript(id, {
          state: 'ok',
          text: spoken,
          ...(local ? { model: ON_DEVICE_MODEL } : {}),
        });
      } else if (recognitionResult === 'unavailable' || recognitionResult === 'denied') {
        // No recogniser ran. Left without a model, which is what keeps it retryable.
        await deps.store.setTranscript(id, {
          state: 'failed',
          failure: recognitionResult === 'denied' ? TRANSCRIPT_DENIED : TRANSCRIPT_UNAVAILABLE,
        });
      } else {
        await deps.store.setTranscript(id, {
          state: 'failed',
          failure: audioFailure ?? TRANSCRIPT_NOTHING_HEARD,
          // A local recogniser listened to all of it and heard nothing: an answer, not a
          // failure to ask. A recogniser that broke partway is left retryable.
          ...(recognitionResult === 'on_device' ? { model: ON_DEVICE_MODEL } : {}),
        });
      }
    } catch {
      // The fragment and recording were already committed. Leave the transcript pending
      // so a later local retry can read the audio rather than claiming the words were saved.
      transcriptWriteFailed = true;
    }

    // A recording the file system claims to have and does not is said out loud rather than
    // discovered later by a play button that does nothing.
    if (!hasAudioBytes(audio?.path ?? path ?? audioPathFor(id))) {
      await deps.store.markAudioMissing(id);
    }

    const settled = (await deps.store.getFragment(id)) ?? material;
    deps.onCaptured?.(settled);
    return { kind: 'kept', material: settled, transcriptWriteFailed, audioIncomplete: Boolean(audioFailure) };
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

  return { start, stop, cancel, settle, verifyAudio };
}

export type VoiceCapture = ReturnType<typeof createVoiceCapture>;
