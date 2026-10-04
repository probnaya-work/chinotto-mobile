/**
 * Where the playback module comes from on the iPhone: the bridge module in `ios/Chinotto`.
 * Android resolves `playbackNative.android.ts` instead.
 */
import { NativeEventEmitter, NativeModules, type NativeModule } from 'react-native';

import type { NativeEvents } from '../voiceCapture/nativeEvents';

export function playbackNative<T>(): { module: T | undefined; emitter: NativeEvents | null } {
  const module = NativeModules.AudioPlaybackModule as T | undefined;
  return {
    module,
    emitter: module ? new NativeEventEmitter(module as unknown as NativeModule) : null,
  };
}
