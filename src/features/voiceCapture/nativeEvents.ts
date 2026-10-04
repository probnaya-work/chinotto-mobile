/** The part of a native event emitter the voice and playback bridges use. */
export type NativeEvents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addListener(eventType: string, listener: (event: any) => void): { remove(): void };
};
