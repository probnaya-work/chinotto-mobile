import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import type { Entry } from '../types/entry';
import { isSyncAccessBlocked } from '../monetization/syncAccessPolicy';
import {
  applyRemoteTombstoneDeletes,
  ingestRemoteFirestoreRows,
  type FirestoreIngestEntryRow,
} from '../storage/entryRepository';
import {
  applyRemoteUserThemeTombstones,
  ingestRemoteUserThemeRows,
} from '../storage/themeSyncIngest';
import { getOrInitAuth } from './firebaseAuth';
import { getOrInitFirestore } from './firebaseSync';
import { isFirebaseSyncConfigured } from './firebaseConfig';
import { isFirestoreDocumentTombstoned } from './firestoreTombstone';
import {
  parseEntryThemeField,
  partitionUserThemeDocs,
  userThemeIngestQuery,
  userThemesCollection,
  userThemeTombstoneQuery,
} from './firestoreThemeIngest';
import { flushSyncTombstoneOutbox } from './tombstoneFlush';
import { flushSyncUserThemeOutbox } from './userThemeFlush';

const INGEST_PAGE_SIZE = 500;
/** One-shot backfill pages beyond the live snapshot window (desktop → mobile history). */
const BACKFILL_MAX_PAGES = 40;
/** Tombstones are queried separately so deletes on older entries (outside the recent ingest window) still apply locally. */
const TOMBSTONE_QUERY_LIMIT = 1000;

export type FirestoreIngestRow = FirestoreIngestEntryRow;

function normalizeCreatedAt(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function partitionFirestoreSnapshotDocs(
  docs: QueryDocumentSnapshot<DocumentData>[]
): { tombstonedIds: string[]; activeRows: FirestoreIngestRow[] } {
  const tombstonedIds: string[] = [];
  const activeRows: FirestoreIngestRow[] = [];
  for (const d of docs) {
    const data = d.data();
    if (isFirestoreDocumentTombstoned(data)) {
      tombstonedIds.push(d.id);
      continue;
    }
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) {
      continue;
    }
    const createdAt = normalizeCreatedAt(data.createdAt);
    if (!createdAt) {
      continue;
    }
    const theme = parseEntryThemeField(data);
    activeRows.push({ id: d.id, text, createdAt, ...(theme !== undefined ? { theme } : {}) });
  }
  return { tombstonedIds, activeRows };
}

function tombstonedIdsFromDocs(docs: QueryDocumentSnapshot<DocumentData>[]): string[] {
  const ids: string[] = [];
  for (const d of docs) {
    if (isFirestoreDocumentTombstoned(d.data())) {
      ids.push(d.id);
    }
  }
  return ids;
}

/** A one-shot scan beyond the live 1,000-tombstone window, including old offline removals. */
export async function runFirestoreTombstoneBackfill(
  coll: CollectionReference<DocumentData>,
  onIngested: () => void,
  shouldContinue: () => boolean
): Promise<void> {
  let lastDoc: QueryDocumentSnapshot<DocumentData> | undefined;
  while (shouldContinue()) {
    const q = lastDoc
      ? query(coll, where('deletedAt', '!=', null), orderBy('deletedAt', 'desc'), startAfter(lastDoc), limit(TOMBSTONE_QUERY_LIMIT))
      : query(coll, where('deletedAt', '!=', null), orderBy('deletedAt', 'desc'), limit(TOMBSTONE_QUERY_LIMIT));
    let snap;
    try {
      snap = await getDocs(q);
    } catch (e) {
      if (__DEV__) console.error('[ChinottoSync] tombstone backfill failed', e);
      return;
    }
    if (!shouldContinue() || snap.empty) return;
    const removed = await applyRemoteTombstoneDeletes(tombstonedIdsFromDocs(snap.docs));
    if (removed > 0) onIngested();
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < TOMBSTONE_QUERY_LIMIT) return;
  }
}

/**
 * Paginates older Firestore docs (same ordering as the live listener) so history beyond the snapshot
 * `limit` still reaches SQLite. Inserts new ids; updates existing **`text`** (see `ingestRemoteFirestoreRows`); safe to overlap the first page.
 */
export async function runFirestoreIngestBackfill(
  coll: CollectionReference<DocumentData>,
  onIngested: () => void,
  shouldContinue: () => boolean
): Promise<void> {
  let lastDoc: QueryDocumentSnapshot<DocumentData> | undefined;

  for (let page = 0; page < BACKFILL_MAX_PAGES; page++) {
    if (!shouldContinue()) {
      return;
    }

    const q = lastDoc
      ? query(coll, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(INGEST_PAGE_SIZE))
      : query(coll, orderBy('createdAt', 'desc'), limit(INGEST_PAGE_SIZE));

    let snap;
    try {
      snap = await getDocs(q);
    } catch (e) {
      if (__DEV__) {
        console.error('[ChinottoSync] backfill getDocs failed', e);
      }
      return;
    }

    if (snap.empty) {
      break;
    }
    if (!shouldContinue()) return;

    const { tombstonedIds, activeRows } = partitionFirestoreSnapshotDocs(snap.docs);
    let changed = false;

    if (tombstonedIds.length > 0) {
      try {
        const removed = await applyRemoteTombstoneDeletes(tombstonedIds);
        if (removed > 0) {
          changed = true;
        }
      } catch (e) {
        if (__DEV__) {
          console.error('[ChinottoSync] backfill tombstone apply failed', e);
        }
      }
    }

    if (activeRows.length > 0) {
      try {
        const inserted = await ingestRemoteFirestoreRows(activeRows);
        if (inserted > 0) {
          changed = true;
        }
      } catch (e) {
        if (__DEV__) {
          console.error('[ChinottoSync] backfill ingest failed', e);
        }
      }
    }

    if (changed) {
      onIngested();
    }

    await flushSyncTombstoneOutbox();

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < INGEST_PAGE_SIZE) {
      break;
    }
  }
}

/**
 * Subscribe to `users/{uid}/entries`: apply remote tombstones + ingest active docs (desktop → mobile).
 * No-op when Firebase sync is not configured.
 */
export function startMobileFirestoreIngest(onIngested: () => void): () => void {
  if (!isFirebaseSyncConfigured()) {
    return () => {};
  }
  if (isSyncAccessBlocked()) {
    return () => {};
  }

  const auth = getOrInitAuth();
  let unsubIngest: (() => void) | undefined;
  let unsubTombstones: (() => void) | undefined;
  let unsubUserThemes: (() => void) | undefined;
  let unsubUserThemeTombstones: (() => void) | undefined;
  let backfillGeneration = 0;

  const detachFirestoreListeners = () => {
    unsubIngest?.();
    unsubIngest = undefined;
    unsubTombstones?.();
    unsubTombstones = undefined;
    unsubUserThemes?.();
    unsubUserThemes = undefined;
    unsubUserThemeTombstones?.();
    unsubUserThemeTombstones = undefined;
  };

  const unsubAuth = onAuthStateChanged(auth, (user) => {
    backfillGeneration += 1;
    detachFirestoreListeners();
    if (!user || user.isAnonymous) {
      return;
    }
    void flushSyncTombstoneOutbox();
    void flushSyncUserThemeOutbox();
    const db = getOrInitFirestore();
    const coll = collection(db, 'users', user.uid, 'entries');
    const userThemeColl = userThemesCollection(db, user.uid);
    const backfillGen = backfillGeneration;
    const shouldContinueBackfill = () => {
      const u = auth.currentUser;
      return Boolean(u && !u.isAnonymous && u.uid === user.uid && backfillGen === backfillGeneration);
    };

    void runFirestoreIngestBackfill(coll, onIngested, shouldContinueBackfill);
    void runFirestoreTombstoneBackfill(coll, onIngested, shouldContinueBackfill);

    const qIngest = query(coll, orderBy('createdAt', 'desc'), limit(INGEST_PAGE_SIZE));
    unsubIngest = onSnapshot(
      qIngest,
      async (snap) => {
        if (!shouldContinueBackfill()) return;
        const { tombstonedIds, activeRows } = partitionFirestoreSnapshotDocs(snap.docs);
        let changed = false;
        if (tombstonedIds.length > 0) {
          try {
            const removed = await applyRemoteTombstoneDeletes(tombstonedIds);
            if (removed > 0) {
              changed = true;
            }
          } catch (e) {
            if (__DEV__) {
              console.error('[ChinottoSync] tombstone apply failed', e);
            }
          }
        }
        if (activeRows.length > 0) {
          try {
            const inserted = await ingestRemoteFirestoreRows(activeRows);
            if (inserted > 0) {
              changed = true;
            }
          } catch (e) {
            if (__DEV__) {
              console.error('[ChinottoSync] ingest failed', e);
            }
          }
        }
        if (changed) {
          onIngested();
        }
        await flushSyncTombstoneOutbox();
        await flushSyncUserThemeOutbox();
      },
      (err) => {
        if (__DEV__) {
          console.error('[ChinottoSync] ingest snapshot error', err);
        }
      }
    );

    void getDocs(userThemeIngestQuery(userThemeColl)).then(async (snap) => {
      const { tombstonedIds, activeRows } = partitionUserThemeDocs(snap.docs);
      let changed = false;
      if (tombstonedIds.length > 0) {
        const removed = await applyRemoteUserThemeTombstones(tombstonedIds);
        if (removed > 0) {
          changed = true;
        }
      }
      if (activeRows.length > 0) {
        const applied = await ingestRemoteUserThemeRows(activeRows);
        if (applied > 0) {
          changed = true;
        }
      }
      if (changed) {
        onIngested();
      }
    });

    unsubUserThemes = onSnapshot(
      userThemeIngestQuery(userThemeColl),
      async (snap) => {
        const { tombstonedIds, activeRows } = partitionUserThemeDocs(snap.docs);
        let changed = false;
        if (tombstonedIds.length > 0) {
          const removed = await applyRemoteUserThemeTombstones(tombstonedIds);
          if (removed > 0) {
            changed = true;
          }
        }
        if (activeRows.length > 0) {
          const applied = await ingestRemoteUserThemeRows(activeRows);
          if (applied > 0) {
            changed = true;
          }
        }
        if (changed) {
          onIngested();
        }
      },
      (err) => {
        if (__DEV__) {
          console.error('[ChinottoSync] user theme ingest error', err);
        }
      }
    );

    unsubUserThemeTombstones = onSnapshot(
      userThemeTombstoneQuery(userThemeColl),
      async (snap) => {
        const ids = snap.docs.map((d) => d.id);
        const removed = await applyRemoteUserThemeTombstones(ids);
        if (removed > 0) {
          onIngested();
        }
      },
      (err) => {
        if (__DEV__) {
          console.error('[ChinottoSync] user theme tombstone error', err);
        }
      }
    );

    // `!= null` is ordered ascending by default; with `limit` that returns the *oldest* tombstones,
    // so new deletes never appear. Newest first so recent `deletedAt` is always in window.
    const qTombstones = query(
      coll,
      where('deletedAt', '!=', null),
      orderBy('deletedAt', 'desc'),
      limit(TOMBSTONE_QUERY_LIMIT)
    );
    unsubTombstones = onSnapshot(
      qTombstones,
      async (snap) => {
        if (!shouldContinueBackfill()) return;
        const ids = tombstonedIdsFromDocs(snap.docs);
        try {
          const removed = await applyRemoteTombstoneDeletes(ids);
          if (removed > 0) {
            onIngested();
          }
        } catch (e) {
          if (__DEV__) {
            console.error('[ChinottoSync] tombstone apply failed', e);
          }
        }
        await flushSyncTombstoneOutbox();
      },
      (err) => {
        if (__DEV__) {
          console.error('[ChinottoSync] tombstone snapshot error', err);
        }
      }
    );
  });

  return () => {
    backfillGeneration += 1;
    detachFirestoreListeners();
    unsubAuth();
  };
}
