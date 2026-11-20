/**
 * The record surface, driven end to end.
 *
 * Renders the real `RecordApp` over a real SQLite database and the real store and bridge —
 * no mocked repository, no fake material. What is asserted is what somebody would see and
 * do: the two-tap rule, capture clearing the field before anything else, the twelve seconds,
 * the eight seconds, standing by typing a date, and Find as a mode of the field.
 */

import React from 'react';
import { Appearance, StatusBar, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createBridge } from '../bridge';
import { createRecordStore } from '../store';
import { RecordApp } from '../RecordApp';
import { protectRecordStore } from '../privacy';
import { AppearanceProvider } from '../ui/appearance';
import { LAUNCH_HOLD } from '../ui/Launch';
import { createReminders } from '../reminders';
import { postponeReminder, reminderPresets, reminderTime } from '../reminderTime';
import { testReminderNotifications } from '../__testsupport__/reminderNotifications';

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
    cancel: jest.fn(async () => {}),
    state: null,
    permission: 'granted' as const,
    requestPermission: jest.fn(async () => 'granted' as const),
    openSystemSettings: jest.fn(),
  },
  sync: { notice: null, onOpen: jest.fn() },
  update: { soft: false, availableVersion: null, onUpdate: jest.fn(), onLater: jest.fn() },
};

type AppProps = React.ComponentProps<typeof RecordApp>;

async function mount(h: ReturnType<typeof harness>, over: Partial<AppProps> = {}) {
  const view = render(
    <RecordApp store={h.store} bridge={h.bridge} {...defaults} {...over} />
  );
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
        screen.getByText('type anything, or hold the circle and talk. slide up to lock it.')
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

  it('keeps the last letter typed before return', async () => {
    const h = harness();
    await migrate(h.db);
    await mount(h);

    const field = screen.getByLabelText('capture');

    // Return is its own native event, arriving straight after the keystroke before it — so
    // both land before the surface has re-rendered. The submit handler used to be a render
    // behind, and dropped that last letter.
    await act(async () => {
      fireEvent.changeText(field, 'ferry back');
      fireEvent(field, 'submitEditing');
      await Promise.resolve();
    });

    await waitFor(async () => {
      const rows = await h.store.loadRecord();
      expect(rows.map((r) => r.body)).toEqual(['ferry back']);
    });
    h.db.close();
  });

  it('keeps the last letter of a correction, and of a continue', async () => {
    const h = harness();
    await migrate(h.db);
    const m = await h.store.capture({ body: 'ferry at 18:40' });
    await mount(h);

    // Open the moment, then correct it and press return in the same breath.
    await act(async () => {
      fireEvent.press(screen.getByText('ferry at 18:40'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByText('correct'));
      await Promise.resolve();
    });
    const field = screen.getByLabelText('correct the wording');
    await act(async () => {
      fireEvent.changeText(field, 'ferry at 16:40');
      fireEvent(field, 'submitEditing');
      await Promise.resolve();
    });

    await waitFor(async () => {
      const rows = await h.store.loadRecord();
      expect(rows.find((r) => r.id === m.id)?.body).toBe('ferry at 16:40');
    });
    h.db.close();
  });

  it('is one line again the moment the words leave it, focus or no focus', async () => {
    const h = harness();
    await migrate(h.db);
    await mount(h);

    const styleOf = () =>
      StyleSheet.flatten(screen.getByLabelText('capture').props.style) as {
        height?: number;
        maxHeight?: number;
      };

    const field = screen.getByLabelText('capture');
    const oneLine = styleOf().height;
    expect(oneLine).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.changeText(field, 'a thought long enough to wrap several times over');
    });

    // With words in it the platform measures the text, and the cap keeps it off the record.
    expect(styleOf().height).toBeUndefined();
    expect(styleOf().maxHeight).toBe(220);

    await act(async () => {
      fireEvent(field, 'submitEditing');
      await Promise.resolve();
    });

    // The field still has focus here, which is exactly where iOS keeps the height it grew
    // to. An eight-line opaque edge over an empty field would cover the moment just taken.
    await waitFor(() => expect(styleOf().height).toBe(oneLine));
    h.db.close();
  });

  it('prepares iOS permissions without turning their answer into a recording', async () => {
    const h = harness();
    await migrate(h.db);
    const voice = {
      ...defaults.voice,
      permission: 'ask' as const,
      requestPermission: jest.fn(async () => 'granted' as const),
      start: jest.fn(async () => true),
    };
    const view = await mount(h, { voice });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('start recording'));
      await Promise.resolve();
    });

    expect(voice.requestPermission).toHaveBeenCalledTimes(1);
    expect(voice.start).not.toHaveBeenCalled();

    // Once prepared, a second deliberate tap is the one that records.
    await act(async () => {
      view.rerender(
        <RecordApp
          store={h.store}
          bridge={h.bridge}
          {...defaults}
          voice={{ ...voice, permission: 'granted' }}
        />
      );
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('start recording'));
      await Promise.resolve();
    });
    expect(voice.start).toHaveBeenCalledTimes(1);
    h.db.close();
  });

  it('uses one circle as a start-stop toggle', async () => {
    const h = harness();
    await migrate(h.db);
    const voice = { ...defaults.voice, start: jest.fn(async () => true), stop: jest.fn(async () => {}) };
    const view = await mount(h, { voice });

    // The element the finger goes down on.
    const circle = screen.getByLabelText('start recording');
    await act(async () => {
      fireEvent.press(circle);
      await Promise.resolve();
    });
    expect(voice.start).toHaveBeenCalled();

    // Recording starts, which is also what changes how the circle looks.
    await act(async () => {
      view.rerender(
        <RecordApp
          store={h.store}
          bridge={h.bridge}
          {...defaults}
          voice={{ ...voice, state: { phase: 'listening', seconds: 1, transcript: '', level: 0.5 } }}
        />
      );
      await Promise.resolve();
    });

    // The same element, still there. Drawing the speaking state as a different Pressable
    // unmounted the one the finger was on, and the release landed on nothing.
    expect(circle.props.accessibilityLabel).toBe('stop and save recording');
    await act(async () => {
      fireEvent.press(circle);
      await Promise.resolve();
    });
    expect(voice.stop).toHaveBeenCalled();
    h.db.close();
  });

  it('records while held and keeps the recording when the finger is released', async () => {
    const h = harness();
    await migrate(h.db);
    const voice = { ...defaults.voice, start: jest.fn(async () => true), stop: jest.fn(async () => {}) };
    await mount(h, { voice });

    const gesture = screen.getByTestId('voice-gesture');
    await act(async () => {
      fireEvent(gesture, 'responderGrant', { nativeEvent: { pageY: 600 } });
      await Promise.resolve();
    });
    expect(voice.start).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(400));
    await act(async () => {
      fireEvent(gesture, 'responderRelease', { nativeEvent: { pageY: 600 } });
      await Promise.resolve();
    });
    expect(voice.stop).toHaveBeenCalledTimes(1);
    h.db.close();
  });

  it('locks a held recording when the finger slides up', async () => {
    const h = harness();
    await migrate(h.db);
    const voice = { ...defaults.voice, start: jest.fn(async () => true), stop: jest.fn(async () => {}) };
    const view = await mount(h, { voice });

    const gesture = screen.getByTestId('voice-gesture');
    await act(async () => {
      fireEvent(gesture, 'responderGrant', { nativeEvent: { pageY: 600 } });
      fireEvent(gesture, 'responderMove', { nativeEvent: { pageY: 560 } });
      fireEvent(gesture, 'responderRelease', { nativeEvent: { pageY: 560 } });
      await Promise.resolve();
    });
    expect(voice.start).toHaveBeenCalledTimes(1);
    expect(voice.stop).not.toHaveBeenCalled();

    await act(async () => {
      view.rerender(
        <RecordApp
          store={h.store}
          bridge={h.bridge}
          {...defaults}
          voice={{ ...voice, state: { phase: 'listening', seconds: 1, transcript: '', level: 0.5 } }}
        />
      );
      await Promise.resolve();
    });
    expect(screen.getByText('locked · tap the square to keep')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('stop and save recording'));
      await Promise.resolve();
    });
    expect(voice.stop).toHaveBeenCalledTimes(1);
    h.db.close();
  });

  it('locks a fast upward flick even when its move event was coalesced', async () => {
    const h = harness();
    await migrate(h.db);
    const voice = { ...defaults.voice, start: jest.fn(async () => true), stop: jest.fn(async () => {}) };
    await mount(h, { voice });

    const gesture = screen.getByTestId('voice-gesture');
    await act(async () => {
      fireEvent(gesture, 'responderGrant', { nativeEvent: { pageY: 600 } });
      fireEvent(gesture, 'responderRelease', { nativeEvent: { pageY: 520 } });
      await Promise.resolve();
    });

    expect(voice.start).toHaveBeenCalledTimes(1);
    expect(voice.stop).not.toHaveBeenCalled();
    h.db.close();
  });

  it('offers a quiet discard action that does not save the recording', async () => {
    const h = harness();
    await migrate(h.db);
    const voice = {
      ...defaults.voice,
      stop: jest.fn(async () => {}),
      cancel: jest.fn(async () => {}),
      state: { phase: 'listening' as const, seconds: 3, transcript: 'not this one', level: 0.4 },
    };
    await mount(h, { voice });

    expect(screen.getByText('discard')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('discard recording'));
      await Promise.resolve();
    });

    expect(voice.cancel).toHaveBeenCalledTimes(1);
    expect(voice.stop).not.toHaveBeenCalled();
    h.db.close();
  });

  it('honours a stop tap while the microphone is still opening', async () => {
    const h = harness();
    await migrate(h.db);

    // Starting is not instant: the session, the engine, the file, and the first time round
    // two permission prompts. A quick press is over long before any of it.
    let release: (() => void) | null = null;
    const opening = new Promise<boolean>((resolve) => {
      release = () => resolve(true);
    });
    const voice = {
      ...defaults.voice,
      start: jest.fn(() => opening),
      stop: jest.fn(async () => {}),
    };
    const view = await mount(h, { voice });

    const circle = screen.getByLabelText('start recording');
    await act(async () => {
      fireEvent.press(circle);
      await Promise.resolve();
    });

    await act(async () => {
      view.rerender(
        <RecordApp
          store={h.store}
          bridge={h.bridge}
          {...defaults}
          voice={{ ...voice, state: { phase: 'starting', seconds: 0, transcript: '', level: 0 } }}
        />
      );
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('stop and save recording'));
      await Promise.resolve();
    });

    // The release has been spent on a recording that had not begun.
    expect(voice.stop).toHaveBeenCalledTimes(1);

    // Now the microphone opens.
    await act(async () => {
      release?.();
      await opening;
      await Promise.resolve();
    });

    // And it is ended again, as if the release had waited — rather than running on until
    // something else was pressed.
    expect(voice.stop).toHaveBeenCalledTimes(2);
    h.db.close();
  });

  it('marks a recording discarded even while the microphone is still opening', async () => {
    const h = harness();
    await migrate(h.db);

    let release: (() => void) | null = null;
    const opening = new Promise<boolean>((resolve) => {
      release = () => resolve(true);
    });
    const voice = {
      ...defaults.voice,
      start: jest.fn(() => opening),
      stop: jest.fn(async () => {}),
      cancel: jest.fn(async () => {}),
    };
    const view = await mount(h, { voice });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('start recording'));
      await Promise.resolve();
      view.rerender(
        <RecordApp
          store={h.store}
          bridge={h.bridge}
          {...defaults}
          voice={{ ...voice, state: { phase: 'starting', seconds: 0, transcript: '', level: 0 } }}
        />
      );
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('discard recording'));
      await Promise.resolve();
    });

    // The capture is marked discarded before native code can race back with a final file.
    expect(voice.cancel).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
      await opening;
      await Promise.resolve();
    });
    // And the stop is repeated once the microphone really exists.
    expect(voice.cancel).toHaveBeenCalledTimes(2);
    expect(voice.stop).not.toHaveBeenCalled();
    h.db.close();
  });

  it('starts listening for the widget, and does not end it for not being held', async () => {
    const h = harness();
    await migrate(h.db);
    const voice = { ...defaults.voice, start: jest.fn(async () => true), stop: jest.fn(async () => {}) };
    const view = await mount(h, { voice });

    await act(async () => {
      view.rerender(
        <RecordApp store={h.store} bridge={h.bridge} {...defaults} voice={voice} voiceOnOpen />
      );
      await Promise.resolve();
    });
    // The effect has to have run before its timer can be advanced.
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(voice.start).toHaveBeenCalled();
    // There is no finger behind a widget recording, so the guard that ends a recording
    // nobody is holding must not apply to it — it ends by pressing the circle.
    expect(voice.stop).not.toHaveBeenCalled();
    h.db.close();
  });

  it('keeps the recording on a second voice widget tap', async () => {
    const h = harness();
    await migrate(h.db);
    const voice = {
      ...defaults.voice,
      stop: jest.fn(async () => {}),
      state: { phase: 'listening' as const, seconds: 3, transcript: 'olá', level: 0.5 },
    };
    const view = await mount(h, { voice });

    await act(async () => {
      view.rerender(
        <RecordApp store={h.store} bridge={h.bridge} {...defaults} voice={voice} voiceOnOpen />
      );
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(voice.stop).toHaveBeenCalledTimes(1);
    expect(voice.start).not.toHaveBeenCalled();
    h.db.close();
  });

  it('says why nothing happened when the widget asks and the microphone is off', async () => {
    const h = harness();
    await migrate(h.db);
    const voice = {
      ...defaults.voice,
      permission: 'denied' as const,
      start: jest.fn(async () => true),
    };
    const view = await mount(h, { voice });

    await act(async () => {
      view.rerender(
        <RecordApp store={h.store} bridge={h.bridge} {...defaults} voice={voice} voiceOnOpen />
      );
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });

    // Silence would be the worst answer here: the widget was pressed and nothing happened.
    expect(voice.start).not.toHaveBeenCalled();
    expect(screen.getByText(/open settings/)).toBeTruthy();
    h.db.close();
  });

  it('says how to undo a refusal, and only then offers a way out', async () => {
    const h = harness();
    await migrate(h.db);
    const voice = { ...defaults.voice, permission: 'denied' as const, start: jest.fn(async () => true) };
    await mount(h, { voice });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('start recording'));
      await Promise.resolve();
    });

    // A refusal is the one case where asking again is iOS Settings' job, not the app's.
    expect(voice.start).not.toHaveBeenCalled();
    expect(screen.getByText(/open settings/)).toBeTruthy();
    h.db.close();
  });

  it('shows a moment that something else wrote, without being restarted', async () => {
    const h = harness();
    await migrate(h.db);
    const view = await mount(h);

    // A voice capture settles in `record/voice.ts`; a share lands in the intake. Neither is
    // this surface, and neither used to make it read the record again — the moment existed
    // and went on not being drawn.
    await h.store.capture({
      body: '',
      method: 'voice',
      voice: { audioPath: 'chinotto/audio/f1.m4a', durationMs: 4000 },
    });

    expect(screen.queryByLabelText(/^play /)).toBeNull();

    await act(async () => {
      view.rerender(
        <RecordApp store={h.store} bridge={h.bridge} {...defaults} changedAt={1} />
      );
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByLabelText(/^play /)).toBeTruthy());
    h.db.close();
  });

  it('keeps a "not this" for good, and stops guessing it', async () => {
    const h = harness();
    await migrate(h.db);
    // Shared vocabulary, no shared phrase — which is what makes it a guess rather than a
    // fact, and therefore something to be asked about.
    await h.store.capture({ body: 'sorting is procrastination with a clear conscience' });
    const mine = await h.store.capture({
      body: 'conscience, procrastination, sorting: three words that never sit together',
    });
    await mount(h);

    await act(async () => {
      fireEvent.press(screen.getByText(/three words that never sit together/));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByText(/three words that never sit together/));
      await Promise.resolve();
    });

    // A guess says it is one, and asks.
    await waitFor(() => expect(screen.getByText(/a guess ·/)).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('not this'));
      await Promise.resolve();
    });

    // The verdict is canonical: it is written down, and it survives recomputation.
    const judged = await h.db.getAllAsync<{ judgement: string }>(
      'SELECT judgement FROM trace_judgements WHERE fragment_id = ?',
      mine.id
    );
    expect(judged.map((r) => r.judgement)).toEqual(['rejected']);
    await waitFor(() => expect(screen.queryByText(/a guess ·/)).toBeNull());
    h.db.close();
  });

  it('says the shelf is full rather than doing nothing', async () => {
    const h = harness();
    await migrate(h.db);
    // Five is the limit, and it refuses rather than evicting — there is no ordering on the
    // shelf, so choosing what to drop would be the product choosing for somebody.
    for (let i = 0; i < 5; i += 1) {
      const m = await h.store.capture({ body: `kept ${i}` });
      await h.store.hold(m.id);
    }
    const sixth = await h.store.capture({ body: 'one too many' });
    await mount(h);

    await act(async () => {
      fireEvent.press(screen.getByText('one too many'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByText('hold'));
      await Promise.resolve();
    });

    // The press used to throw into a floating promise and do nothing at all, which reads
    // as a broken button rather than as a full shelf.
    await waitFor(() => expect(screen.getByText(/already keeping 5 present/)).toBeTruthy());
    expect(await h.store.heldIds()).not.toContain(sixth.id);
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
    // Typing a date means the field is in hand: it has focus when the movement happens.
    await act(async () => {
      fireEvent(field, 'focus');
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

    // Standing unmounted the field, which therefore never said it lost focus — and the
    // caret is drawn from that flag. The edge used to come back from standing bare.
    expect(screen.getByLabelText('start typing')).toBeTruthy();
    h.db.close();
  });

  it('turns the field into Find and reports literal matches without a cosmetic mode switch', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({ body: 'the shared folder has three versions' });
    await h.store.capture({ body: 'ferry back is 16:40' });
    await mount(h);

    const field = screen.getByLabelText('capture');
    await act(async () => {
      fireEvent.changeText(field, '/folder');
    });

    await waitFor(() => expect(screen.getByText('1 · in words')).toBeTruthy());
    expect(screen.getByText('the shared folder has three versions')).toBeTruthy();
    expect(screen.queryByText('ferry back is 16:40')).toBeNull();

    expect(screen.queryByLabelText(/change the reading/)).toBeNull();
    expect(screen.queryByText('by meaning')).toBeNull();
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
      expect(screen.getByText('nothing with those words. shared words, maybe:')).toBeTruthy()
    );
    expect(screen.getByText('not this')).toBeTruthy();
    expect(screen.getByText(/2 shared words/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('not this'));
    });
    await waitFor(() => expect(screen.queryByText('not this')).toBeNull());
    expect(screen.getByText('nothing with those words.')).toBeTruthy();
    h.db.close();
  });

  it('leaves an unrelated search empty instead of presenting arbitrary private material', async () => {
    const h = harness();
    await migrate(h.db);
    await h.store.capture({ body: 'a long unrelated thought kept in the record' });
    await mount(h);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('capture'), '/qzvmpk73019');
    });

    await waitFor(() => expect(screen.getByText('nothing with those words.')).toBeTruthy());
    expect(screen.queryByText('a long unrelated thought kept in the record')).toBeNull();
    expect(screen.queryByText('not this')).toBeNull();
    expect((await h.store.loadRecord()).map((m) => m.body)).toEqual([
      'a long unrelated thought kept in the record',
    ]);
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
    expect(screen.getByLabelText('by PROBNAYA')).toBeTruthy();
    // The field is mounted and reachable underneath it from the first frame.
    expect(screen.getByLabelText('capture')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(LAUNCH_HOLD + 520 + 50);
    });
    await waitFor(() => expect(screen.queryByText('chinotto')).toBeNull());
    view.unmount();
    h.db.close();
  });

  it('still plays the lockup when the fonts arrive after the record does', async () => {
    const h = harness();
    await migrate(h.db);

    // What actually happens on a launch: `coldStart` is `coldStart && fontsReady`, and the
    // record is drawn before the fonts are in. It arrives false and turns true a moment
    // later — which is exactly when nothing was looking, so the lockup never played.
    const view = render(
      <RecordApp store={h.store} bridge={h.bridge} {...defaults} coldStart={false} />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('chinotto')).toBeNull();

    // A production cold start can spend longer than the entire animation loading fonts.
    // That time must not consume the lockup's own hold once it finally becomes visible.
    await act(async () => {
      jest.advanceTimersByTime(LAUNCH_HOLD + 1_000);
    });

    await act(async () => {
      view.rerender(<RecordApp store={h.store} bridge={h.bridge} {...defaults} coldStart />);
      await Promise.resolve();
    });

    expect(screen.getByText('chinotto')).toBeTruthy();
    expect(screen.getByLabelText('capture')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(LAUNCH_HOLD - 1);
    });
    expect(screen.getByLabelText('by PROBNAYA')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1 + 520 + 50);
    });
    await waitFor(() => expect(screen.queryByText('chinotto')).toBeNull());

    // And it is once per launch: a later flip of the prop does not replay it.
    await act(async () => {
      view.rerender(
        <RecordApp store={h.store} bridge={h.bridge} {...defaults} coldStart={false} />
      );
      view.rerender(<RecordApp store={h.store} bridge={h.bridge} {...defaults} coldStart />);
      await Promise.resolve();
    });
    expect(screen.queryByText('chinotto')).toBeNull();
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

describe('visible Find', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(T0); });
  afterEach(() => jest.useRealTimers());
  it('borrows the capture field and restores a draft without saving the query', async () => {
    const h = harness(); await migrate(h.db);
    const backRef = { current: null } as React.MutableRefObject<(() => boolean) | null>;
    const view = await mount(h, { backRef });
    const field = screen.getByLabelText('capture');
    await act(async () => { fireEvent.changeText(field, 'unfinished thought'); });
    await act(async () => { fireEvent.press(screen.getByLabelText('Find in the Record')); });
    expect(screen.getByLabelText('capture').props.value).toBe('/');
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('capture'), '/query');
      fireEvent(screen.getByLabelText('capture'), 'submitEditing');
    });
    expect(await h.store.loadRecord()).toEqual([]);
    await act(async () => { fireEvent.press(screen.getByLabelText('back to capture')); });
    expect(screen.getByLabelText('capture').props.value).toBe('unfinished thought');
    await act(async () => { fireEvent.press(screen.getByLabelText('Find in the Record')); });
    await act(async () => { expect(backRef.current?.()).toBe(true); });
    expect(screen.getByLabelText('capture').props.value).toBe('unfinished thought');
    view.unmount(); h.db.close();
  });
});

describe('first-week Returns on the real Record', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(T0); });
  afterEach(() => jest.useRealTimers());
  it('arrives after a relevant capture, survives remount and remembers let go', async () => {
    const h = harness(); await migrate(h.db);
    await h.store.capture({ id: 'old', body: 'a quiet place for thinking', at: T0 - 7 * 864e5 });
    let view = await mount(h);
    await act(async () => { await jest.advanceTimersByTimeAsync(1700); });
    expect(screen.queryByText(/^back from/)).toBeNull();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('capture'), 'a quiet place for thinking again');
      fireEvent(screen.getByLabelText('capture'), 'submitEditing');
    });
    await act(async () => { await jest.advanceTimersByTimeAsync(1700); });
    expect(screen.getByText(/^back from/)).toBeTruthy();
    const id = (await h.store.returnStatus()).open!.id;
    view.unmount(); view = await mount(h);
    await act(async () => { await jest.advanceTimersByTimeAsync(1700); });
    expect(screen.getByText(/^back from/)).toBeTruthy();
    expect((await h.store.returnStatus()).open!.id).toBe(id);
    await act(async () => { fireEvent.press(screen.getByLabelText('let go')); await jest.advanceTimersByTimeAsync(500); });
    expect((await h.store.returnStatus()).open).toBeNull();
    view.unmount(); view = await mount(h);
    await act(async () => { await jest.advanceTimersByTimeAsync(1700); });
    expect(screen.queryByText(/^back from/)).toBeNull();
    expect(await h.store.getFragment('old')).not.toBeNull();
    view.unmount(); h.db.close();
  });
  it('does not spend a Return while somebody is searching or drafting', async () => {
    const h = harness(); await migrate(h.db);
    await h.store.capture({ id: 'old', body: 'a quiet place for thinking', at: T0 - 7 * 864e5 });
    await h.store.capture({ id: 'new', body: 'a quiet place for thinking again' });
    const view = await mount(h);
    await act(async () => { fireEvent.press(screen.getByLabelText('Find in the Record')); });
    await act(async () => { await jest.advanceTimersByTimeAsync(1700); });
    expect((await h.store.returnStatus()).open).toBeNull();
    await act(async () => { fireEvent.press(screen.getByLabelText('back to capture')); fireEvent.changeText(screen.getByLabelText('capture'), 'a draft'); });
    await act(async () => { await jest.advanceTimersByTimeAsync(1700); });
    expect((await h.store.returnStatus()).open).toBeNull();
    await act(async () => { fireEvent.changeText(screen.getByLabelText('capture'), ''); });
    await act(async () => { await jest.advanceTimersByTimeAsync(1700); });
    expect((await h.store.returnStatus()).open).not.toBeNull();
    view.unmount(); h.db.close();
  });

});


describe('protected Record', () => {
  it.each(['light', 'dark'] as const)('restores %s status-bar content after cancelled authentication without losing capture', async (choice) => {
    const h = harness(); await migrate(h.db);
    await h.store.capture({ body: 'private history' });
    const read = jest.spyOn(h.store, 'loadRecord');
    const style = jest.spyOn(StatusBar, 'setBarStyle').mockImplementation(() => {});
    const scheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
    await AsyncStorage.setItem('chinotto.record.appearance', JSON.stringify({ choice, contrast: false }));
    const store = protectRecordStore(h.store, () => false);
    const privacy = { locked: true, busy: true, error: null, onUnlock: jest.fn() };
    const ui = (busy: boolean) => <AppearanceProvider><RecordApp {...defaults}
      store={store} bridge={h.bridge} privacy={{ ...privacy, busy }} /></AppearanceProvider>;
    const view = render(ui(true));
    await waitFor(() => expect(screen.getByLabelText('capture').props.keyboardAppearance).toBe(choice));
    const field = screen.getByLabelText('capture');
    fireEvent.changeText(field, 'unfinished after cancellation');
    style.mockClear();
    view.rerender(ui(false));
    expect(style).toHaveBeenLastCalledWith(choice === 'light' ? 'dark-content' : 'light-content', false);
    expect(screen.getByLabelText('capture')).toBe(field);
    expect(field.props.value).toBe('unfinished after cancellation');
    expect(screen.queryByText('private history')).toBeNull();
    expect(read).not.toHaveBeenCalled();
    view.unmount(); h.db.close();
    style.mockRestore(); scheme.mockRestore();
    await AsyncStorage.removeItem('chinotto.record.appearance');
  });

  it('keeps opening feedback until the authenticated read finishes, without gating capture', async () => {
    const h = harness(); await migrate(h.db);
    await h.store.capture({ body: 'private history' });
    const rows = await h.store.loadRecord();
    let finishRead!: (value: typeof rows) => void;
    jest.spyOn(h.store, 'loadRecord').mockImplementation(() => new Promise((resolve) => { finishRead = resolve; }));
    let open = false;
    const store = protectRecordStore(h.store, () => open);
    const privacy = { locked: true, busy: true, error: null, onUnlock: jest.fn() };
    const view = await mount(h, { store, privacy });
    fireEvent.changeText(screen.getByLabelText('capture'), 'unfinished thought');
    open = true;
    await act(async () => {
      view.rerender(<RecordApp {...defaults} store={store} bridge={h.bridge}
        privacy={{ ...privacy, locked: false, busy: false }} />);
    });
    expect(screen.getByRole('progressbar', { name: 'Opening the Record' })).toBeTruthy();
    expect(screen.queryByText('private history')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('capture'), 'still typing while opening');
    await act(async () => { finishRead(rows); });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('private history')).toBeTruthy();
    expect(screen.getByLabelText('capture').props.value).toBe('still typing while opening');
    view.unmount(); h.db.close();
  });

  it('shows opening feedback during authentication without reading history or losing capture', async () => {
    const h = harness(); await migrate(h.db);
    await h.store.capture({ body: 'private history' });
    const read = jest.spyOn(h.store, 'loadRecord');
    const store = protectRecordStore(h.store, () => false);
    const privacy = { locked: true, busy: false, error: null, onUnlock: jest.fn() };
    const view = await mount(h, { store, privacy });
    fireEvent.changeText(screen.getByLabelText('capture'), 'unfinished thought');
    view.rerender(<RecordApp {...defaults} store={store} bridge={h.bridge} privacy={{ ...privacy, busy: true }} />);
    expect(screen.getByRole('progressbar', { name: 'Opening the Record' })).toBeTruthy();
    expect(screen.getByLabelText('capture').props.value).toBe('unfinished thought');
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByText('private history')).toBeNull();
    // Cancelling ends the feedback immediately, retaining capture and the retry action.
    view.rerender(<RecordApp {...defaults} store={store} bridge={h.bridge} privacy={privacy} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByLabelText('capture').props.value).toBe('unfinished thought');
    expect(screen.getByLabelText('open the record').props.accessibilityState?.disabled).not.toBe(true);
    view.unmount(); h.db.close();
  });

  it.each(['new locked capture', '/new locked capture'])('keeps cold history unread while saving %s without disclosure', async (wording) => {
    const h = harness(); await migrate(h.db);
    await h.store.capture({ body: 'private history' });
    const read = jest.spyOn(h.store, 'loadRecord');
    const store = protectRecordStore(h.store, () => false);
    const onUnlock = jest.fn();
    await mount(h, { store, privacy: { locked: true, busy: false, error: null, onUnlock } });
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByText('private history')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('capture'), wording);
    await act(async () => { fireEvent.press(screen.getByLabelText('leave it')); });
    expect(screen.getByText('saved on this phone.')).toBeTruthy();
    expect(screen.queryByText(wording)).toBeNull();
    fireEvent.press(screen.getByLabelText('open the record'));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect((await h.store.loadRecord()).map((m) => m.body)).toContain(wording);
    h.db.close();
  });

  it('preserves capture and Find wording across locking and authentication', async () => {
    const h = harness(); await migrate(h.db);
    await h.store.capture({ body: 'private history' });
    let open = true;
    const store = protectRecordStore(h.store, () => open);
    const view = await mount(h, { store });
    fireEvent.changeText(screen.getByLabelText('capture'), 'unfinished capture');
    fireEvent.press(screen.getByLabelText('Find in the Record'));
    fireEvent.changeText(screen.getByLabelText('capture'), '/private');
    open = false;
    view.rerender(<RecordApp {...defaults} store={store} bridge={h.bridge}
      privacy={{ locked: true, busy: false, error: null, onUnlock: () => {} }} />);
    expect(screen.queryByText('private history')).toBeNull();
    expect(screen.getByLabelText('capture').props.value).toBe('unfinished capture');
    fireEvent.changeText(screen.getByLabelText('capture'), 'unfinished capture, later');
    open = true;
    await act(async () => { view.rerender(<RecordApp {...defaults} store={store} bridge={h.bridge} />); });
    expect(screen.getByLabelText('capture').props.value).toBe('/private');
    fireEvent.press(screen.getByLabelText('back to capture'));
    expect(screen.getByLabelText('capture').props.value).toBe('unfinished capture, later');
    h.db.close();
  });
});


describe('thought reminders through the reader', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
  });
  afterEach(() => jest.useRealTimers());

  it('keeps the chosen time through denial, then sets, postpones and cancels one alert', async () => {
    const h = harness();
    await migrate(h.db);
    const thought = await h.store.capture({ body: 'read this on the walk' });
    const ios = testReminderNotifications('ask');
    let sequence = 0;
    const reminders = createReminders(h.db, ios.notifications, () => `fixture-${++sequence}`);
    const view = await mount(h, { reminders });

    expect(ios.notifications.requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByText('remind me')).toBeNull();
    fireEvent.press(screen.getByText(thought.body));
    fireEvent.press(screen.getByText(thought.body));
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'remind me' })); });
    const chosen = reminderPresets(T0)[1].at;
    expect(screen.getAllByText(reminderTime(chosen)).length).toBeGreaterThan(0);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'set reminder' })); });
    expect(screen.getByText('a reminder on this iphone')).toBeTruthy();
    expect(ios.notifications.requestPermission).not.toHaveBeenCalled();
    ios.setPermission('denied');
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'continue to system prompt' })); });
    expect(screen.getByText('notifications are off')).toBeTruthy();
    expect(screen.getAllByText(reminderTime(chosen)).length).toBeGreaterThan(0);
    expect(await reminders.get(thought.id)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /open iPhone Settings/ }));
    expect(defaults.voice.openSystemSettings).toHaveBeenCalled();

    ios.setPermission('granted');
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'check and set reminder' })); });
    expect((await reminders.get(thought.id))?.at).toBe(chosen);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: /^reminder · / })); });
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: /postpone one day/ })); });
    expect((await reminders.get(thought.id))?.at).toBe(postponeReminder(chosen));
    expect(ios.armed.size).toBe(1);
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: /^reminder · / })); });
    fireEvent.press(screen.getByRole('button', { name: 'cancel reminder ›' }));
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'cancel reminder' })); });
    expect(await reminders.get(thought.id)).toBeNull();
    expect(ios.armed.size).toBe(0);
    expect(screen.getAllByText(thought.body).length).toBeGreaterThan(0);
    view.unmount();
    h.db.close();
  });

  it('waits for device protection before following the alert and retains the capture draft', async () => {
    const h = harness();
    await migrate(h.db);
    const thought = await h.store.capture({ body: 'only after unlocking' });
    const ios = testReminderNotifications();
    const reminders = createReminders(h.db, ios.notifications, () => 'fixture');
    const saved = await reminders.save(thought.id, T0 + 60_000);
    jest.setSystemTime(T0 + 120_000);
    const resolve = jest.spyOn(reminders, 'resolve');
    const onReminderHandled = jest.fn();
    let open = false;
    const store = protectRecordStore(h.store, () => open);
    const privacy = { locked: true, busy: false, error: null, onUnlock: jest.fn() };
    const reminderRequest = saved.reminder.id;
    const view = await mount(h, { store, privacy, reminders, reminderRequest, onReminderHandled });
    fireEvent.changeText(screen.getByLabelText('capture'), 'my unfinished thought');
    expect(screen.queryByText(thought.body)).toBeNull();
    expect(resolve).not.toHaveBeenCalled();

    open = true;
    await act(async () => {
      view.rerender(<RecordApp {...defaults} store={store} bridge={h.bridge} reminders={reminders}
        reminderRequest={reminderRequest} onReminderHandled={onReminderHandled} privacy={{ ...privacy, locked: false }} />);
    });
    expect(screen.getByText('a reminder you set')).toBeTruthy();
    expect(onReminderHandled).toHaveBeenCalledWith(reminderRequest);
    expect(screen.getByLabelText('capture').props.value).toBe('my unfinished thought');
    view.unmount();
    h.db.close();
  });
});
