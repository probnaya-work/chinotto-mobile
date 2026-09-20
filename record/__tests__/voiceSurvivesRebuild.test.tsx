/**
 * The first recording of every launch used to be lost, and this is why.
 *
 * `services` is rebuilt whenever the microphone permission becomes known — and the moment
 * it becomes known is the start of the first recording, because there is no API that
 * reports it without asking. The voice controller was rebuilt along with it, so the thing
 * holding the recording in flight was replaced by one holding nothing. When the audio
 * finished there was no pending id to attach it to: a file on disk, and no moment.
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

function harness() {
  const db = openTestDb();
  let seq = 0;
  const started: { audioFileName: string }[] = [];
  let onFinal: FinalHandler | null = null;

  const engine: VoiceEngine = {
    start: async (opts) => {
      started.push(opts);
    },
    stop: () => {},
    subscribe: (handlers) => {
      onFinal = handlers.onTranscriptFinal ?? null;
      return () => {
        onFinal = null;
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
    update: { soft: false, forced: false, version: '2.0.0' },
    onDismissSoftUpdate: () => {},
    openStore: () => {},
    icon: 'dark',
    onPickIcon: () => {},
    voiceOnOpen: false,
    onVoiceOnOpenHandled: () => {},
    openSystemSettings: () => {},
    microphonePermission: () => permission,
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
    final: (...args: Parameters<FinalHandler>) => onFinal?.(...args),
  };
}

describe('a recording in flight', () => {
  it('survives the app learning the microphone permission', async () => {
    const h = harness();
    await migrate(h.db);

    // Every launch begins not knowing: there is no API that reports the permission
    // without asking, so it is `ask` until a recording answers it.
    const view = render(<ChinottoApp services={h.services('ask')} />);
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent(screen.getByLabelText('hold to speak'), 'pressIn');
      await Promise.resolve();
    });
    expect(h.started).toHaveLength(1);
    const audioPath = h.started[0].audioFileName;

    // Holding the circle is what answers it, so the answer lands mid-recording and the
    // services object is rebuilt underneath. Everything downstream of it is rebuilt too.
    await act(async () => {
      view.rerender(<ChinottoApp services={h.services('granted')} />);
      await Promise.resolve();
    });

    // The circle is let go and the audio comes back, under the id it was opened with.
    await act(async () => {
      fireEvent(screen.getByLabelText('stop recording'), 'pressOut');
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
