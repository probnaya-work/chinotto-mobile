/**
 * Playing a moment back.
 *
 * The surface has always drawn a play mark on voice material; until now it toggled a flag
 * and nothing was ever heard. This is the port behind it, injected the same way the voice
 * engine is, so the rule it enforces can be exercised without a device:
 *
 *   * **one thing plays at a time** — asking for another moment stops the first;
 *   * **the mark follows the sound, not the tap** — it goes back to a triangle when the
 *     audio ends, not when the finger leaves, which is why finishing is an event rather
 *     than a promise;
 *   * **a recording that is gone says so** rather than appearing to play silence. The row
 *     already knows (`audioMissing`), and the native side checks again at the last moment,
 *     because the file can go between the read and the tap.
 *
 * Nothing here is allowed to disturb recording. The two are mutually exclusive on the
 * surface — the record is behind a veil while somebody is speaking — and they configure the
 * audio session separately, so neither has to know about the other.
 */

export type AudioPlaybackPort = {
  /** `relativePath` is relative to the Documents directory. Resolves false if no sound. */
  play(id: string, relativePath: string): Promise<boolean>;
  stop(): void;
  subscribe(handlers: {
    onFinished?: (id: string) => void;
    onError?: (id: string, code: string, message?: string) => void;
  }): () => void;
};

/** What a platform without playback provides: nothing, quietly. */
export const NO_PLAYBACK: AudioPlaybackPort = {
  play: async () => false,
  stop: () => {},
  subscribe: () => () => {},
};
