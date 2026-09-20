import {
  createDebouncedRemoteIngestNotifier,
  REMOTE_INGEST_STREAM_DEBOUNCE_MS,
} from '../remoteIngestStreamNotify';

describe('createDebouncedRemoteIngestNotifier', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('coalesces rapid notify calls into one bump after debounce window', () => {
    const bumps: number[] = [];
    const n = createDebouncedRemoteIngestNotifier(() => bumps.push(bumps.length), 100);
    n.notify();
    n.notify();
    n.notify();
    expect(bumps).toHaveLength(0);
    jest.advanceTimersByTime(100);
    expect(bumps).toEqual([0]);
  });

  it('cancel drops a pending bump', () => {
    const bumps: number[] = [];
    const n = createDebouncedRemoteIngestNotifier(() => bumps.push(1), REMOTE_INGEST_STREAM_DEBOUNCE_MS);
    n.notify();
    n.cancel();
    jest.advanceTimersByTime(REMOTE_INGEST_STREAM_DEBOUNCE_MS + 50);
    expect(bumps).toHaveLength(0);
  });

  it('flush runs the bump immediately', () => {
    const bumps: number[] = [];
    const n = createDebouncedRemoteIngestNotifier(() => bumps.push(1), 500);
    n.notify();
    n.flush();
    expect(bumps).toEqual([1]);
    jest.advanceTimersByTime(500);
    expect(bumps).toEqual([1]);
  });
});
