/**
 * The record on Android, driven end to end.
 *
 * The same real `RecordApp` over a real SQLite database as `RecordApp.test.tsx`, given
 * Android's capabilities. What is asserted is the Android-specific part of what somebody
 * would see and do: no circle that cannot listen, and an empty record that does not offer
 * one. Capture, correction, removal and restoration are platform-neutral and are covered
 * there.
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
  const view = render(
    <RecordApp store={h.store} bridge={h.bridge} {...defaults} capabilities={ANDROID} />
  );
  await act(async () => {
    await Promise.resolve();
  });
  return view;
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
});
