/**
 * The record on Android, driven end to end.
 *
 * The same real `RecordApp` over a real SQLite database as `RecordApp.test.tsx`, given
 * Android's capabilities and the back handler Android's back gesture reaches. What is
 * asserted is the Android-specific part of what somebody would see and do: no circle that
 * cannot listen, an empty record that does not offer one, and back putting away one layer
 * at a time without touching the record — then falling through to the system.
 *
 * Capture, correction, removal and restoration themselves are platform-neutral and are
 * already covered there; they are exercised here only as far as back interacts with them.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createBridge } from '../bridge';
import { createRecordStore } from '../store';
import { RecordApp } from '../RecordApp';
import { capabilitiesFor } from '../platform';

const T0 = new Date('2026-09-19T17:10:00.000Z').getTime();
const ANDROID = capabilitiesFor('android');

function harness() {
  const db = openTestDb();
  let seq = 0;
  const bridge = createBridge(db, { now: () => Date.now() });
  const store = createRecordStore(db, { newId: () => `f${++seq}` });
  return { db, store, bridge };
}

const defaults = {
  coldStart: false,
  onOpenSettings: jest.fn(),
  voice: {
    start: jest.fn(async () => false),
    stop: jest.fn(async () => {}),
    state: null,
    permission: 'ask' as const,
    openSystemSettings: jest.fn(),
  },
  sync: { notice: null, onOpen: jest.fn() },
  update: { soft: false, availableVersion: null, onUpdate: jest.fn(), onLater: jest.fn() },
};

async function mount(h: ReturnType<typeof harness>) {
  const backRef: { current: (() => boolean) | null } = { current: null };
  const view = render(
    <RecordApp
      store={h.store}
      bridge={h.bridge}
      {...defaults}
      capabilities={ANDROID}
      backRef={backRef}
    />
  );
  await act(async () => {
    await Promise.resolve();
  });
  const back = async () => {
    let consumed = false;
    await act(async () => {
      consumed = backRef.current?.() ?? false;
      await Promise.resolve();
    });
    return consumed;
  };
  return { view, back };
}

describe('the record on android', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('offers typing only, and does not promise a circle', async () => {
    const h = harness();
    await migrate(h.db);
    await mount(h);

    await waitFor(() =>
      expect(screen.getByText('type anything. it lands here, and stays.')).toBeTruthy()
    );
    expect(screen.queryByLabelText('hold to speak')).toBeNull();
    expect(screen.getByLabelText('capture')).toBeTruthy();
    h.db.close();
  });

  it('captures offline, into the local record, with no account anywhere', async () => {
    const h = harness();
    await migrate(h.db);
    await mount(h);

    const field = screen.getByLabelText('capture');
    await act(async () => {
      fireEvent.changeText(field, 'ferry at 18:40');
      fireEvent(field, 'submitEditing');
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('ferry at 18:40')).toBeTruthy());
    const rows = await h.store.loadRecord();
    expect(rows.map((r) => r.body)).toEqual(['ferry at 18:40']);
    h.db.close();
  });

  it('puts away one layer per back, and lets the system have the last one', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({ body: 'the moment' });
    const { back } = await mount(h);

    await waitFor(() => expect(screen.getByText('the moment')).toBeTruthy());

    // First tap selects a D0 moment; back clears the selection rather than leaving.
    await act(async () => {
      fireEvent.press(screen.getByText('the moment'));
    });
    expect(screen.getByLabelText('remove')).toBeTruthy();
    expect(await back()).toBe(true);
    expect(screen.queryByLabelText('remove')).toBeNull();

    // Correcting, which opens the moment: back cancels the correction and leaves it open…
    await act(async () => {
      fireEvent.press(screen.getByText('the moment'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('correct'));
    });
    const field = screen.getByLabelText('correct the wording');
    await act(async () => {
      fireEvent.changeText(field, 'a different moment');
    });
    expect(await back()).toBe(true);
    expect(screen.queryByLabelText('correct the wording')).toBeNull();
    expect(screen.getByText('‹ edge')).toBeTruthy();

    // …and the unfinished correction was let go of, not saved.
    const rows = await h.store.loadRecord();
    expect(rows.map((r) => r.body)).toEqual(['the moment']);

    // Then back closes the moment itself.
    expect(await back()).toBe(true);
    expect(screen.queryByText('‹ edge')).toBeNull();

    // With nothing in front, back is the system's: the app leaves the ordinary way.
    expect(await back()).toBe(false);
    h.db.close();
  });

  it('brings a standing record back to the edge before anything else', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({ body: 'old thing', at: new Date(2024, 2, 14).getTime() });
    await h.store.capture({ body: 'new thing' });
    const { back } = await mount(h);

    const field = screen.getByLabelText('capture');
    await act(async () => {
      fireEvent(field, 'focus');
      fireEvent.changeText(field, 'march 2024');
    });
    await act(async () => {
      fireEvent(field, 'submitEditing');
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText(/you are in mar 2024/)).toBeTruthy());

    expect(await back()).toBe(true);
    await waitFor(() => expect(screen.queryByText(/you are in mar 2024/)).toBeNull());
    expect(await back()).toBe(false);
    h.db.close();
  });
});
