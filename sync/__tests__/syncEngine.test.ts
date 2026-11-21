import type { Entry } from '../../types/entry';
import { isSyncAccessBlocked } from '../../monetization/syncAccessPolicy';
import { getPendingSyncItems, markSynced } from '../syncQueue';
import { processSyncQueue, startBackgroundSync } from '../syncEngine';

jest.mock('../../monetization/syncAccessPolicy', () => ({
  isSyncAccessBlocked: jest.fn(() => false),
}));

jest.mock('../tombstoneFlush', () => ({
  flushSyncTombstoneOutbox: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../userThemeFlush', () => ({
  flushSyncUserThemeOutbox: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../recordMetadataSync', () => ({
  flushRecordMetadata: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../syncQueue', () => ({
  getPendingSyncItems: jest.fn(),
  markSynced: jest.fn(),
}));

const mockGetPending = jest.mocked(getPendingSyncItems);
const mockMarkSynced = jest.mocked(markSynced);
const mockSyncBlocked = jest.mocked(isSyncAccessBlocked);

describe('syncEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkSynced.mockResolvedValue(undefined);
    mockSyncBlocked.mockReturnValue(false);
  });

  describe('processSyncQueue', () => {
    it('marks items synced after successful push', async () => {
      const entry: Entry = { id: 'e1', text: 'a', createdAt: '2025-01-01T00:00:00.000Z' };
      mockGetPending.mockResolvedValueOnce([{ id: 'q1', payload: entry, status: 'pending' }]);

      const push = jest.fn().mockResolvedValue(undefined);
      await processSyncQueue(push);

      expect(push).toHaveBeenCalledWith(entry);
      expect(mockMarkSynced).toHaveBeenCalledWith('q1');
    });

    it('does not mark synced when push fails (retry later)', async () => {
      const entry: Entry = { id: 'e1', text: 'a', createdAt: '2025-01-01T00:00:00.000Z' };
      mockGetPending.mockResolvedValueOnce([{ id: 'q1', payload: entry, status: 'pending' }]);

      const push = jest.fn().mockRejectedValue(new Error('network'));
      await processSyncQueue(push);

      expect(push).toHaveBeenCalledWith(entry);
      expect(mockMarkSynced).not.toHaveBeenCalled();
    });

    it('continues batch after one failure', async () => {
      const e1: Entry = { id: 'e1', text: 'a', createdAt: '2025-01-01T00:00:00.000Z' };
      const e2: Entry = { id: 'e2', text: 'b', createdAt: '2025-01-02T00:00:00.000Z' };
      mockGetPending.mockResolvedValueOnce([
        { id: 'q1', payload: e1, status: 'pending' },
        { id: 'q2', payload: e2, status: 'pending' },
      ]);

      const push = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);
      await processSyncQueue(push);

      expect(mockMarkSynced).toHaveBeenCalledTimes(1);
      expect(mockMarkSynced).toHaveBeenCalledWith('q2');
    });

    it('skips queue drain when paywall blocks sync (items stay pending)', async () => {
      mockSyncBlocked.mockReturnValue(true);
      mockGetPending.mockResolvedValue([
        { id: 'q1', payload: { id: 'e1', text: 'a', createdAt: '2025-01-01T00:00:00.000Z' }, status: 'pending' },
      ]);

      const push = jest.fn().mockResolvedValue(undefined);
      await processSyncQueue(push);

      expect(mockGetPending).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(mockMarkSynced).not.toHaveBeenCalled();
    });
  });

  describe('startBackgroundSync', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('runs process immediately and again on interval', async () => {
      mockGetPending.mockResolvedValue([]);

      const push = jest.fn().mockResolvedValue(undefined);
      const handle = startBackgroundSync({ intervalMs: 1000, pushEntry: push });

      await Promise.resolve();
      expect(mockGetPending).toHaveBeenCalledTimes(1);

      mockGetPending.mockClear();
      await jest.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
      expect(mockGetPending).toHaveBeenCalledTimes(1);

      handle.stop();
    });
  });
});
