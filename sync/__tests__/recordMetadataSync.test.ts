import { openTestDb } from '../../record/__testsupport__/nodeSqliteDb';
import { migrate } from '../../record/migrate';
import { createRecordStore } from '../../record/store';
import { pendingRecordSyncIds, readSyncSnapshot } from '../../record/syncStorage';
import { getDatabase } from '../../storage/db';
import { publishRecordMetadata } from '../recordMetadataTransport';
import { flushRecordMetadata } from '../recordMetadataSync';

let mockSession = { uid: 'user', isAnonymous: false };
let mockBlocked = false;
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: () => require('node:crypto').randomUUID(),
  digestStringAsync: async (_algorithm: string, value: string) =>
    require('node:crypto').createHash('sha256').update(value).digest('hex'),
}));
jest.mock('../../storage/db', () => ({ getDatabase: jest.fn() }));
jest.mock('../../storage/entryRepository', () => ({ applyRemoteTombstoneDeletes: jest.fn() }));
jest.mock('../../monetization/syncAccessPolicy', () => ({ isSyncAccessBlocked: () => mockBlocked }));
jest.mock('../firebaseAuth', () => ({ getOrInitAuth: () => ({ currentUser: mockSession }) }));
jest.mock('../firebaseSync', () => ({ getOrInitFirestore: () => ({}) }));
jest.mock('../firebaseConfig', () => ({ isFirebaseSyncConfigured: () => true }));
jest.mock('../recordMetadataTransport', () => ({ publishRecordMetadata: jest.fn() }));
const publish = publishRecordMetadata as jest.MockedFunction<typeof publishRecordMetadata>;

beforeEach(() => {
  mockBlocked = false; mockSession.uid = 'user';
  jest.clearAllMocks(); publish.mockReset(); publish.mockResolvedValue('sent');
});
it('retains a failed send on disk and acknowledges the successful retry', async () => {
  const db = openTestDb(); await migrate(db);
  (getDatabase as jest.Mock).mockResolvedValue(db);
  try {
    await createRecordStore(db).capture({ id: 'one', body: 'local words' });
    publish.mockRejectedValueOnce(new Error('network unavailable'));
    await flushRecordMetadata();
    expect(await pendingRecordSyncIds(db)).toEqual(['one']);
    expect(await db.getFirstAsync('SELECT error FROM record_sync_state WHERE fragment_id = ?', 'one'))
      .toEqual({ error: 'network unavailable' });
    await flushRecordMetadata();
    expect(await pendingRecordSyncIds(db)).toEqual([]);
    expect(publish).toHaveBeenCalledTimes(2);
  } finally { db.close(); }
});
it('leaves an edit made during a send pending for the next generation', async () => {
  const db = openTestDb(); await migrate(db);
  const store = createRecordStore(db);
  (getDatabase as jest.Mock).mockResolvedValue(db);
  try {
    await store.capture({ id: 'one', body: 'original' });
    publish.mockImplementationOnce(async () => { await store.correct('one', 'typed while sending'); return 'sent'; });
    await flushRecordMetadata();
    expect(await pendingRecordSyncIds(db)).toEqual(['one']);
    await flushRecordMetadata();
    expect(await pendingRecordSyncIds(db)).toEqual([]);
    expect((await readSyncSnapshot(db, 'one'))!.body).toBe('typed while sending');
    expect(Object.values(publish.mock.calls[1][3].wordings).map((w) => w.body))
      .toEqual(expect.arrayContaining(['original', 'typed while sending']));
  } finally { db.close(); }
});
it('does not consume pending work after the signed-in account changes mid-send', async () => {
  const db = openTestDb(); await migrate(db);
  (getDatabase as jest.Mock).mockResolvedValue(db);
  try {
    await createRecordStore(db).capture({ id: 'one', body: 'original' });
    publish.mockImplementationOnce(async () => { mockSession = { uid: 'other', isAnonymous: false }; return 'sent'; });
    await flushRecordMetadata();
    expect(await pendingRecordSyncIds(db)).toEqual(['one']);
  } finally { db.close(); }
});
it('does not start metadata work without sync access', async () => {
  mockBlocked = true;
  await flushRecordMetadata();
  expect(getDatabase).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});
