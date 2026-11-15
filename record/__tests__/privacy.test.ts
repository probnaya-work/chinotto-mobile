import { createPrivacy, protectRecordStore, RecordLocked, type PrivacyPort, type PrivacyState } from '../privacy';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
function harness(enabled = true) {
  let state: PrivacyState = { enabled, locked: enabled, epoch: 0 };
  const auth = jest.fn<Promise<{ success: boolean; error?: string }>, []>(async () => ({ success: true }));
  const port: PrivacyPort = {
    state: async () => ({ ...state }), authenticate: auth,
    complete: async (action, epoch) => {
      if (epoch !== state.epoch) throw new Error('stale');
      state = { ...state, enabled: action === 'enable' ? true : action === 'disable' ? false : state.enabled, locked: false };
      return { ...state };
    }, rendered: async () => {},
  };
  const privacy = createPrivacy(port);
  return { privacy, auth, background() { state = { ...state, locked: state.enabled, epoch: state.epoch + 1 }; privacy.background(); } };
}

it('cold starts closed, then honors an off preference without a prompt', async () => {
  const h = harness(false);
  expect(h.privacy.canRead()).toBe(false);
  await h.privacy.refresh();
  expect(h.privacy.canRead()).toBe(true);
  expect(h.auth).not.toHaveBeenCalled();
});

it.each(['user_cancel', 'system_cancel', 'app_cancel', 'lockout', 'not_enrolled', 'not_available', 'passcode_not_set', 'authentication_failed'])('keeps protected reading closed on %s', async (error) => {
  const h = harness(); await h.privacy.refresh();
  h.auth.mockResolvedValue({ success: false, error });
  expect(await h.privacy.request('unlock')).toBe(false);
  expect(h.privacy.canRead()).toBe(false);
  expect(h.privacy.snapshot().enabled).toBe(true);
});

it('authenticates setting changes and keeps the old preference on cancellation', async () => {
  const h = harness(false); await h.privacy.refresh();
  h.auth.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
  await h.privacy.request('enable');
  expect(h.privacy.snapshot().enabled).toBe(false);
  await h.privacy.request('enable');
  expect(h.privacy.snapshot().enabled).toBe(true);
  h.auth.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
  await h.privacy.request('disable');
  expect(h.privacy.snapshot().enabled).toBe(true);
  await h.privacy.request('disable');
  expect(h.privacy.snapshot().enabled).toBe(false);
});

it('shares one prompt and rejects success arriving after background', async () => {
  const h = harness(); await h.privacy.refresh();
  const auth = deferred<{ success: boolean }>(); h.auth.mockReturnValue(auth.promise);
  const first = h.privacy.request('unlock');
  expect(h.privacy.request('disable')).toBe(first);
  await Promise.resolve(); h.background(); auth.resolve({ success: true });
  expect(await first).toBe(false);
  expect(h.auth).toHaveBeenCalledTimes(1);
  expect(h.privacy.canRead()).toBe(false);
  expect(h.privacy.snapshot().enabled).toBe(true);
});

it('blocks private calls and stale results while retaining new capture', async () => {
  let open = false; let epoch = 0;
  const result = deferred<string[]>();
  const raw = { loadRecord: jest.fn(() => result.promise), capture: jest.fn(async () => 'saved') };
  const store = protectRecordStore(raw, () => open, () => epoch);
  await expect(store.loadRecord()).rejects.toBeInstanceOf(RecordLocked);
  expect(raw.loadRecord).not.toHaveBeenCalled();
  await expect(store.capture()).resolves.toBe('saved');
  open = true; const reading = store.loadRecord(); epoch++; result.resolve(['private']);
  await expect(reading).rejects.toBeInstanceOf(RecordLocked);
});
