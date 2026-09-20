/**
 * The update line names the version the store has, not one written into the component.
 *
 * It used to read `chinotto 2.0.1 is in the app store` from a literal in `Edge.tsx`, so it
 * kept naming 2.0.1 whatever remote config said — and went on naming it after 2.0.1 was the
 * version running. The number has to arrive from the same metadata that decided there was
 * an update at all.
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createBridge } from '../bridge';
import { createRecordStore } from '../store';
import { RecordApp } from '../RecordApp';

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
};

async function mount(update: {
  soft: boolean;
  availableVersion: string | null;
}) {
  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'f1' });
  const bridge = createBridge(db, { now: () => Date.now(), tombstone: async () => {} });
  render(
    <RecordApp
      store={store}
      bridge={bridge}
      {...defaults}
      update={{ ...update, onUpdate: jest.fn(), onLater: jest.fn() }}
    />,
  );
  await act(async () => {});
}

describe('the update notice names the available version', () => {
  it('shows the version the update metadata reported', async () => {
    await mount({ soft: true, availableVersion: '3.1.4' });
    expect(screen.getByText(/chinotto 3\.1\.4 is in the app store/)).toBeTruthy();
  });

  it('carries no version of its own', async () => {
    await mount({ soft: true, availableVersion: '3.1.4' });
    expect(screen.queryByText(/2\.0\.1/)).toBeNull();
  });

  it('says nothing when the available version is unknown', async () => {
    await mount({ soft: true, availableVersion: null });
    expect(screen.queryByText(/is in the app store/)).toBeNull();
  });

  it('says nothing when no update is on offer', async () => {
    await mount({ soft: false, availableVersion: '3.1.4' });
    expect(screen.queryByText(/is in the app store/)).toBeNull();
  });
});
