/**
 * The record stops where the edge begins.
 *
 * The edge is opaque and in front of the record, and it is not one height: it grows with
 * every notice stacked over the capture row, and again with every line the field gains. The
 * record reserved a constant for it — the height of the quietest case — so in every other
 * case the newest material was simply covered. On a phone that read as a thought cut off
 * mid-line, with the undo notice sitting just under the cut.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createBridge } from '../bridge';
import { createRecordStore } from '../store';
import { RecordApp } from '../RecordApp';
import { frame } from '../ui/tokens';

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

/** The viewport's floor, as a number of points above the bottom of the screen. */
function floor(): number {
  const style = screen.getByTestId('record-viewport').props.style;
  const bottom = (Array.isArray(style) ? Object.assign({}, ...style) : style).bottom;
  return typeof bottom === 'number' ? bottom : bottom.__getValue();
}

function reportEdgeHeight(height: number) {
  fireEvent(screen.getByTestId('edge'), 'layout', { nativeEvent: { layout: { height } } });
}

describe('how much room the record leaves the edge', () => {
  let db: ReturnType<typeof openTestDb>;

  beforeEach(async () => {
    db = openTestDb();
    await migrate(db);
    const store = createRecordStore(db, { newId: () => 'f1' });
    const bridge = createBridge(db, { now: () => Date.now(), tombstone: async () => {} });
    render(<RecordApp store={store} bridge={bridge} {...defaults} />);
    await act(async () => {});
  });

  it('starts at the frame\'s own figure, so nothing moves at launch', () => {
    expect(floor()).toBe(frame.bottom);
  });

  it('gets out of the way when the edge grows', () => {
    // A notice over a capture row: taller than the constant, and opaque.
    act(() => reportEdgeHeight(frame.bottom + 48));
    expect(floor()).toBe(frame.bottom + 48);
  });

  it('comes back when the edge is quiet again', () => {
    act(() => reportEdgeHeight(frame.bottom + 48));
    act(() => reportEdgeHeight(frame.bottom));
    expect(floor()).toBe(frame.bottom);
  });

  it('never gives back less than the design asks for', () => {
    // A measurement smaller than the frame's own bottom is not a reason to let the record
    // run under the edge; the figure is a floor, not a guess.
    act(() => reportEdgeHeight(40));
    expect(floor()).toBe(frame.bottom);
  });
});
