/**
 * Where the voice module comes from on the iPhone: the bridge module in `ios/Chinotto`.
 * Android resolves `voiceNative.android.ts` instead. Both hand back the same two things.
 */
import { NativeEventEmitter, NativeModules, type NativeModule } from 'react-native';

import type { NativeEvents } from './nativeEvents';

export function voiceNative<T>(): { module: T | undefined; emitter: NativeEvents | null } {
  const module = NativeModules.VoiceCaptureModule as T | undefined;
  return {
    module,
    emitter: module ? new NativeEventEmitter(module as unknown as NativeModule) : null,
  };
}
