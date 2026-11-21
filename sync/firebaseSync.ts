import {
  doc,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

import type { Entry } from '../types/entry';
import type { EntryTheme } from '../types/entryTheme';
import { toFirestoreEntryThemeWire } from '../types/firestoreSyncTheme';
import { isFirebaseSyncConfigured } from './firebaseConfig';
import { getOrInitApp } from './firebaseApp';
import { getOrInitAuth } from './firebaseAuth';

export { getOrInitApp } from './firebaseApp';

let firestoreSingleton: Firestore | null = null;

/**
 * Prefer in-memory cache (RN-friendly). If Firestore was already initialized for this app (parallel
 * callers, Fast Refresh, or a prior session), fall back to {@link getFirestore} instead of throwing
 * `initializeFirestore() has already been called with different options`.
 */
export function getOrInitFirestore(): Firestore {
  if (firestoreSingleton) {
    return firestoreSingleton;
  }
  const app = getOrInitApp();
  try {
    firestoreSingleton = initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('already been called')) {
      firestoreSingleton = getFirestore(app);
    } else {
      throw e;
    }
  }
  return firestoreSingleton;
}

/**
 * Idempotent Firestore upsert: `users/{uid}/entries/{entry.id}` with merge.
 * Sends `text`, `createdAt`, `updatedAt`; an active upsert never clears a remote removal.
 * Requires a signed-in Firebase user (Sign in with Apple for stable sync). Queue stays pending until then.
 * Retries are safe if remote dedupes by document id (see docs/internal/sync/sync.md).
 */
export async function firebasePushEntry(entry: Entry, theme?: EntryTheme | null): Promise<void> {
  if (!isFirebaseSyncConfigured()) {
    throw new Error('Firebase sync is not configured');
  }
  const auth = getOrInitAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Firebase Auth has no user');
  }
  if (user.isAnonymous) {
    throw new Error('Enable sync with Apple to upload entries');
  }
  const uid = user.uid;
  const db = getOrInitFirestore();
  const ref = doc(db, 'users', uid, 'entries', entry.id);
  const themePayload =
    theme != null ? { theme: toFirestoreEntryThemeWire(theme) } : { theme: null };
  await setDoc(
    ref,
    {
      text: entry.text,
      createdAt: entry.createdAt,
      updatedAt: serverTimestamp(),
      ...themePayload,
    },
    { merge: true }
  );
}

/**
 * Phase 2: tombstone on Firestore. Uses `setDoc` + merge so the write succeeds whether or not the
 * doc exists yet (`updateDoc` fails with not-found on missing docs). Idempotent with merge.
 */
export async function firebaseApplyTombstoneEntry(entryId: string): Promise<void> {
  if (!isFirebaseSyncConfigured()) {
    throw new Error('Firebase sync is not configured');
  }
  const auth = getOrInitAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Firebase Auth has no user');
  }
  if (user.isAnonymous) {
    throw new Error('Enable sync with Apple to sync deletes');
  }
  const uid = user.uid;
  const db = getOrInitFirestore();
  const ref = doc(db, 'users', uid, 'entries', entryId);
  await setDoc(ref, { deletedAt: serverTimestamp() }, { merge: true });
}
