import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { getDatabase } from '../storage/db';
import { runSerializedDb } from '../storage/runSerializedDb';
import { applyRemoteTombstoneDeletes } from '../storage/entryRepository';
import { isSyncAccessBlocked } from '../monetization/syncAccessPolicy';
import { acknowledgeRecordSync, activateRecordSyncUser, ensureIncomingSyncFragment, pendingRecordSyncIds, prepareStoredRecord } from '../record/syncStorage';
import { readRecordWire } from '../record/syncProtocol';
import { getOrInitAuth } from './firebaseAuth';
import { getOrInitFirestore } from './firebaseSync';
import { isFirebaseSyncConfigured } from './firebaseConfig';
import { publishRecordMetadata } from './recordMetadataTransport';

const digest = (value: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
let flushing = false;
export async function flushRecordMetadata(): Promise<void> {
  if (flushing || !isFirebaseSyncConfigured() || isSyncAccessBlocked()) return;
  const user = getOrInitAuth().currentUser;
  if (!user || user.isAnonymous) return;
  const current = () => getOrInitAuth().currentUser?.uid === user.uid && !isSyncAccessBlocked();
  flushing = true;
  try {
    const db = await getDatabase();
    await runSerializedDb(() => activateRecordSyncUser(db, user.uid));
    const ids = await runSerializedDb(() => pendingRecordSyncIds(db));
    for (const id of ids) {
      if (!current()) return;
      try {
        const prepared = await prepareStoredRecord(db, id, digest, undefined, runSerializedDb);
        if (!prepared || !current()) continue;
        const outcome = await publishRecordMetadata(getOrInitFirestore(), user.uid, id, prepared.wire, digest, current);
        if (!current()) return;
        if (outcome === 'removed') await applyRemoteTombstoneDeletes([id]);
        else await runSerializedDb(() => acknowledgeRecordSync(db, id, prepared.snapshot.generation));
      } catch (error) {
        await runSerializedDb(() => db.runAsync(
          `UPDATE record_sync_state SET error = ?, touched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE fragment_id = ?`,
          error instanceof Error ? error.message.slice(0, 200) : 'Record sync failed', id));
        // Keep this generation pending; failures never turn a local save into a failed capture.
      }
    }
  } finally { flushing = false; }
}
export async function ingestRecordMetadata(
  id: string, text: string, createdAt: string, value: unknown,
): Promise<boolean> {
  if (isSyncAccessBlocked()) return false;
  await readRecordWire(id, value, digest);
  const db = await getDatabase();
  const allowed = await runSerializedDb(() => ensureIncomingSyncFragment(db, id, text, createdAt));
  if (!allowed) return false;
  return (await prepareStoredRecord(db, id, digest, { wire: value, text }, runSerializedDb)) !== null;
}

