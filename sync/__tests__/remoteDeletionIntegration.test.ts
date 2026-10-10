import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getDocs } from 'firebase/firestore';
import { getDatabase } from '../../storage/db';
import { openTestDb } from '../../record/__testsupport__/nodeSqliteDb';
import { migrate } from '../../record/migrate';
import { createBridge } from '../../record/bridge';
import { createRecordStore } from '../../record/store';
import { runFirestoreIngestBackfill, runFirestoreTombstoneBackfill } from '../firestoreIngest';

jest.mock('firebase/firestore', () => ({
  getDocs: jest.fn(),
  query: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  startAfter: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  collection: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  onSnapshot: jest.fn(),
}));
jest.mock('../../storage/db', () => ({ getDatabase: jest.fn() }));
jest.mock('../tombstoneFlush', () => ({ flushSyncTombstoneOutbox: jest.fn(async () => {}) }));

const getDocsMock = jest.mocked(getDocs);
const dbMock = jest.mocked(getDatabase);
const AT = '2026-09-19T17:10:00.000Z';
beforeEach(() => { getDocsMock.mockReset(); dbMock.mockReset(); });

function snapshot(id: string, data: Record<string, unknown>) {
  return { empty: false, docs: [{ id, data: () => data }] };
}

async function deliver(id: string, data: Record<string, unknown>, onIngested: () => void) {
  getDocsMock.mockResolvedValueOnce(snapshot(id, data) as never);
  await runFirestoreIngestBackfill({} as never, onIngested, () => true);
}

it('carries capture and deletion through the production backfill route, including offline restart and replay', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chinotto-delete-'));
  const file = join(dir, 'device-b.sqlite');
  const a = openTestDb();
  let b = openTestDb(file);
  try {
    await migrate(a);
    await migrate(b);
    dbMock.mockResolvedValue(b as never);
    let clock = Date.parse(AT);
    const storeA = createRecordStore(a, { newId: () => 'shared', now: () => clock });
    const bridgeA = createBridge(a, { now: () => clock });
    const storeB = createRecordStore(b, { newId: () => 'unused' });
    let bridgeB = createBridge(b);

    const captured = await storeA.capture({ id: 'shared', body: 'private words', at: Date.parse(AT) });
    await bridgeA.mirrorFragment(captured.id);
    await deliver(captured.id, { text: 'private words', createdAt: AT }, () => {});
    expect(await bridgeB.projectCatchUp()).toEqual({ created: 1, conflicts: 0 });
    expect((await storeB.loadRecord()).map((moment) => moment.id)).toContain('shared');

    // B is offline. A publishes only after its undo window; B learns the tombstone later.
    await storeA.remove('shared');
    clock += 9000;
    expect(await bridgeA.publishDueRemovals(await storeA.dueRemovals())).toBe(1);
    await deliver('shared', { text: 'private words', createdAt: AT, deletedAt: AT }, () => {});
    expect((await storeB.loadRecord()).map((moment) => moment.id)).not.toContain('shared');
    expect((await storeB.getFragment('shared'))?.body).toBe('');
    expect(await b.getFirstAsync('SELECT id FROM firestore_ingest_suppressed_ids WHERE id = ?', 'shared')).not.toBeNull();
    expect(await b.getFirstAsync('SELECT id FROM entries WHERE id = ?', 'shared')).toBeNull();
    expect(await b.getFirstAsync('SELECT entry_id FROM sync_tombstone_outbox WHERE entry_id = ?', 'shared')).toBeNull();

    b.close();
    b = openTestDb(file);
    dbMock.mockResolvedValue(b as never);
    bridgeB = createBridge(b);
    const restarted = createRecordStore(b, { newId: () => 'unused' });
    expect((await restarted.loadRecord()).map((moment) => moment.id)).not.toContain('shared');
    await deliver('shared', { text: 'private words', createdAt: AT, deletedAt: AT }, () => {});
    await deliver('shared', { text: 'stale active row', createdAt: AT }, () => {});
    expect(await bridgeB.projectCatchUp()).toEqual({ created: 0, conflicts: 0 });
    expect(await bridgeB.mirrorCatchUp()).toBe(0);
    expect((await restarted.loadRecord()).map((moment) => moment.id)).not.toContain('shared');
  } finally {
    a.close();
    b.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('reaches tombstones older than the live listener window', async () => {
  const db = openTestDb();
  try {
    await migrate(db);
    dbMock.mockResolvedValue(db as never);
    const store = createRecordStore(db, { newId: () => 'old' });
    await store.capture({ id: 'old', body: 'remove this' });
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({
      id: `newer-${i}`, data: () => ({ deletedAt: AT }),
    }));
    getDocsMock.mockResolvedValueOnce({ empty: false, docs: firstPage } as never);
    getDocsMock.mockResolvedValueOnce(snapshot('old', { deletedAt: AT }) as never);
    await runFirestoreTombstoneBackfill({} as never, () => {}, () => true);
    expect(getDocsMock).toHaveBeenCalledTimes(2);
    expect((await store.loadRecord()).map((m) => m.id)).not.toContain('old');
  } finally {
    db.close();
  }
});
