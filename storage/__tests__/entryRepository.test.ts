import { randomUUID } from 'expo-crypto';

import * as firebaseConfig from '../../sync/firebaseConfig';
import { getDatabase } from '../db';
import * as ingestSuppression from '../../sync/ingestSuppression';
import { insertPendingSyncItem, removePendingSyncItemsForEntry } from '../../sync/syncQueue';
import * as tombstoneOutbox from '../../sync/tombstoneOutbox';
import {
  applyRemoteTombstoneDeletes,
  deleteEntry,
  getAllEntries,
  getEntryById,
  getEntryCount,
  getEntriesOlderThan,
  getMonthSummaries,
  getNewestEntryInMonth,
  getRecentEntries,
  saveEntry,
  updateEntryText,
  searchEntriesByText,
  searchEntriesForRecall,
} from '../entryRepository';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

jest.mock('../db', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../../sync/firebaseConfig', () => ({
  isFirebaseSyncConfigured: jest.fn(() => false),
}));

jest.mock('../../sync/syncQueue', () => ({
  insertPendingSyncItem: jest.fn().mockResolvedValue(undefined),
  removePendingSyncItemsForEntry: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../sync/tombstoneOutbox', () => ({
  enqueueSyncTombstoneWithDb: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../sync/ingestSuppression', () => ({
  addFirestoreIngestSuppressionWithDb: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../themeRepository', () => ({
  classifyEntryThemeForEntry: jest.fn().mockResolvedValue(undefined),
}));

const mockGetDatabase = jest.mocked(getDatabase);
const mockRandomUUID = jest.mocked(randomUUID);
const mockInsertPendingSyncItem = jest.mocked(insertPendingSyncItem);
const mockRemovePending = jest.mocked(removePendingSyncItemsForEntry);
const mockEnqueueTombstone = jest.mocked(tombstoneOutbox.enqueueSyncTombstoneWithDb);
const mockAddSuppression = jest.mocked(ingestSuppression.addFirestoreIngestSuppressionWithDb);
const mockIsFirebaseConfigured = jest.mocked(firebaseConfig.isFirebaseSyncConfigured);

describe('entryRepository', () => {
  const runAsync = jest.fn();
  const getAllAsync = jest.fn();
  const getFirstAsync = jest.fn();
  const withTransactionAsync = jest.fn(async (task: () => Promise<void>) => {
    await task();
  });
  const dbHandle = {
    runAsync,
    getAllAsync,
    getFirstAsync,
    withTransactionAsync,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRandomUUID.mockReturnValue('00000000-0000-4000-8000-000000000001');
    withTransactionAsync.mockImplementation(async (task: () => Promise<void>) => {
      await task();
    });
    mockGetDatabase.mockResolvedValue(dbHandle as never);
    runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
    getAllAsync.mockResolvedValue([]);
    getFirstAsync.mockReset();
    mockInsertPendingSyncItem.mockResolvedValue(undefined);
    mockRemovePending.mockClear();
    mockEnqueueTombstone.mockClear();
    mockAddSuppression.mockClear();
    mockIsFirebaseConfigured.mockReturnValue(false);
  });

  describe('saveEntry', () => {
    it('trims text, commits entry + queue in one transaction, then returns Entry', async () => {
      const entry = await saveEntry('  hello  ');

      expect(entry.id).toBe('00000000-0000-4000-8000-000000000001');
      expect(entry.text).toBe('hello');
      expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      expect(withTransactionAsync).toHaveBeenCalledTimes(1);

      expect(runAsync).toHaveBeenCalledWith(
        'INSERT INTO entries (id, text, created_at) VALUES (?, ?, ?)',
        entry.id,
        'hello',
        entry.createdAt
      );

      expect(mockInsertPendingSyncItem).toHaveBeenCalledWith(dbHandle, entry);
      expect(mockInsertPendingSyncItem).toHaveBeenCalledTimes(1);
    });

    it('rejects and does not resolve success if queue insert fails', async () => {
      mockInsertPendingSyncItem.mockRejectedValueOnce(new Error('queue write failed'));

      await expect(saveEntry('hello')).rejects.toThrow('queue write failed');

      expect(withTransactionAsync).toHaveBeenCalledTimes(1);
      expect(runAsync).toHaveBeenCalled();
      expect(mockInsertPendingSyncItem).toHaveBeenCalled();
    });

    it('persists entry row before queue row inside the transaction', async () => {
      const order: string[] = [];
      runAsync.mockImplementation(async () => {
        order.push('entries');
        return { changes: 1, lastInsertRowId: 0 };
      });
      mockInsertPendingSyncItem.mockImplementation(async () => {
        order.push('queue');
      });

      await saveEntry('a');

      expect(order).toEqual(['entries', 'queue']);
    });

    it('rejects empty or whitespace-only input', async () => {
      await expect(saveEntry('')).rejects.toThrow('Cannot save empty entry');
      await expect(saveEntry('   \t  ')).rejects.toThrow('Cannot save empty entry');
      expect(withTransactionAsync).not.toHaveBeenCalled();
      expect(runAsync).not.toHaveBeenCalled();
      expect(mockInsertPendingSyncItem).not.toHaveBeenCalled();
    });
  });

  describe('updateEntryText', () => {
    it('updates text, re-enqueues sync, preserves createdAt', async () => {
      getFirstAsync.mockResolvedValueOnce({
        id: 'e1',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      runAsync.mockResolvedValueOnce({ changes: 1, lastInsertRowId: 0 });

      const updated = await updateEntryText('e1', '  continued  ');

      expect(updated).toEqual({
        id: 'e1',
        text: 'continued',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
      expect(runAsync).toHaveBeenCalledWith(
        'UPDATE entries SET text = ? WHERE id = ?',
        'continued',
        'e1'
      );
      expect(mockRemovePending).toHaveBeenCalledWith(dbHandle, 'e1');
      expect(mockInsertPendingSyncItem).toHaveBeenCalledWith(dbHandle, updated);
    });

    it('rejects empty text and missing entries', async () => {
      await expect(updateEntryText('e1', '   ')).rejects.toThrow('Cannot save empty entry');

      getFirstAsync.mockResolvedValueOnce(null);
      await expect(updateEntryText('missing', 'hello')).rejects.toThrow('Entry not found');
    });
  });

  describe('getEntryCount', () => {
    it('returns total row count', async () => {
      getFirstAsync.mockResolvedValueOnce({ n: 42 });

      const n = await getEntryCount();

      expect(n).toBe(42);
      expect(getFirstAsync).toHaveBeenCalledWith('SELECT COUNT(*) AS n FROM entries');
    });
  });

  describe('getRecentEntries', () => {
    it('queries with limit, stable order (created_at desc, id desc)', async () => {
      getAllAsync.mockResolvedValueOnce([
        { id: 'a', text: 't', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);

      const rows = await getRecentEntries(10);

      expect(getAllAsync).toHaveBeenCalledWith(
        expect.stringMatching(/ORDER BY created_at DESC,\s*id DESC/s),
        10
      );
      expect(rows[0]).toEqual({
        id: 'a',
        text: 't',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
    });
  });

  describe('getEntryById', () => {
    it('returns row by id when present', async () => {
      getFirstAsync.mockResolvedValueOnce({
        id: 'e1',
        text: 'hello',
        createdAt: '2025-01-01T00:00:00.000Z',
      });

      const row = await getEntryById('e1');

      expect(getFirstAsync).toHaveBeenCalledWith(
        expect.stringMatching(/WHERE id = \?/),
        'e1'
      );
      expect(row?.id).toBe('e1');
    });
  });

  describe('getMonthSummaries', () => {
    it('aggregates by local calendar month and resolves newest entry id', async () => {
      getAllAsync.mockResolvedValueOnce([
        {
          monthKey: '2026-05',
          count: 2,
          newestCreatedAt: '2026-05-20T12:00:00.000Z',
        },
      ]);
      getFirstAsync.mockResolvedValueOnce({
        id: 'newest-may',
        text: 't',
        createdAt: '2026-05-20T12:00:00.000Z',
      });

      const summaries = await getMonthSummaries();

      expect(getAllAsync).toHaveBeenCalledWith(
        expect.stringMatching(/strftime\('%Y-%m', datetime\(created_at\), 'localtime'\)/),
      );
      expect(summaries).toEqual([
        {
          monthKey: '2026-05',
          count: 2,
          newestCreatedAt: '2026-05-20T12:00:00.000Z',
          newestEntryId: 'newest-may',
        },
      ]);
    });

    it('returns empty array when no rows', async () => {
      getAllAsync.mockResolvedValueOnce([]);
      await expect(getMonthSummaries()).resolves.toEqual([]);
      expect(getFirstAsync).not.toHaveBeenCalled();
    });
  });

  describe('getNewestEntryInMonth', () => {
    it('queries newest in month with stable order', async () => {
      getFirstAsync.mockResolvedValueOnce({
        id: 'e1',
        text: 't',
        createdAt: '2026-04-01T00:00:00.000Z',
      });

      const row = await getNewestEntryInMonth('2026-04');

      expect(getFirstAsync).toHaveBeenCalledWith(
        expect.stringMatching(/strftime\('%Y-%m', datetime\(created_at\), 'localtime'\) = \?/),
        '2026-04',
      );
      expect(row?.id).toBe('e1');
    });
  });

  describe('getEntriesOlderThan', () => {
    it('pages after cursor with tie-break on id', async () => {
      getAllAsync.mockResolvedValueOnce([]);

      await getEntriesOlderThan(
        { createdAt: '2025-01-02T12:00:00.000Z', id: 'cursor-id' },
        15
      );

      expect(getAllAsync).toHaveBeenCalledWith(
        expect.stringMatching(
          /WHERE created_at < \? OR \(created_at = \? AND id < \?\).*ORDER BY created_at DESC,\s*id DESC/s
        ),
        '2025-01-02T12:00:00.000Z',
        '2025-01-02T12:00:00.000Z',
        'cursor-id',
        15
      );
    });
  });

  describe('searchEntriesByText', () => {
    it('returns [] for empty or whitespace without querying', async () => {
      await expect(searchEntriesByText('')).resolves.toEqual([]);
      await expect(searchEntriesByText('   \t')).resolves.toEqual([]);
      expect(getAllAsync).not.toHaveBeenCalled();
    });

    it('matches with instr(lower) and requests limit+1 for truncation detection', async () => {
      getAllAsync.mockResolvedValueOnce([
        { id: 'a', text: 'hello world', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);

      const rows = await searchEntriesByText('World', 50);

      expect(getAllAsync).toHaveBeenCalledWith(
        expect.stringMatching(/instr\(lower\(text\),\s*lower\(\?\)\)/i),
        'World',
        51
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('searchEntriesForRecall', () => {
    it('sets truncated when more than limit rows exist', async () => {
      getAllAsync.mockResolvedValueOnce([
        { id: '1', text: 'a', createdAt: '2025-01-01T00:00:00.000Z' },
        { id: '2', text: 'b', createdAt: '2025-01-02T00:00:00.000Z' },
      ]);

      const r = await searchEntriesForRecall('x', 1);

      expect(r.entries).toHaveLength(1);
      expect(r.entries[0].id).toBe('1');
      expect(r.truncated).toBe(true);
    });

    it('truncated false when at or under limit', async () => {
      getAllAsync.mockResolvedValueOnce([{ id: '1', text: 'a', createdAt: '2025-01-01T00:00:00.000Z' }]);

      const r = await searchEntriesForRecall('x', 5);

      expect(r.entries).toHaveLength(1);
      expect(r.truncated).toBe(false);
    });
  });

  describe('getAllEntries', () => {
    it('returns ordered rows', async () => {
      getAllAsync.mockResolvedValueOnce([]);

      await getAllEntries();

      expect(getAllAsync).toHaveBeenCalledWith(
        expect.stringMatching(/ORDER BY created_at DESC,\s*id DESC/)
      );
    });
  });

  describe('deleteEntry', () => {
    it('rejects when entry id is missing', async () => {
      getFirstAsync.mockResolvedValueOnce(undefined);

      await expect(deleteEntry('missing')).rejects.toThrow('Entry not found');
      expect(withTransactionAsync).toHaveBeenCalled();
    });

    it('deletes locally and drops pending push rows; skips tombstone when sync not configured', async () => {
      getFirstAsync.mockResolvedValueOnce({ id: 'e1' });

      await deleteEntry('e1');

      expect(runAsync).toHaveBeenCalledWith('DELETE FROM entries WHERE id = ?', 'e1');
      expect(mockRemovePending).toHaveBeenCalledWith(dbHandle, 'e1');
      expect(mockAddSuppression).not.toHaveBeenCalled();
      expect(mockEnqueueTombstone).not.toHaveBeenCalled();
    });

    it('adds suppression and tombstone outbox when Firebase sync is configured', async () => {
      mockIsFirebaseConfigured.mockReturnValue(true);
      getFirstAsync.mockResolvedValueOnce({ id: 'e1' });

      await deleteEntry('e1');

      expect(mockAddSuppression).toHaveBeenCalledWith(dbHandle, 'e1');
      expect(mockEnqueueTombstone).toHaveBeenCalledWith(dbHandle, 'e1');
    });
  });

  describe('applyRemoteTombstoneDeletes', () => {
    it('returns 0 for empty ids without opening a transaction', async () => {
      const n = await applyRemoteTombstoneDeletes([]);
      expect(n).toBe(0);
      expect(withTransactionAsync).not.toHaveBeenCalled();
    });

    it('runs queue cleanup, entries and suppression in one transaction while preserving the outbox', async () => {
      runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 0 });

      const n = await applyRemoteTombstoneDeletes(['a', 'b']);

      expect(withTransactionAsync).toHaveBeenCalledTimes(1);
      expect(mockRemovePending).toHaveBeenCalledWith(dbHandle, 'a');
      expect(mockRemovePending).toHaveBeenCalledWith(dbHandle, 'b');
      expect(runAsync).not.toHaveBeenCalledWith('DELETE FROM sync_tombstone_outbox WHERE entry_id = ?', 'a');
      expect(runAsync).toHaveBeenCalledWith('DELETE FROM entries WHERE id = ?', 'a');
      expect(runAsync).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO firestore_ingest_suppressed_ids (id, suppressed_at) VALUES (?, ?)',
        'a', expect.any(String)
      );
      expect(n).toBe(2);
    });
  });
});
