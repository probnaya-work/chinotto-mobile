/** Coalesce many Firestore ingest callbacks (backfill pages) into fewer list refreshes. */
export const REMOTE_INGEST_STREAM_DEBOUNCE_MS = 120;

/**
 * Wait until after the sync sheet dismiss animation before attaching listeners, so the stream does
 * not jump while the modal is still animating.
 */
export const REMOTE_INGEST_AFTER_SYNC_MODAL_MS = 200;

export function createDebouncedRemoteIngestNotifier(
  onBump: () => void,
  debounceMs: number = REMOTE_INGEST_STREAM_DEBOUNCE_MS
): {
  notify: () => void;
  /** Clears a scheduled bump without firing. */
  cancel: () => void;
  /** If a bump is pending, run it now (e.g. before tearing down ingest). */
  flush: () => void;
} {
  let pending: ReturnType<typeof setTimeout> | null = null;
  return {
    notify: () => {
      if (pending != null) {
        clearTimeout(pending);
      }
      pending = setTimeout(() => {
        pending = null;
        onBump();
      }, debounceMs);
    },
    cancel: () => {
      if (pending != null) {
        clearTimeout(pending);
        pending = null;
      }
    },
    flush: () => {
      if (pending != null) {
        clearTimeout(pending);
        pending = null;
        onBump();
      }
    },
  };
}
