/**
 * Reading recordings back runs only where the phone can listen at all.
 *
 * On Android there is no voice module, and so no recording to read back and nothing to ask.
 * The retry is not merely expected to find nothing there: it is not built, so it never asks a
 * native module that is absent by design. On the iPhone it still runs, a few seconds after
 * launch, exactly as before.
 */

import React from 'react';
import { act, render } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { ChinottoApp, type Services } from '../ChinottoApp';
import { capabilitiesFor } from '../platform';
import type { VoiceEngine } from '../voice';
import type { RecordDb } from '../db';

function services(db: RecordDb, engine: VoiceEngine, os: 'ios' | 'android'): Services {
  return {
    db,
    voiceEngine: engine,
    newId: () => 'f1',
    deviceName: () => 'this phone',
    update: { soft: false, forced: false, version: '2.0.1', availableVersion: null },
    onDismissSoftUpdate: () => {},
    openStore: () => {},
    icon: 'dark',
    onPickIcon: () => {},
    voiceOnOpen: false,
    onVoiceOnOpenHandled: () => {},
    openSystemSettings: () => {},
    microphonePermission: () => 'ask',
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
    incomingShare: null,
    onShareHandled: () => {},
    capabilities: capabilitiesFor(os),
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
  };
}

async function launch(os: 'ios' | 'android') {
  const db = openTestDb();
  await migrate(db);
  const localStatus = jest.fn(async () => 'unavailable' as const);
  const engine: VoiceEngine = {
    start: async () => {},
    stop: () => {},
    subscribe: () => () => {},
    localStatus,
    transcribeFile: async () => ({ status: 'unavailable' as const }),
  };
  const view = render(<ChinottoApp services={services(db as unknown as RecordDb, engine, os)} />);
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
  });
  view.unmount();
  return localStatus;
}

describe('reading recordings back', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('never asks for local recognition on android', async () => {
    expect(await launch('android')).not.toHaveBeenCalled();
  });

  it('still asks on the iphone after launch', async () => {
    expect(await launch('ios')).toHaveBeenCalled();
  });
});
