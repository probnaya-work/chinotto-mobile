import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Quiet } from '../ui/Quiet';
import { composeQuietMessage, quietMessageNotice } from '../quietMessage';
import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createRecordStore } from '../store';
import { protectRecordStore } from '../privacy';
import { ChinottoApp } from '../ChinottoApp';
import { testAppServices } from '../__testsupport__/appServices';

jest.mock('../quietMessage', () => ({
  ...jest.requireActual('../quietMessage'), composeQuietMessage: jest.fn(),
}));

const compose = jest.mocked(composeQuietMessage);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Quiet walking scenario', () => {
  beforeEach(() => {
    compose.mockReset();
    jest.mocked(Linking.addEventListener).mockImplementation(() => ({ remove: jest.fn() }));
  });

  it.each(['sent', 'cancelled', 'failed', 'unavailable'] as const)(
    'returns from Message (%s), saves one thought, and stays in Quiet', async (result) => {
      const db = openTestDb();
      await migrate(db);
      const store = createRecordStore(db, { newId: () => 'quiet-thought' });
      const exit = jest.fn();
      compose.mockResolvedValue(result);
      const view = render(<Quiet visible capture={(body) => store.capture({ body, origin: 'mobile' })} onExit={exit} />);
      fireEvent.press(screen.getByLabelText('Message'));
      await waitFor(() => expect(screen.getByText(quietMessageNotice[result])).toBeTruthy());
      expect(screen.getByLabelText('What arrived?')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('What arrived?'));
      fireEvent.changeText(screen.getByLabelText('capture'), 'By the water, a thought arrived.');
      fireEvent.press(screen.getByLabelText('leave it'));
      await waitFor(() => expect(screen.getByText('Saved to your Record.')).toBeTruthy());
      expect(screen.queryByLabelText('capture')).toBeNull();
      expect((await store.loadRecord()).map((m) => m.body)).toEqual(['By the water, a thought arrived.']);
      expect(exit).not.toHaveBeenCalled();
      fireEvent.press(screen.getByLabelText('Back to Record'));
      expect(exit).toHaveBeenCalledTimes(1);
      view.unmount(); db.close();
    }
  );

  it('keeps a cancelled draft, including when Quiet is left and reopened', () => {
    const capture = jest.fn();
    const props = { capture, onExit: jest.fn() };
    const view = render(<Quiet visible {...props} />);
    fireEvent.press(screen.getByLabelText('What arrived?'));
    fireEvent.changeText(screen.getByLabelText('capture'), 'keep these words');
    fireEvent.press(screen.getByLabelText('Back to Quiet'));
    expect(screen.getByText(/Draft kept in Quiet/)).toBeTruthy();
    view.rerender(<Quiet visible={false} {...props} />);
    view.rerender(<Quiet visible {...props} />);
    fireEvent.press(screen.getByLabelText('What arrived?'));
    expect(screen.getByLabelText('capture').props.value).toBe('keep these words');
    expect(capture).not.toHaveBeenCalled();
  });

  it('keeps the draft and editor open after failure, then permits a retry', async () => {
    const capture = jest.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce({ id: 'saved' });
    render(<Quiet visible capture={capture} onExit={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('What arrived?'));
    fireEvent.changeText(screen.getByLabelText('capture'), 'a thought worth keeping');
    fireEvent.press(screen.getByLabelText('leave it'));
    await waitFor(() => expect(screen.getByText(/Could not save/)).toBeTruthy());
    expect(screen.getByLabelText('capture').props.value).toBe('a thought worth keeping');
    fireEvent.press(screen.getByLabelText('leave it'));
    await waitFor(() => expect(screen.getByText('Saved to your Record.')).toBeTruthy());
    expect(capture.mock.calls).toEqual([['a thought worth keeping'], ['a thought worth keeping']]);
  });

  it('allows only one local write when Return and Save arrive together', async () => {
    const pending = deferred<unknown>();
    const capture = jest.fn(() => pending.promise);
    render(<Quiet visible capture={capture} onExit={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('What arrived?'));
    const field = screen.getByLabelText('capture');
    fireEvent.changeText(field, 'one thought');
    await act(async () => {
      fireEvent(field, 'submitEditing');
      fireEvent(field, 'submitEditing');
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('capture').props.editable).toBe(false);
    await act(async () => { pending.resolve({ id: 'saved' }); });
    expect(screen.getByLabelText('What arrived?')).toBeTruthy();
  });

  it('does not open two system composers on a repeated Message tap', async () => {
    const pending = deferred<'cancelled'>();
    compose.mockReturnValue(pending.promise);
    render(<Quiet visible capture={jest.fn()} onExit={jest.fn()} />);
    const button = screen.getByLabelText('Message');
    await act(async () => { fireEvent.press(button); fireEvent.press(button); });
    expect(compose).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve('cancelled'); });
  });

  it('uses write-through capture while a protected Record remains unreadable', async () => {
    const db = openTestDb(); await migrate(db);
    const raw = createRecordStore(db, { newId: () => 'locked-quiet' });
    const protectedStore = protectRecordStore(raw, () => false);
    render(<Quiet visible capture={(body) => protectedStore.capture({ body })} onExit={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('What arrived?'));
    fireEvent.changeText(screen.getByLabelText('capture'), 'private moment');
    fireEvent.press(screen.getByLabelText('leave it'));
    await waitFor(() => expect(screen.getByText('Saved to your Record.')).toBeTruthy());
    await expect(protectedStore.loadRecord()).rejects.toThrow();
    expect((await raw.loadRecord()).map((m) => m.body)).toEqual(['private moment']);
    db.close();
  });

  it('lets someone read the Home Screen guide and resume their unfinished Record input', async () => {
    const db = openTestDb(); await migrate(db);
    const view = render(<ChinottoApp services={testAppServices(db, null, jest.fn())} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.changeText(screen.getByLabelText('capture'), 'a passing thought');
    fireEvent.press(screen.getByLabelText('Quiet Home Screen guide'));
    expect(screen.getByText('Quiet Home Screen')).toBeTruthy();
    expect(screen.queryByLabelText('capture')).toBeNull();
    fireEvent.press(screen.getByText('‹ Record'));
    expect(screen.getByLabelText('capture').props.value).toBe('a passing thought');
    expect((await db.getAllAsync('SELECT id FROM fragments'))).toHaveLength(0);
    view.unmount(); db.close();
  });

  it('returns from the existing Quiet widget route to a single saved entry in Record', async () => {
    const db = openTestDb(); await migrate(db);
    jest.mocked(Linking.getInitialURL).mockResolvedValueOnce('chinotto://quiet');
    const view = render(<ChinottoApp services={testAppServices(db, null, jest.fn())} />);
    await screen.findByTestId('quiet');
    fireEvent.press(screen.getByLabelText('What arrived?'));
    fireEvent.changeText(screen.getByLabelText('capture'), 'a single local moment');
    fireEvent.press(screen.getByLabelText('leave it'));
    await waitFor(() => expect(screen.getByText('Saved to your Record.')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Back to Record'));
    await waitFor(() => expect(screen.getByText('a single local moment')).toBeTruthy());
    expect((await db.getAllAsync<{ n: number }>('SELECT COUNT(*) AS n FROM fragments'))[0].n).toBe(1);
    view.unmount(); db.close();
  });

  it('opens Quiet from the widget, keeps a draft on re-entry, and routes text capture to Record', async () => {
    const listeners = new Set<(event: { url: string }) => void>();
    const listen = jest.spyOn(Linking, 'addEventListener').mockImplementation((_type, callback) => {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
    });
    const db = openTestDb(); await migrate(db);
    const view = render(<ChinottoApp services={testAppServices(db, null, jest.fn())} />);
    await act(async () => { await Promise.resolve(); });
    const open = async (url: string) => act(async () => {
      listeners.forEach((listener) => listener({ url }));
    });
    await open('chinotto://quiet');
    expect(screen.getByLabelText('Message')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('What arrived?'));
    fireEvent.changeText(screen.getByLabelText('capture'), 'draft by the water');
    await open('chinotto://quiet');
    expect(screen.getByLabelText('Message')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('What arrived?'));
    expect(screen.getByLabelText('capture').props.value).toBe('draft by the water');
    await open('chinotto://capture');
    expect(screen.queryByTestId('quiet')).toBeNull();
    expect(screen.getByLabelText('capture')).toBeTruthy();
    view.unmount(); db.close(); listen.mockRestore();
  });

  it('keeps a cold voice request through font loading and parent acknowledgement', async () => {
    const db = openTestDb(); await migrate(db);
    const services = testAppServices(db, null, jest.fn());
    function VoiceEntrance() {
      const [pending, setPending] = React.useState(true);
      return <ChinottoApp services={{ ...services, voiceOnOpen: pending,
        microphonePermission: () => 'denied', onVoiceOnOpenHandled: () => setPending(false) }} />;
    }
    const view = render(<VoiceEntrance />);
    await waitFor(() => expect(screen.getByText('open settings ›')).toBeTruthy());
    view.unmount(); db.close();
  });
});
