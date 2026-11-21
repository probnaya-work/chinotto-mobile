import type { Services } from '../ChinottoApp';
import type { VoiceEngine } from '../voice';
import type { SharePayloadLike } from '../share';
import type { TestDb } from './nodeSqliteDb';

const engine: VoiceEngine = {
  start: async () => {},
  stop: () => {},
  subscribe: () => () => {},
};

export function testAppServices(
  db: TestDb,
  incomingShare: SharePayloadLike[] | null,
  onShareHandled: () => void
): Services {
  let seq = 0;
  return {
    db,
    voiceEngine: engine,
    newId: () => `f${++seq}`,
    deviceName: () => 'this iphone',
    update: { soft: false, forced: false, version: '2.0.0', availableVersion: null },
    onDismissSoftUpdate: () => {},
    openStore: () => {},
    icon: 'dark',
    onPickIcon: () => {},
    voiceOnOpen: false,
    onVoiceOnOpenHandled: () => {},
    openSystemSettings: () => {},
    microphonePermission: () => 'granted',
    requestVoicePermission: async () => 'granted' as const,
    subscriptionLoaded: true,
    syncAccount: {
      paywallEnabled: () => false,
      hasSyncAccess: () => false,
      loadPlans: async () => [],
      purchase: async () => ({ kind: 'cancelled' }),
      restore: async () => ({ hasAccess: false, reached: true }),
      signInWithApple: async () => 'cancelled',
      afterSignIn: async () => {},
      mirrorAccess: async () => {},
      signOut: async () => {},
    },
    deleteAccount: async () => 'cancelled' as const,
    revokeDevice: async () => false,
    incomingShare,
    onShareHandled,
    syncPorts: {
      configured: () => false,
      currentUserId: () => null,
      blockedByPaywall: () => false,
      online: () => null,
      pendingCount: async () => 0,
      devices: async () => null,
      thisDeviceId: () => null,
      signInExpired: () => false,
      signInExpiredWhen: () => null,
    },
    legacy: { enqueue: async () => {}, dequeue: async () => {}, tombstone: async () => {} },
  };
}
