/**
 * Hearing a moment again.
 *
 * The chip was drawn long before anything could play, and for a while it only toggled a
 * flag: a stop mark over silence, and nothing ever finishing. What is asserted here is the
 * behaviour that makes the mark mean something — it follows the sound rather than the tap,
 * one thing plays at a time, and a recording that is gone says so instead of pretending.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createBridge } from '../bridge';
import { createRecordStore } from '../store';
import { RecordApp } from '../RecordApp';
import type { AudioPlaybackPort } from '../playback';

function harness() {
  const db = openTestDb();
  let seq = 0;
  const bridge = createBridge(db, { now: () => Date.now(), tombstone: async () => {} });
  const store = createRecordStore(db, { newId: () => `f${++seq}` });
  return { db, store, bridge };
}

/** A port that records what it was asked to do, and can be told the audio ran out. */
function fakeAudio() {
  const played: { id: string; path: string }[] = [];
  let stops = 0;
  let finish: ((id: string) => void) | null = null;
  let fail: ((id: string, code: string) => void) | null = null;
  let canPlay = true;

  const port: AudioPlaybackPort = {
    play: async (id, path) => {
      played.push({ id, path });
      return canPlay;
    },
    stop: () => {
      stops += 1;
    },
    subscribe: (handlers) => {
      finish = handlers.onFinished ?? null;
      fail = handlers.onError ?? null;
      return () => {
        finish = null;
        fail = null;
      };
    },
  };

  return {
    port,
    played,
    get stops() {
      return stops;
    },
    refuse: () => {
      canPlay = false;
    },
    ranOut: (id: string) => finish?.(id),
    missing: (id: string) => fail?.(id, 'audio_missing'),
  };
}

const defaults = {
  coldStart: false,
  onOpenSettings: jest.fn(),
  voice: {
    start: jest.fn(async () => true),
    stop: jest.fn(async () => {}),
    state: null,
    permission: 'granted' as const,
    openSystemSettings: jest.fn(),
  },
  sync: { notice: null, onOpen: jest.fn() },
  update: { soft: false, onUpdate: jest.fn(), onLater: jest.fn() },
};

async function mount(h: ReturnType<typeof harness>, audio: AudioPlaybackPort) {
  const view = render(
    <RecordApp store={h.store} bridge={h.bridge} {...defaults} audio={audio} />
  );
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

/** The chip names itself by what pressing it would do, so that is how it is found. */
const chip = (what: 'play' | 'stop') => screen.getByLabelText(new RegExp(`^${what} `));
const noChip = (what: 'play' | 'stop') => screen.queryByLabelText(new RegExp(`^${what} `));

describe('playing a moment back', () => {
  it('plays the audio the row actually points at, and shows it playing', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({
      body: 'the ferry thing',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f1.m4a', durationMs: 9000 },
    });
    const audio = fakeAudio();
    await mount(h, audio.port);

    await act(async () => {
      fireEvent.press(chip('play'));
      await Promise.resolve();
    });

    // The path comes from `voice_captures`, not from the id — they can differ, and the
    // file is the material.
    expect(audio.played).toEqual([{ id: 'f1', path: 'chinotto/audio/f1.m4a' }]);
    await waitFor(() => expect(chip('stop')).toBeTruthy());
    h.db.close();
  });

  it('puts the mark away when the audio runs out, not when the finger leaves', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({
      body: 'the ferry thing',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f1.m4a', durationMs: 9000 },
    });
    const audio = fakeAudio();
    await mount(h, audio.port);

    await act(async () => {
      fireEvent.press(chip('play'));
      await Promise.resolve();
    });
    await waitFor(() => expect(chip('stop')).toBeTruthy());

    // Nothing was pressed. The recording simply ended.
    await act(async () => {
      audio.ranOut('f1');
      await Promise.resolve();
    });
    await waitFor(() => expect(noChip('stop')).toBeNull());
    expect(chip('play')).toBeTruthy();
    h.db.close();
  });

  it('stops when the same chip is pressed again', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({
      body: 'the ferry thing',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f1.m4a', durationMs: 9000 },
    });
    const audio = fakeAudio();
    await mount(h, audio.port);

    await act(async () => {
      fireEvent.press(chip('play'));
      await Promise.resolve();
    });
    await waitFor(() => expect(chip('stop')).toBeTruthy());

    await act(async () => {
      fireEvent.press(chip('stop'));
      await Promise.resolve();
    });
    expect(audio.stops).toBe(1);
    await waitFor(() => expect(chip('play')).toBeTruthy());
    h.db.close();
  });

  it('plays one thing at a time', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({
      body: 'the ferry thing',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f1.m4a', durationMs: 9000 },
    });
    await h.store.capture({
      body: 'the folder thing',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f2.m4a', durationMs: 4000 },
    });
    const audio = fakeAudio();
    await mount(h, audio.port);

    const chips = screen.getAllByLabelText(/^play /);
    expect(chips).toHaveLength(2);

    await act(async () => {
      fireEvent.press(chips[0]);
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^play /));
      await Promise.resolve();
    });

    // Both were asked for, and only the second is shown playing — two stop marks would be
    // two recordings talking over each other, which is never what was meant.
    expect(audio.played).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByLabelText(/^stop /)).toHaveLength(1));
    h.db.close();
  });

  it('says the audio is gone rather than appearing to play nothing', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({
      body: 'the ferry thing',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f1.m4a', durationMs: 9000 },
    });
    const audio = fakeAudio();
    await mount(h, audio.port);

    await act(async () => {
      fireEvent.press(chip('play'));
      await Promise.resolve();
    });

    // The file was there when the row was read and not when it was reached for. That is
    // written down, so it still says so the next time rather than only on screen.
    await act(async () => {
      audio.missing('f1');
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('audio gone')).toBeTruthy());
    const rows = await h.store.loadRecord();
    expect(rows.find((r) => r.id === 'f1')?.audioMissing).toBe(true);
    h.db.close();
  });

  it('takes the mark back when the audio could not start at all', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({
      body: 'the ferry thing',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f1.m4a', durationMs: 9000 },
    });
    const audio = fakeAudio();
    audio.refuse();
    await mount(h, audio.port);

    await act(async () => {
      fireEvent.press(chip('play'));
      await Promise.resolve();
    });

    // No sound came out, so nothing is left claiming to be playing.
    await waitFor(() => expect(chip('play')).toBeTruthy());
    h.db.close();
  });
});
