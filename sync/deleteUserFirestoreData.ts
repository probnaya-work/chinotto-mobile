import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';

import { getOrInitFirestore } from './firebaseSync';

const BATCH_MAX = 450;

async function commitDeleteRefs(db: Firestore, refs: DocumentReference[]): Promise<void> {
  if (refs.length === 0) {
    return;
  }
  const batch = writeBatch(db);
  for (const r of refs) {
    batch.delete(r);
  }
  await batch.commit();
}

async function deleteSubcollection(db: Firestore, collPath: string[]): Promise<void> {
  const coll = collection(db, ...(collPath as [string, ...string[]]));
  for (;;) {
    const snap = await getDocs(query(coll, limit(BATCH_MAX)));
    if (snap.empty) {
      break;
    }
    await commitDeleteRefs(
      db,
      snap.docs.map((d) => d.ref)
    );
    if (snap.size < BATCH_MAX) {
      break;
    }
  }
}

/**
 * Deletes `users/{uid}/entries/*`, `users/{uid}/user_themes/*`, `users/{uid}/devices/*`
 * (see `firestoreDevices.ts` — device rows carry a user-chosen device name), then
 * `users/{uid}`. Idempotent: missing docs are skipped when traversing snapshots.
 */
export async function deleteAllFirestoreDataForUid(uid: string): Promise<void> {
  const db = getOrInitFirestore();
  await deleteSubcollection(db, ['users', uid, 'entries']);
  await deleteSubcollection(db, ['users', uid, 'user_themes']);
  await deleteSubcollection(db, ['users', uid, 'devices']);
  await deleteDoc(doc(db, 'users', uid));
}
