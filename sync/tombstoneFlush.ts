import { isSyncAccessBlocked } from '../monetization/syncAccessPolicy';
import { getOrInitAuth } from './firebaseAuth';
import { firebaseApplyTombstoneEntry } from './firebaseSync';
import { isFirebaseSyncConfigured } from './firebaseConfig';
import { listSyncTombstoneOutbox, removeSyncTombstoneOutbox } from './tombstoneOutbox';

/**
 * Flush durable tombstone outbox to Firestore (Phase 2). Best-effort; failures leave rows pending.
 */
export async function flushSyncTombstoneOutbox(): Promise<void> {
  if (isSyncAccessBlocked()) {
    return;
  }
  if (!isFirebaseSyncConfigured()) {
    return;
  }
  const auth = getOrInitAuth();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    return;
  }
  const ids = await listSyncTombstoneOutbox();
  for (const entryId of ids) {
    try {
      await firebaseApplyTombstoneEntry(entryId);
      await removeSyncTombstoneOutbox(entryId);
      // Keep the content-free id: an older active snapshot can arrive after this ack.
    } catch (e: unknown) {
      if (__DEV__) {
        console.warn('[ChinottoSync] tombstone flush failed, will retry', entryId, e);
      }
    }
  }
}
