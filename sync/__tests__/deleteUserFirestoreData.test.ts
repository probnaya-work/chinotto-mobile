type MockRef = { path: string };
type MockCollRef = { path: string };

const collectionsData: Record<string, MockRef[]> = {};
const calls: string[] = [];

jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  query: (coll: MockCollRef) => coll,
  limit: (n: number) => ({ __limit: n }),
  getDocs: async (coll: MockCollRef) => {
    calls.push(`getDocs:${coll.path}`);
    const docs = collectionsData[coll.path] ?? [];
    return { empty: docs.length === 0, size: docs.length, docs: docs.map((d) => ({ ref: d })) };
  },
  writeBatch: (_db: unknown) => {
    const refs: MockRef[] = [];
    return {
      delete: (ref: MockRef) => refs.push(ref),
      commit: async () => {
        for (const r of refs) calls.push(`batchDelete:${r.path}`);
      },
    };
  },
  deleteDoc: async (ref: MockRef) => {
    calls.push(`deleteDoc:${ref.path}`);
  },
}));

jest.mock('../firebaseSync', () => ({
  getOrInitFirestore: () => ({}),
}));

import { deleteAllFirestoreDataForUid } from '../deleteUserFirestoreData';

describe('deleteAllFirestoreDataForUid', () => {
  beforeEach(() => {
    calls.length = 0;
    for (const key of Object.keys(collectionsData)) delete collectionsData[key];
    collectionsData['users/uid1/entries'] = [{ path: 'users/uid1/entries/e1' }];
    collectionsData['users/uid1/user_themes'] = [{ path: 'users/uid1/user_themes/t1' }];
    collectionsData['users/uid1/devices'] = [{ path: 'users/uid1/devices/d1' }];
  });

  it('deletes every known user-owned subcollection before the parent account doc', async () => {
    await deleteAllFirestoreDataForUid('uid1');

    const subcollectionDocs = [
      'users/uid1/entries/e1',
      'users/uid1/user_themes/t1',
      'users/uid1/devices/d1',
    ];
    const parentDeleteIndex = calls.indexOf('deleteDoc:users/uid1');
    expect(parentDeleteIndex).toBeGreaterThan(-1);

    for (const subPath of subcollectionDocs) {
      const subDeleteIndex = calls.indexOf(`batchDelete:${subPath}`);
      expect(subDeleteIndex).toBeGreaterThan(-1);
      expect(subDeleteIndex).toBeLessThan(parentDeleteIndex);
    }
  });

  it('deletes the devices subcollection specifically (regression: previously left orphaned)', async () => {
    await deleteAllFirestoreDataForUid('uid1');
    expect(calls).toContain('batchDelete:users/uid1/devices/d1');
  });

  it('is idempotent when a subcollection is already empty', async () => {
    collectionsData['users/uid1/entries'] = [];
    collectionsData['users/uid1/user_themes'] = [];
    collectionsData['users/uid1/devices'] = [];

    await expect(deleteAllFirestoreDataForUid('uid1')).resolves.toBeUndefined();
    expect(calls).toContain('deleteDoc:users/uid1');
  });
});
