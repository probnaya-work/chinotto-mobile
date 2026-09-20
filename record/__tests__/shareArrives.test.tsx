/**
 * Every share was lost, and an empty list is why.
 *
 * `useIncomingShare` holds `[]` from the moment it mounts — that is what it has before
 * anything has been shared. The intake took the empty list for a share, found nothing in
 * it, and said it had been handled. Marked handled once at launch, the flag never came
 * back down, and everything shared afterwards was gated away before it reached the surface.
 *
 * So: nothing arrived is not something to handle.
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { ChinottoApp, type Services } from '../ChinottoApp';
import type { VoiceEngine } from '../voice';
import type { RecordDb } from '../db';
import type { SharePayloadLike } from '../share';

const engine: VoiceEngine = {
  start: async () => {},
  stop: () => {},
  subscribe: () => () => {},
};

function services(
  db: ReturnType<typeof openTestDb>,
  incomingShare: SharePayloadLike[] | null,
  onShareHandled: () => void
): Services {
  let seq = 0;
  return {
    db: db as unknown as RecordDb,
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

const A_LINK: SharePayloadLike[] = [
  { shareType: 'url', contentType: 'website', value: 'https://example.com/' },
];

describe('a share arriving at a running app', () => {
  it('is not spent by the empty list the app starts with', async () => {
    const db = openTestDb();
    await migrate(db);
    const handled = jest.fn();

    // Launch: the hook has read the store and found nothing in it.
    const view = render(<ChinottoApp services={services(db, [], handled)} />);
    await act(async () => {
      await Promise.resolve();
    });

    // Nothing was shared, so nothing was handled. Saying otherwise is what spent the flag.
    expect(handled).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('a word about it, or not')).toBeNull();

    // Then somebody shares a link into the running app.
    await act(async () => {
      view.rerender(<ChinottoApp services={services(db, A_LINK, handled)} />);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('a word about it, or not')).toBeTruthy();
      expect(screen.getAllByText('example.com').length).toBeGreaterThan(0);
    });
    expect(handled).toHaveBeenCalled();
    db.close();
  });

  it('is taken once, not on every render', async () => {
    const db = openTestDb();
    await migrate(db);
    const handled = jest.fn();

    const view = render(<ChinottoApp services={services(db, A_LINK, handled)} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(handled).toHaveBeenCalledTimes(1);

    // The real `services` is a new object on every render. The share must not be taken
    // again because of that — it is the payload that is new or not, never the wrapper.
    await act(async () => {
      view.rerender(<ChinottoApp services={services(db, null, handled)} />);
      await Promise.resolve();
    });
    expect(handled).toHaveBeenCalledTimes(1);
    db.close();
  });
});
