/**
 * The record surface, driven end to end.
 *
 * Renders the real `RecordApp` over a real SQLite database and the real store and bridge —
 * no mocked repository, no fake material. What is asserted is what somebody would see and
 * do: the two-tap rule, capture clearing the field before anything else, the twelve seconds,
 * the eight seconds, standing by typing a date, and Find as a mode of the field.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createBridge } from '../bridge';
import { createRecordStore } from '../store';
import { RecordApp } from '../RecordApp';

const T0 = new Date('2026-09-19T17:10:00.000Z').getTime();

function harness() {
  const db = openTestDb();
  let seq = 0;
  const tombstoned: string[] = [];

  const bridge = createBridge(db, {
    now: () => Date.now(),
    tombstone: async (_d, id) => {
      tombstoned.push(id);
    },
  });
  const store = createRecordStore(db, { newId: () => `f${++seq}` });

  return { db, store, bridge, tombstoned };
}

const defaults = {
  coldStart: false,
  onOpenSettings: jest.fn(),
  voice: {
    start: jest.fn(async () => true),
    stop: jest.fn(async () => {}),
    state: null,
    permission: 'granted' as const,
    onRequestPermission: jest.fn(),
    openSystemSettings: jest.fn(),
  },
  sync: { notice: null, onOpen: jest.fn() },
  update: { soft: false, onUpdate: jest.fn(), onLater: jest.fn() },
};

async function mount(h: ReturnType<typeof harness>) {
  const view = render(<RecordApp store={h.store} bridge={h.bridge} {...defaults} />);
  // The first read resolves before the record says anything about being empty.
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe('the record surface', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens straight into capture, with the record empty and saying so', async () => {
    const h = harness();
    await migrate(h.db);
    await mount(h);

    await waitFor(() =>
      expect(
        screen.getByText('type anything, or hold the circle and talk. it lands here, and stays.')
      ).toBeTruthy()
    );
    h.db.close();
  });

  it('clears the field before anything else, and the moment lands', async () => {
    const h = harness();
    await migrate(h.db);
    await mount(h);

    const field = screen.getByLabelText('capture');

    await act(async () => {
      fireEvent.changeText(field, 'dinner friday');
    });
    await act(async () => {
      fireEvent(field, 'submitEditing');
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('dinner friday')).toBeTruthy());
    expect(field.props.value).toBe('');

    const rows = await h.store.loadRecord();
    expect(rows.map((r) => r.body)).toEqual(['dinner friday']);
    h.db.close();
  });

  it('asks once before it acts: the first tap selects, the second opens', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({ body: 'the folder thing again' });
    await mount(h);

    await waitFor(() => expect(screen.getByText('the folder thing again')).toBeTruthy());

    // Nothing is offered until it is asked for.
    expect(screen.queryByText('correct')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText('the folder thing again'));
    });
    expect(screen.getByText('correct')).toBeTruthy();
    expect(screen.getByText('continue')).toBeTruthy();
    expect(screen.getByText('hold')).toBeTruthy();

    // The second tap opens it; focus states what it is and when.
    await act(async () => {
      fireEvent.press(screen.getByText('the folder thing again'));
    });
    await waitFor(() => expect(screen.getByText('‹ edge')).toBeTruthy());
    expect(screen.getByText(/^a fragment · /)).toBeTruthy();
    h.db.close();
  });

  it('keeps a removal to itself for eight seconds, and can be talked out of it', async () => {
    const h = harness();
    await migrate(h.db);
    const m = await h.store.capture({ body: 'a mistake' });
    await h.bridge.mirrorFragment(m.id);
    await mount(h);

    await waitFor(() => expect(screen.getByText('a mistake')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('a mistake'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('remove'));
      await Promise.resolve();
    });

    // Gone from the record, and the offer is standing.
    await waitFor(() => expect(screen.queryByText('a mistake')).toBeNull());
    expect(screen.getByText('bring back')).toBeTruthy();
    expect(h.tombstoned).toEqual([]);

    await act(async () => {
      fireEvent.press(screen.getByText('bring back'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('a mistake')).toBeTruthy());
    // And nothing was ever told to anyone.
    expect(h.tombstoned).toEqual([]);
    h.db.close();
  });

  it('publishes the removal once the eight seconds are up', async () => {
    const h = harness();
    await migrate(h.db);
    const m = await h.store.capture({ body: 'really gone' });
    await h.bridge.mirrorFragment(m.id);
    await mount(h);

    await waitFor(() => expect(screen.getByText('really gone')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('really gone'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('remove'));
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(8000);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(h.tombstoned).toEqual([m.id]));
    h.db.close();
  });

  it('stands where a typed date says, and comes back', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({ body: 'old thing', at: new Date(2024, 2, 14).getTime() });
    await h.store.capture({ body: 'new thing' });
    await mount(h);

    const field = screen.getByLabelText('capture');
    await act(async () => {
      fireEvent.changeText(field, 'march 2024');
    });
    await act(async () => {
      fireEvent(field, 'submitEditing');
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText(/you are in mar 2024/)).toBeTruthy());
    expect(screen.getByText('▲ back to the edge')).toBeTruthy();
    // The field took the date as a movement, not as material.
    expect((await h.store.loadRecord()).map((r) => r.body)).not.toContain('march 2024');

    await act(async () => {
      fireEvent.press(screen.getByText('▲ back to the edge'));
    });
    await waitFor(() => expect(screen.queryByText('▲ back to the edge')).toBeNull());
    h.db.close();
  });

  it('turns the field into Find with a slash, and says which reading it is doing', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({ body: 'the shared folder has three versions' });
    await h.store.capture({ body: 'ferry back is 16:40' });
    await mount(h);

    const field = screen.getByLabelText('capture');
    await act(async () => {
      fireEvent.changeText(field, '/folder');
    });

    await waitFor(() => expect(screen.getByText('in words')).toBeTruthy());
    expect(screen.getByText('the shared folder has three versions')).toBeTruthy();
    expect(screen.queryByText('ferry back is 16:40')).toBeNull();
    h.db.close();
  });

  it('offers guesses, and takes "not this" for an answer, when the words find nothing', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({ body: 'filing feels like work and it is not, really' });
    await mount(h);

    const field = screen.getByLabelText('capture');
    await act(async () => {
      fireEvent.changeText(field, '/filing work');
    });

    // "filing work" is not a substring of anything, so the words find nothing.
    await waitFor(() =>
      expect(screen.getByText('nothing with those words. close in meaning, maybe:')).toBeTruthy()
    );
    expect(screen.getByText('not this')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('not this'));
    });
    await waitFor(() => expect(screen.queryByText('not this')).toBeNull());
    h.db.close();
  });

  it('holds a moment above the record, and lets it go again', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({ body: 'boiler guy — Tues between 12 and 3' });
    await mount(h);

    await waitFor(() =>
      expect(screen.getByText('boiler guy — Tues between 12 and 3')).toBeTruthy()
    );
    await act(async () => {
      fireEvent.press(screen.getByText('boiler guy — Tues between 12 and 3'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('hold'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText(/^held · from /)).toBeTruthy());
    expect((await h.store.heldIds()).length).toBe(1);

    await act(async () => {
      fireEvent.press(screen.getByText('release'));
      await Promise.resolve();
    });
    await waitFor(async () => expect((await h.store.heldIds()).length).toBe(0));
    h.db.close();
  });

  it('says how long a moment stays open to change', async () => {
    const h = harness();
    await migrate(h.db);
    await mount(h);

    const field = screen.getByLabelText('capture');
    await act(async () => {
      fireEvent.changeText(field, 'just landed');
    });
    await act(async () => {
      fireEvent(field, 'submitEditing');
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText(/still yours to change · \d+s/)).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(12_000);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByText(/still yours to change/)).toBeNull());
    h.db.close();
  });

  it('corrects in place, keeps the earlier wording, and does not move the moment', async () => {
    const h = harness();
    await migrate(h.db);
    const m = await h.store.capture({ body: 'pasta water too salty' });
    await mount(h);

    await waitFor(() => expect(screen.getByText('pasta water too salty')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('pasta water too salty'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('correct'));
    });

    // Correcting states its contract before you commit to it.
    await waitFor(() =>
      expect(screen.getByText('wording only · date and earlier wording stay')).toBeTruthy()
    );

    const editor = screen.getByLabelText('correct the wording');
    await act(async () => {
      fireEvent.changeText(editor, 'pasta water too salty again. less.');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('save'));
      await Promise.resolve();
    });

    await waitFor(async () => {
      const after = await h.store.getFragment(m.id);
      expect(after!.body).toBe('pasta water too salty again. less.');
      expect(after!.previousBody).toBe('pasta water too salty');
      expect(after!.at).toBe(m.at);
    });
    h.db.close();
  });

  it('plays the launch lockup on a cold start, and never blocks the field', async () => {
    const h = harness();
    await migrate(h.db);
    const view = render(
      <RecordApp store={h.store} bridge={h.bridge} {...defaults} coldStart />
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('chinotto')).toBeTruthy();
    // The field is mounted and reachable underneath it from the first frame.
    expect(screen.getByLabelText('capture')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1900 + 520 + 50);
    });
    await waitFor(() => expect(screen.queryByText('chinotto')).toBeNull());
    view.unmount();
    h.db.close();
  });

  it('does not play the lockup on a warm resume', async () => {
    const h = harness();
    await migrate(h.db);
    await mount(h);
    expect(screen.queryByText('chinotto')).toBeNull();
    h.db.close();
  });
});
