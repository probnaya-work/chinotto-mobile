/**
 * Settings has to be findable.
 *
 * It is reached by pulling down from the top edge, and the strip that takes the pull used
 * to draw nothing at all until it was already being pulled — so sync, the account, the
 * devices and everything else behind it were unreachable unless somebody told you the
 * gesture existed. The first person to run the build on a phone said exactly that.
 *
 * The words are there until the pull has worked once. The mark stays after that, because a
 * handle you can see is the difference between a gesture and a secret.
 */

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createBridge } from '../bridge';
import { createRecordStore } from '../store';
import { RecordApp } from '../RecordApp';
import { frame } from '../ui/tokens';

const KEY = '@chinotto/pull_for_settings_found_v1';

const defaults = {
  coldStart: false,
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

async function mount(onOpenSettings = jest.fn()) {
  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'f1' });
  const bridge = createBridge(db, { now: () => Date.now(), tombstone: async () => {} });
  render(<RecordApp store={store} bridge={bridge} {...defaults} onOpenSettings={onOpenSettings} />);
  await act(async () => {
    await Promise.resolve();
  });
  return { db, onOpenSettings };
}

/** One pull, far enough to cross the threshold. */
function pullDown(from = frame.statusBarHeight + 8) {
  const strip = screen.getByTestId('pull-strip');
  fireEvent(strip, 'responderGrant', { nativeEvent: { pageY: from } });
  fireEvent(strip, 'responderMove', {
    nativeEvent: { pageY: from + frame.pullThreshold + 10 },
  });
}

describe('finding settings', () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(KEY);
  });

  it('says how, until it has been done once', async () => {
    const h = await mount();
    await waitFor(() => expect(screen.getByText('pull for settings')).toBeTruthy());

    act(() => pullDown());
    expect(h.onOpenSettings).toHaveBeenCalled();

    // Having worked once, it stops saying so.
    await waitFor(() => expect(screen.queryByText('pull for settings')).toBeNull());
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBe('1'));
    h.db.close();
  });

  it('does not say it again on the next launch', async () => {
    await AsyncStorage.setItem(KEY, '1');
    const h = await mount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('pull for settings')).toBeNull();
    // The strip is still there, and still works.
    act(() => pullDown());
    expect(h.onOpenSettings).toHaveBeenCalled();
    h.db.close();
  });

  it('leaves the record room to begin below the strip', () => {
    // The record used to start at 64, which is above the bottom of the grab strip, so
    // whatever the strip drew landed on top of the oldest visible material.
    expect(frame.top).toBeGreaterThanOrEqual(frame.statusBarHeight + frame.pullStripHeight);
  });
});
