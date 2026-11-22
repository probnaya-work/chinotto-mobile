/**
 * Where the playback module comes from on the iPhone: the bridge module in `ios/Chinotto`.
 * Android resolves `playbackNative.android.ts` instead.
 */
import { NativeEventEmitter, NativeModules } from 'react-native';

import type { NativeEvents } from '../voiceCapture/nativeEvents';

export function playbackNative<T>(): { module: T | undefined; emitter: NativeEvents | null } {
  const native = NativeModules.AudioPlaybackModule;
  return {
    module: native as T | undefined,
    emitter: native ? new NativeEventEmitter(native) : null,
  };
}
