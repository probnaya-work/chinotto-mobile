/**
 * Where the voice module comes from on Android: the local Expo module in
 * `modules/chinotto-voice`, which is its own event emitter.
 */
import { requireOptionalNativeModule } from 'expo';

import type { NativeEvents } from './nativeEvents';

export function voiceNative<T>(): { module: T | undefined; emitter: NativeEvents | null } {
  const module = requireOptionalNativeModule('ChinottoVoiceCapture');
  return {
    module: (module ?? undefined) as T | undefined,
    emitter: (module as unknown as NativeEvents | null) ?? null,
  };
}
