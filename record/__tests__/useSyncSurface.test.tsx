import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSyncSurface, type SyncPorts } from '../useSyncSurface';
import type { RecordBridge } from '../bridge';

it('shows a pending history send honestly and clears it after a successful retry', async () => {
  let failed = 1;
  const ports: SyncPorts = {
    configured: () => true, currentUserId: () => 'user', blockedByPaywall: () => false,
    online: () => true, pendingCount: async () => failed, failedCount: async () => failed,
    devices: async () => null, thisDeviceId: () => null,
    signInExpired: () => false, signInExpiredWhen: () => null,
  };
  const bridge = { openConflicts: async () => [] } as unknown as RecordBridge;
  const { result } = renderHook(() => useSyncSurface(ports, bridge));
  await waitFor(() => expect(result.current.pendingError).toContain('kept here'));
  expect(result.current.notice?.text).toContain('still on this phone');
  failed = 0;
  await act(async () => { await result.current.refresh(); });
  expect(result.current.pendingError).toBeNull();
  expect(result.current.notice).toBeNull();
});
