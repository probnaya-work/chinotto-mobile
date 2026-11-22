import { serializeRecordWrite, type RecordDb } from './db';
import { getMeta, setMeta } from './migrate';
import { CAUSE_WINDOW_MS, resumeReturn, type SavedReturn } from './model/returns';
import { MS_DAY, MS_HOUR } from './model/time';
import type { ReminderNotifications } from './reminders';
import type { RecordStore } from './store';

export const RETURN_ALERT_PREFIX = 'chinotto-return:';
const KEY = 'return.alerts';
const DELAY = 4 * MS_HOUR;
const COOLDOWN = 7 * MS_DAY;
type Intent = { id: string; returnId: number; at: number };
type State = { enabledAt: number | null; lastAt: number | null; intent: Intent | null };
type ReturnStore = Pick<RecordStore, 'returnStatus' | 'getFragment' | 'heldIds' | 'closeReturn'>;

async function liveReturn(store: ReturnStore, saved: SavedReturn, now: number) {
  const age = now - saved.evidence.occurredAt;
  if (age < 0 || age > CAUSE_WINDOW_MS) return null;
  const [thought, cause, held] = await Promise.all([
    store.getFragment(saved.fragmentId), store.getFragment(saved.evidence.relatedId), store.heldIds(),
  ]);
  if (!thought || !cause || held.includes(thought.id)) return null;
  return resumeReturn(saved, [thought, cause], now);
}

export function createReturnAlerts(
  db: RecordDb, notifications: ReminderNotifications, newId: () => string, now = Date.now,
) {
  async function read(): Promise<State> {
    const value = await getMeta(db, KEY);
    return value ? JSON.parse(value) as State : { enabledAt: null, lastAt: null, intent: null };
  }
  const write = serializeRecordWrite((state: State) => setMeta(db, KEY, JSON.stringify(state)));
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>) {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  }
  async function clear(state: State) {
    if (!state.intent) return;
    await notifications.cancel(state.intent.id);
    await write({ ...state, intent: null });
  }

  return {
    enabled: async () => (await read()).enabledAt !== null,
    setEnabled: (enabled: boolean) => enqueue(async () => {
      const state = await read();
      if (enabled && state.enabledAt === null) {
        await write({ ...state, enabledAt: now() });
        if (await notifications.permission() === 'ask') await notifications.requestPermission();
      } else if (!enabled) {
        const disabled = { ...state, enabledAt: null };
        await write(disabled);
        await clear(disabled);
      }
    }),
    reconcile: (store: ReturnStore) => enqueue(async () => {
      let state = await read();
      if (state.enabledAt === null) { await clear(state); return; }
      const enabledAt = state.enabledAt;
      const { open, lastAt } = await store.returnStatus();
      if (!open || lastAt === null || lastAt < enabledAt || !await liveReturn(store, open, now())) {
        await clear(state);
        return;
      }
      if (state.intent && state.intent.returnId !== open.id) {
        await clear(state);
        state = { ...state, intent: null };
      }
      if (await notifications.permission() !== 'granted') return;
      const at = lastAt + DELAY;
      if (!state.intent) {
        if (at <= now() || at > open.evidence.occurredAt + CAUSE_WINDOW_MS ||
          (state.lastAt !== null && at - state.lastAt < COOLDOWN)) return;
        const intent = { id: RETURN_ALERT_PREFIX + newId(), returnId: open.id, at };
        state = { ...state, intent, lastAt: at };
        await write(state);
      }
      const intent = state.intent;
      if (intent && intent.at > now() && !(await notifications.pending()).some(({ id }) => id === intent.id)) {
        await notifications.schedule({ id: intent.id, at: intent.at, discreet: true });
      }
    }),
    open: (id: string, store: ReturnStore, active: () => boolean = () => true) => enqueue(async () => {
      const state = await read();
      if (state.intent?.id !== id) return null;
      const { open } = await store.returnStatus();
      const result = state.enabledAt !== null && open?.id === state.intent.returnId && state.intent.at <= now()
        ? await liveReturn(store, open, now()) : null;
      if (!active()) return null;
      const claimed = result && open ? await store.closeReturn(open.id, 'opened') : false;
      // The alert already arrived. Even if the OS cannot remove it, acknowledge this tap.
      await clear(state).catch(() => {});
      return claimed ? result : null;
    }),
  };
}

export type ReturnAlerts = ReturnType<typeof createReturnAlerts>;
