import {
  NativeEventEmitter,
  NativeModules,
  type EmitterSubscription,
  type NativeModule,
  Platform,
} from 'react-native';

export type VoiceCapturePhase = 'idle' | 'listening';

type VoiceCaptureNativeType = {
  start: (options?: Record<string, unknown>) => Promise<void>;
  stop: () => void;
  transcribeFile?: (relativePath: string) => Promise<{ status?: unknown; text?: unknown }>;
  localRecognitionStatus?: () => Promise<unknown>;
  /** Present when supported; NativeEventEmitter needs it for `addListener`. */
  addListener?: (eventType: string) => void;
  removeListeners?: (count: number) => void;
};

const NativeVoiceCapture = NativeModules.VoiceCaptureModule as VoiceCaptureNativeType | undefined;

const emitter = NativeVoiceCapture
  ? new NativeEventEmitter(NativeVoiceCapture as unknown as NativeModule)
  : null;

export const voiceCaptureSupported = Platform.OS === 'ios' && NativeVoiceCapture != null;

export type VoiceCaptureStartOptions = {
  locale?: string;
  /** GPT-style: listen until manual stop (default). `false` = legacy ~10s burst + silence auto-stop. */
  continuous?: boolean;
  /**
   * Where to retain the recording, relative to the app's Documents directory.
   *
   * The audio is the canonical material and the transcript is derived from it, so the file
   * is opened from the same tap that feeds the recogniser — before transcription can
   * succeed or fail. Omit it and nothing is retained.
   */
  audioFileName?: string;
};

export function startVoiceCapture(options?: VoiceCaptureStartOptions) {
  if (!NativeVoiceCapture) {
    return Promise.reject(new Error('Voice capture is not available on this platform.'));
  }
  return NativeVoiceCapture.start({
    continuous: options?.continuous ?? true,
    ...(options?.locale ? { locale: options.locale } : {}),
    ...(options?.audioFileName ? { audioFileName: options.audioFileName } : {}),
  });
}

export function stopVoiceCapture() {
  NativeVoiceCapture?.stop();
}

/**
 * What recognition did for one recording. Recognition only ever runs on this iPhone, so
 * there is no "server" value to report.
 *
 *   * `on_device`   — recognised locally
 *   * `unavailable` — this iPhone has no local recogniser for the language right now
 *   * `denied`      — speech recognition is not authorised
 *   * `failed`      — recognised locally until the recogniser failed
 */
export type VoiceRecognition = 'on_device' | 'unavailable' | 'denied' | 'failed';

const RECOGNITIONS: readonly VoiceRecognition[] = ['on_device', 'unavailable', 'denied', 'failed'];

function asRecognition(value: unknown): VoiceRecognition | null {
  return RECOGNITIONS.includes(value as VoiceRecognition) ? (value as VoiceRecognition) : null;
}

/** Whether a retained recording could be read back as words, on this iPhone, right now. */
export type LocalRecognitionStatus = 'available' | 'unavailable' | 'denied' | 'not_determined';

/** Never prompts. `not_determined` means nobody has held the circle yet. */
export async function localRecognitionStatus(): Promise<LocalRecognitionStatus> {
  if (!NativeVoiceCapture?.localRecognitionStatus) return 'unavailable';
  const value = await NativeVoiceCapture.localRecognitionStatus();
  return value === 'available' || value === 'denied' || value === 'not_determined'
    ? value
    : 'unavailable';
}

export type FileTranscription =
  | { status: 'ok'; text: string }
  | { status: 'no_speech' | 'unavailable' | 'denied' | 'failed' | 'busy' | 'missing' };

/** Reads a retained recording back as words, locally only. Never prompts. */
export async function transcribeVoiceFile(relativePath: string): Promise<FileTranscription> {
  if (!NativeVoiceCapture?.transcribeFile) return { status: 'unavailable' };
  const r = await NativeVoiceCapture.transcribeFile(relativePath);
  if (r?.status === 'ok' && typeof r.text === 'string' && r.text.trim()) {
    return { status: 'ok', text: r.text };
  }
  switch (r?.status) {
    case 'no_speech':
    case 'unavailable':
    case 'denied':
    case 'busy':
    case 'missing':
      return { status: r.status };
    default:
      return { status: 'failed' };
  }
}

/**
 * What the recording turned out to be.
 *
 * Present whenever `audioFileName` was given and at least one buffer reached disk. The
 * transcript arriving empty, or not at all, does not affect this: the audio is the canonical
 * material and is reported on every exit path.
 */
export type RetainedAudio = {
  /** Relative to the app's Documents directory. */
  path: string;
  durationMs: number;
};

export type VoiceCaptureSubscriptionHandlers = {
  onStateChange?: (state: VoiceCapturePhase) => void;
  onTranscriptPartial?: (text: string) => void;
  onTranscriptFinal?: (
    text: string,
    reason: string,
    audio: RetainedAudio | null,
    audioFailure?: string,
    recognition?: VoiceRecognition | null
  ) => void;
  onError?: (code: string, message?: string) => void;
};

export function subscribeVoiceCapture(handlers: VoiceCaptureSubscriptionHandlers): () => void {
  if (!emitter) {
    return () => {};
  }

  const subs: EmitterSubscription[] = [];

  if (handlers.onStateChange) {
    subs.push(
      emitter.addListener('VoiceCaptureState', (e: { state: unknown }) => {
        const s = e?.state;
        if (s === 'idle' || s === 'listening') {
          handlers.onStateChange?.(s);
        }
      }),
    );
  }

  if (handlers.onTranscriptPartial) {
    subs.push(
      emitter.addListener('VoiceCapturePartial', (e: { text?: string }) => {
        if (typeof e?.text === 'string') {
          handlers.onTranscriptPartial?.(e.text);
        }
      }),
    );
  }

  if (handlers.onTranscriptFinal) {
    subs.push(
      emitter.addListener(
        'VoiceCaptureFinal',
        (e: {
          text?: string;
          reason?: string;
          audioPath?: string;
          durationMs?: number;
          audioFailure?: string;
          recognition?: string;
        }) => {
          if (typeof e?.text !== 'string' || typeof e?.reason !== 'string') {
            return;
          }
          const audio =
            typeof e.audioPath === 'string' && typeof e.durationMs === 'number'
              ? { path: e.audioPath, durationMs: e.durationMs }
              : null;
          handlers.onTranscriptFinal?.(
            e.text,
            e.reason,
            audio,
            e.audioFailure,
            asRecognition(e.recognition)
          );
        },
      ),
    );
  }

  if (handlers.onError) {
    subs.push(
      emitter.addListener('VoiceCaptureError', (e: { code?: string; message?: string }) => {
        if (typeof e?.code === 'string') {
          handlers.onError?.(e.code, typeof e?.message === 'string' ? e.message : undefined);
        }
      }),
    );
  }

  return () => {
    subs.forEach((s) => s.remove());
  };
}
