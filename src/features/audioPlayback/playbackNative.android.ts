/** Where the playback module comes from on Android: `modules/chinotto-voice`. */
import { requireOptionalNativeModule } from 'expo';

import type { NativeEvents } from '../voiceCapture/nativeEvents';

export function playbackNative<T>(): { module: T | undefined; emitter: NativeEvents | null } {
  const module = requireOptionalNativeModule('ChinottoAudioPlayback');
  return {
    module: (module ?? undefined) as T | undefined,
    emitter: (module as unknown as NativeEvents | null) ?? null,
  };
}
