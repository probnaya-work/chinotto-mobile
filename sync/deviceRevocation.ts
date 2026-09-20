/**
 * Whether this device has been removed from the record somewhere else.
 *
 * Kept as one module-level fact rather than passed around, because every sending path
 * already asks one question before it sends — `isSyncAccessBlocked()` — and this is the
 * second half of that question. Adding it there means the queue, the tombstone outbox, the
 * theme outbox and the ingest all honour a revocation without any of them being changed.
 *
 * What removal means, precisely: **this device stops syncing. It does not lose anything.**
 * Everything already captured stays exactly where it is, and the queue stays pending rather
 * than being discarded, so nothing is destroyed by a revocation and a device that is allowed
 * back resumes where it stopped.
 *
 * This is enforcement by agreement, not by the server — see `sync/firestoreDevices.ts`.
 */

let revoked = false;

/** Set from the device list on every read. */
export function setThisDeviceRevoked(value: boolean): void {
  revoked = value;
}

export function isThisDeviceRevoked(): boolean {
  return revoked;
}

/** Tests only. */
export function resetThisDeviceRevokedForTests(): void {
  revoked = false;
}
