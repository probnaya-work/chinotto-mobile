/**
 * The devices on a record, in the cloud.
 *
 * `users/{uid}/devices/{deviceId}`, beside `users/{uid}/entries` — additive, so a desktop
 * that knows nothing about it is unaffected and a desktop that later learns about it finds
 * the rows already there.
 *
 * Three things this refuses to do, because the surface above it promises it will not:
 *
 *   * **invent a last seen.** `lastSeenAt` is a server timestamp written by the device
 *     itself. A device that has never checked in has `null`, and the list drops it rather
 *     than guessing when it was last around;
 *   * **invent an online state.** Nothing here reports one, because a heartbeat a minute
 *     apart cannot tell "here" from "was here fifty seconds ago";
 *   * **delete on remove.** Removing writes `revokedAt`. A deleted row is indistinguishable
 *     from a device that never registered, so the removed device would re-register on its
 *     next heartbeat and quietly come back. Revoking leaves it something to find.
 *
 * ## What revocation is, and is not
 *
 * A revoked device reads its own row, stops sending, and says so. That is real — it is the
 * device that stops, and it stops for good, because the row stays revoked.
 *
 * It is **not** a security boundary. Firestore's rules still allow any signed-in client to
 * write its own user's entries, so enforcement is by agreement, not by the server. Making it
 * one means changing the deployed security rules to check the caller's device row, which is
 * a backend deployment and not something this app can do to itself. Written down in
 * `docs/unspecified-decisions.md` rather than implied away.
 */

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';

import type { RemoteDevice } from '../record/devices';
import { getOrInitAuth } from './firebaseAuth';
import { isFirebaseSyncConfigured } from './firebaseConfig';
import { getOrInitFirestore } from './firebaseSync';

/** The signed-in, non-anonymous uid, or null when there is nobody to attribute devices to. */
function currentUid(): string | null {
  if (!isFirebaseSyncConfigured()) return null;
  const user = getOrInitAuth().currentUser;
  if (!user || user.isAnonymous) return null;
  return user.uid;
}

function millis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const t = (value as { toMillis: () => number }).toMillis;
    if (typeof t === 'function') return (value as Timestamp).toMillis();
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

/**
 * Says this device is here, and keeps saying it.
 *
 * `merge`, so a heartbeat never clears a `revokedAt` written from somewhere else — a device
 * cannot un-revoke itself by carrying on.
 */
export async function announceThisDevice(device: {
  id: string;
  name: string;
  platform: string;
}): Promise<void> {
  const uid = currentUid();
  if (!uid) return;
  try {
    await setDoc(
      doc(getOrInitFirestore(), 'users', uid, 'devices', device.id),
      {
        name: device.name,
        platform: device.platform,
        lastSeenAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // A heartbeat that did not land is not worth interrupting anybody about. The next one
    // will, and until then the list simply shows an older `last seen`, which is true.
  }
}

/**
 * Every device on this record, as the cloud has it.
 *
 * `null` means it could not be read — not signed in, not configured, or the read failed —
 * which the surface draws as nothing at all rather than as an empty record.
 */
export async function listCloudDevices(): Promise<RemoteDevice[] | null> {
  const uid = currentUid();
  if (!uid) return null;
  try {
    const snapshot = await getDocs(collection(getOrInitFirestore(), 'users', uid, 'devices'));
    return snapshot.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        name: typeof data.name === 'string' && data.name.trim() ? data.name : 'a device',
        lastSeenAt: millis(data.lastSeenAt),
        revokedAt: millis(data.revokedAt),
      };
    });
  } catch {
    return null;
  }
}

/**
 * Removes a device from the record.
 *
 * Returns false when it did not happen, so the surface can say so instead of removing a row
 * from a list and leaving the device syncing.
 */
export async function revokeCloudDevice(deviceId: string): Promise<boolean> {
  const uid = currentUid();
  if (!uid) return false;
  try {
    await setDoc(
      doc(getOrInitFirestore(), 'users', uid, 'devices', deviceId),
      { revokedAt: serverTimestamp() },
      { merge: true }
    );
    return true;
  } catch {
    return false;
  }
}
