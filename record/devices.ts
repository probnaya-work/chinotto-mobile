/**
 * Device identity, so the cloud can list devices rather than only a user.
 *
 * The sync surface says "devices on this record" and offers `remove` on the ones that are
 * not this phone. That list cannot be faked: a row that said "a moment ago" without anything
 * behind it would be a lie, and `remove` would do nothing. So this registers a real identity
 * and heartbeats it, and the surface draws only what is actually there.
 *
 * Two rules, both inherited from desktop (their 0.17–0.19):
 *
 *   * the id is generated **once** and never changes. A device that could re-register under
 *     a new id could not be removed — it would simply reappear;
 *   * `remove` **revokes** rather than deleting the row. A deleted row is indistinguishable
 *     from a device that never registered, so the removed device would re-register on its
 *     next heartbeat and come back. Revoking leaves something for it to find.
 */

import type { RecordDb } from './db';

/** How often a device says it is still here. */
export const HEARTBEAT_MS = 60_000;

export type ThisDevice = { id: string; name: string; createdAt: number };

export type RemoteDevice = {
  id: string;
  name: string;
  lastSeenAt: number | null;
  revokedAt: number | null;
};

/**
 * Reads this install's identity, generating it once if it has never existed.
 *
 * The name is the phone's own, because that is what somebody will recognise in a list of
 * two. It may be changed later; the id may not.
 */
export async function ensureThisDevice(
  db: RecordDb,
  make: { newId: () => string; deviceName: () => string; now: () => number }
): Promise<ThisDevice> {
  const existing = await db.getFirstAsync<{ id: string; name: string; created_at: string }>(
    'SELECT id, name, created_at FROM this_device LIMIT 1'
  );
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      createdAt: new Date(existing.created_at).getTime(),
    };
  }

  const device: ThisDevice = {
    id: make.newId(),
    name: make.deviceName(),
    createdAt: make.now(),
  };
  await db.runAsync(
    'INSERT INTO this_device (id, name, created_at) VALUES (?, ?, ?)',
    device.id,
    device.name,
    new Date(device.createdAt).toISOString()
  );
  return device;
}

/** Renames this device. The id is untouched, because the id is what `remove` revokes. */
export async function renameThisDevice(db: RecordDb, name: string): Promise<void> {
  await db.runAsync('UPDATE this_device SET name = ?', name);
}

/**
 * The device list the sync surface draws.
 *
 * Revoked devices are dropped and devices that have never checked in are dropped, so the
 * list only ever contains rows with something real behind them. This phone is always first
 * and is never removable from itself — that is what `stop syncing on this phone` is for.
 */
export function visibleDevices(
  remote: RemoteDevice[],
  thisDeviceId: string
): RemoteDevice[] {
  const live = remote.filter((d) => d.revokedAt === null);
  const self = live.filter((d) => d.id === thisDeviceId);
  const others = live
    .filter((d) => d.id !== thisDeviceId && d.lastSeenAt !== null)
    .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
  return [...self, ...others];
}

/**
 * Whether this device has been revoked from somewhere else.
 *
 * When it has, this phone stops sending — but it keeps everything it has. Removing a device
 * means it stops receiving, not that its record is taken away from it.
 */
export function isRevoked(remote: RemoteDevice[], thisDeviceId: string): boolean {
  const me = remote.find((d) => d.id === thisDeviceId);
  return me ? me.revokedAt !== null : false;
}
