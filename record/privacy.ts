/** Device-local read permission. Capture and background sync use the underlying store. */
export type PrivacyState = { enabled: boolean; locked: boolean; epoch: number };
export type PrivacyAction = 'unlock' | 'enable' | 'disable';
export type PrivacyPort = {
  state(): Promise<PrivacyState>;
  authenticate(): Promise<{ success: boolean; error?: string }>;
  complete(action: PrivacyAction, epoch: number): Promise<PrivacyState>;
  rendered(epoch: number): Promise<void>;
};

export class RecordLocked extends Error {
  constructor() { super('Open the Record with device authentication.'); }
}

export function createPrivacy(port: PrivacyPort) {
  let state: PrivacyState & { ready: boolean; busy: boolean; error: string | null } = {
    enabled: true, locked: true, epoch: -1, ready: false, busy: false, error: null,
  };
  const listeners = new Set<() => void>();
  let request: Promise<boolean> | null = null;
  let revision = 0;
  const publish = (next: Partial<typeof state>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const refresh = async () => {
    const current = ++revision;
    try {
      const next = await port.state();
      if (current === revision && next.epoch >= state.epoch) publish({ ...next, ready: true });
    } catch {
      if (current === revision) publish({ locked: true, ready: true, error: 'Device protection is unavailable. Try again.' });
    }
  };
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    canRead: () => state.ready && !state.locked,
    refresh,
    // Fail closed immediately, before the asynchronous native state arrives.
    background() { ++revision; publish({ locked: state.enabled || !state.ready, epoch: state.epoch + 1 }); },
    request(action: PrivacyAction): Promise<boolean> {
      if (request) return request;
      publish({ busy: true, error: null });
      request = (async () => {
        try {
          const before = await port.state();
          const result = await port.authenticate();
          if (!result.success) {
            publish({ error: ['user_cancel', 'system_cancel', 'app_cancel'].includes(result.error ?? '')
              ? null : 'Could not authenticate. Use your device code or try again.' });
            return false;
          }
          // Native completion rejects a success belonging to an earlier foreground session.
          const completed = await port.complete(action, before.epoch);
          const next = await port.state();
          if (next.epoch < state.epoch) return false;
          ++revision;
          publish({ ...next, ready: true });
          return completed.epoch === next.epoch && !next.locked;
        } catch {
          await refresh();
          publish({ error: 'Could not authenticate. Try again.' });
          return false;
        } finally { publish({ busy: false }); request = null; }
      })();
      return request;
    },
    rendered: () => port.rendered(state.epoch),
  };
}
export type RecordPrivacy = ReturnType<typeof createPrivacy>;

/** The UI never receives a private result that completed after a relock. */
export function protectRecordStore<T extends object>(store: T, canRead: () => boolean, epoch = () => 0): T {
  const privateOperations = new Set([
    'loadRecord', 'getFragment', 'wordingHistory', 'heldIds', 'traceJudgements', 'encountersOf',
    'correct', 'continueFrom', 'linkContinuation', 'hold', 'release', 'remove', 'bringBack',
    'undoSecondsLeft', 'judgeTrace', 'recordReturn', 'closeReturn', 'recentlyReturned',
    'returnStatus', 'audioPathOf',
  ]);
  return Object.fromEntries(Object.entries(store).map(([key, value]) => [key,
    privateOperations.has(key) && typeof value === 'function'
      ? async (...args: unknown[]) => {
        if (!canRead()) throw new RecordLocked();
        const started = epoch();
        const result = await value(...args);
        if (!canRead() || started !== epoch()) throw new RecordLocked();
        return result;
      } : value,
  ])) as T;
}
