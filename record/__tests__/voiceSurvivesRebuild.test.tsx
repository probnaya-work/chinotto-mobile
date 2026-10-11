/**
 * A recording controller must survive service-object rebuilds.
 *
 * Permission preparation now finishes before the first recording begins. The services
 * object can still be rebuilt for many reasons, and doing so must not replace the controller
 * holding an in-flight recording with one holding nothing.
 *
 * What is asserted is the rule, not the wiring: a recording that has begun survives the app
 * learning something about itself.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createRecordStore } from '../store';
import { ChinottoApp, type Services } from '../ChinottoApp';
import type { VoiceEngine } from '../voice';
import type { RecordDb } from '../db';

type FinalHandler = (
  text: string,
  reason: string,
  audio: { path: string; durationMs: number } | null,
  audioFailure?: string
) => void;

type PartialHandler = (text: string) => void;
type StateHandler = (state: 'idle' | 'listening') => void;

function harness() {
  const db = openTestDb();
  let seq = 0;
  const started: { audioFileName: string }[] = [];
  let onFinal: FinalHandler | null = null;
  let onPartial: PartialHandler | null = null;
  let onState: StateHandler | null = null;

  const engine: VoiceEngine = {
    start: async (opts) => {
      started.push(opts);
    },
    stop: () => {},
    subscribe: (handlers) => {
      onFinal = handlers.onTranscriptFinal ?? null;
      onPartial = handlers.onTranscriptPartial ?? null;
      onState = handlers.onStateChange ?? null;
      return () => {
        onFinal = null;
        onPartial = null;
        onState = null;
      };
    },
  };

  const newId = () => `f${++seq}`;

  // Everything the surface needs and nothing it does here. Rebuilt per render on purpose:
  // that is exactly what the real one does, and what used to take the recording with it.
  const services = (permission: 'granted' | 'ask'): Services => ({
    db: db as unknown as RecordDb,
    voiceEngine: engine,
    newId,
    deviceName: () => 'this iphone',
    update: { soft: false, forced: false, version: '2.0.0', availableVersion: null },
    onDismissSoftUpdate: () => {},
    openStore: () => {},
    icon: 'dark',
    onPickIcon: () => {},
    voiceOnOpen: false,
    onVoiceOnOpenHandled: () => {},
    openSystemSettings: () => {},
    microphonePermission: () => permission,
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
    incomingShare: null,
    onShareHandled: () => {},
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
    // A new object every time, as the real one is: this is what rebuilt the bridge, and
    // the bridge is what used to rebuild the voice controller.
    legacy: {
      enqueue: async () => {},
      dequeue: async () => {},
      tombstone: async () => {},
    },
  });

  return {
    db,
    store: createRecordStore(db, { newId: () => `x${++seq}` }),
    services,
    started,
    partial: (text: string) => onPartial?.(text),
    state: (state: 'idle' | 'listening') => onState?.(state),
    final: (...args: Parameters<FinalHandler>) => onFinal?.(...args),
  };
}

describe('a recording in flight', () => {
  it('never lets an empty phrase boundary erase words already heard', async () => {
    const h = harness();
    await migrate(h.db);
    render(<ChinottoApp services={h.services('granted')} />);
    await act(async () => Promise.resolve());

    await act(async () => {
      fireEvent.press(screen.getByLabelText('start recording'));
      h.state('listening');
      h.partial('primeira parte');
      await Promise.resolve();
    });
    expect(screen.getByText(/primeira parte/)).toBeTruthy();

    await act(async () => {
      h.partial('');
      await Promise.resolve();
    });
    expect(screen.getByText(/primeira parte/)).toBeTruthy();

    const audioPath = h.started[0].audioFileName;
    await act(async () => {
      h.final('', 'manual', { path: audioPath, durationMs: 4000 });
      await Promise.resolve();
    });
    await waitFor(async () => {
      const rows = await h.store.loadRecord();
      expect(rows[0]?.body).toBe('primeira parte');
    });
    h.db.close();
  });

  it('prepares permission first, then survives a later services rebuild', async () => {
    const h = harness();
    await migrate(h.db);

    // An unanswered first-use permission is prepared without opening a recording.
    const view = render(<ChinottoApp services={h.services('ask')} />);
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('start recording'));
      await Promise.resolve();
    });
    expect(h.started).toHaveLength(0);

    // The answer rebuilds services before recording. The next deliberate tap starts it.
    await act(async () => {
      view.rerender(<ChinottoApp services={h.services('granted')} />);
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('start recording'));
      await Promise.resolve();
    });
    expect(h.started).toHaveLength(1);
    const audioPath = h.started[0].audioFileName;

    // A later rebuild still cannot replace the controller holding this recording.
    await act(async () => {
      view.rerender(<ChinottoApp services={h.services('granted')} />);
      await Promise.resolve();
    });

    // A second tap stops it and the audio comes back under the id it was opened with.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('stop and save recording'));
      h.final('', 'manual', { path: audioPath, durationMs: 4000 });
      await Promise.resolve();
    });

    // It is a moment, with its audio. The replacement controller had no pending id, so
    // this used to settle into nothing and leave the file orphaned on disk.
    await waitFor(async () => {
      const rows = await h.store.loadRecord();
      expect(rows).toHaveLength(1);
      expect(rows[0].method).toBe('voice');
      expect(rows[0].durationMs).toBe(4000);
    });
    h.db.close();
  });
});
