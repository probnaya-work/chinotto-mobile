/**
 * The native side of playing retained voice audio back.
 *
 * Mirrors `NativeVoiceCapture` deliberately: relative paths, events rather than promises for
 * anything that happens later, and a module that is simply absent on platforms that do not
 * have it — so the surface degrades to "no playback" rather than to a crash.
 */

import { Platform } from 'react-native';

import { playbackNative } from './playbackNative';

type AudioPlaybackNativeType = {
  /** Resolves true when sound is actually coming out; false when it could not start. */
  play: (options: { id: string; path: string }) => Promise<boolean>;
  stop: () => void;
  addListener?: (eventType: string) => void;
  removeListeners?: (count: number) => void;
};

// The iPhone's bridge module, or Android's `modules/chinotto-voice` — same contract.
const { module: NativeAudioPlayback, emitter } = playbackNative<AudioPlaybackNativeType>();

export const audioPlaybackSupported =
  (Platform.OS === 'ios' || Platform.OS === 'android') && NativeAudioPlayback != null;

/** `path` is relative to the app's Documents directory, as stored in `voice_captures`. */
export function playAudio(id: string, path: string): Promise<boolean> {
  if (!NativeAudioPlayback) return Promise.resolve(false);
  return NativeAudioPlayback.play({ id, path });
}

export function stopAudio(): void {
  NativeAudioPlayback?.stop();
}

export type AudioPlaybackHandlers = {
  /** This moment is no longer playing — it ran out, or it could not start. */
  onFinished?: (id: string) => void;
  onError?: (id: string, code: string, message?: string) => void;
};

export function subscribeAudioPlayback(handlers: AudioPlaybackHandlers): () => void {
  if (!emitter) return () => {};

  const subs: { remove(): void }[] = [];

  if (handlers.onFinished) {
    subs.push(
      emitter.addListener('AudioPlaybackFinished', (e: { id?: string }) => {
        if (typeof e?.id === 'string') handlers.onFinished?.(e.id);
      })
    );
  }

  if (handlers.onError) {
    subs.push(
      emitter.addListener(
        'AudioPlaybackError',
        (e: { id?: string; code?: string; message?: string }) => {
          if (typeof e?.id === 'string' && typeof e?.code === 'string') {
            handlers.onError?.(e.id, e.code, e.message || undefined);
          }
        }
      )
    );
  }

  return () => subs.forEach((s) => s.remove());
}
