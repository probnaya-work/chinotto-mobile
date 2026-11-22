/**
 * Where the voice module comes from on the iPhone: the bridge module in `ios/Chinotto`.
 * Android resolves `voiceNative.android.ts` instead. Both hand back the same two things.
 */
import { NativeEventEmitter, NativeModules } from 'react-native';

import type { NativeEvents } from './nativeEvents';

export function voiceNative<T>(): { module: T | undefined; emitter: NativeEvents | null } {
  const native = NativeModules.VoiceCaptureModule;
  return {
    module: native as T | undefined,
    emitter: native ? new NativeEventEmitter(native) : null,
  };
}
