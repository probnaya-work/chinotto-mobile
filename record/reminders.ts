import { serializeRecordWrite, type RecordDb } from './db';
import { getMeta, setMeta } from './migrate';

export const REMINDER_PREFIX = 'chinotto-reminder:';
export type ReminderPermission = 'granted' | 'ask' | 'denied';
export type ReminderDelivery = 'alert' | 'in-app';
export type ThoughtReminder = {
  id: string;
  fragmentId: string;
  at: number;
  delivery: ReminderDelivery;
  discreet: 0 | 1;
};
export type ReminderPreferences = { paused: boolean; discreet: boolean };
export type ReminderStatus = 'scheduled' | 'paused' | 'alerts-off' | 'unavailable' | 'in-app' | 'ready';
type PendingAlert = { id: string; discreet: boolean };

export type ReminderNotifications = {
  permission: () => Promise<ReminderPermission>;
  requestPermission: () => Promise<ReminderPermission>;
  pending: () => Promise<PendingAlert[]>;
  schedule: (alert: PendingAlert & { at: number }) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  subscribe: (open: (id: string) => void) => () => void;
  acknowledge: (id: string) => void;
};

export class ReminderError extends Error {
  constructor(readonly reason: 'past' | 'denied' | 'paused' | 'gone') {
    super(reason);
  }
}

const PREFS_KEY = 'reminders.notifications';
const SELECT_LIVE = `
  SELECT r.id, r.fragment_id AS fragmentId, r.fire_at AS at, r.delivery, r.discreet
    FROM thought_reminders r
    JOIN fragments f ON f.id = r.fragment_id
   WHERE f.removed_at IS NULL`;

export function createReminders(
  db: RecordDb,
  notifications: ReminderNotifications,
  newId: () => string,
  now = Date.now,
) {
  // Serialize OS mutations independently of the Record's SQLite write queue.
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  }

  async function preferences(): Promise<ReminderPreferences> {
    const raw = await getMeta(db, PREFS_KEY);
    const [paused, discreet] = raw?.split(':') ?? [];
    return { paused: paused === 'paused', discreet: discreet !== 'generic' };
  }

  const put = serializeRecordWrite(async (reminder: ThoughtReminder) => {
    const result = await db.runAsync(`
      INSERT INTO thought_reminders (fragment_id, id, fire_at, delivery, discreet)
      SELECT id, ?, ?, ?, ? FROM fragments WHERE id = ? AND removed_at IS NULL
      ON CONFLICT(fragment_id) DO UPDATE SET id = excluded.id, fire_at = excluded.fire_at,
        delivery = excluded.delivery, discreet = excluded.discreet
    `, reminder.id, reminder.at, reminder.delivery, reminder.discreet, reminder.fragmentId);
    return result.changes > 0;
  });

  const drop = serializeRecordWrite((id: string) =>
    db.runAsync('DELETE FROM thought_reminders WHERE id = ?', id),
  );

  const pruneRemoved = serializeRecordWrite(() => db.runAsync(`
    DELETE FROM thought_reminders
     WHERE fragment_id IN (SELECT id FROM fragments WHERE removed_at IS NOT NULL)
  `));

  const writePreferences = serializeRecordWrite((value: ReminderPreferences) =>
    setMeta(db, PREFS_KEY, `${value.paused ? 'paused' : 'active'}:${value.discreet ? 'discreet' : 'generic'}`),
  );

  async function listIntents() {
    return db.getAllAsync<ThoughtReminder>(`${SELECT_LIVE} ORDER BY r.fire_at`);
  }

  /** SQLite holds intent. Reconcile only future, eligible alerts and never replay a backlog. */
  async function syncPending() {
    await pruneRemoved();
    const [live, prefs, queued, permission] = await Promise.all([
      listIntents(), preferences(), notifications.pending(), notifications.permission(),
    ]);
    const owned = new Map(live.map((reminder) => [reminder.id, reminder]));
    const pending = new Map(queued.map(({ id, discreet }) => [id, discreet]));
    const discreetFor = (reminder: ThoughtReminder) => prefs.discreet || reminder.discreet === 1;

    // Remove orphaned, paused, and replaced previews before arming any new requests.
    for (const [id, discreet] of pending) {
      const reminder = owned.get(id);
      if (!reminder || reminder.delivery === 'in-app' || prefs.paused ||
          (reminder.at > now() && discreet !== discreetFor(reminder))) {
        await notifications.cancel(id);
        pending.delete(id);
      }
    }

    const wanted = live.filter((reminder) =>
      reminder.at > now() && reminder.delivery === 'alert' && !prefs.paused && permission === 'granted'
    );
    let changed = false;
    for (const reminder of wanted) {
      const { id, at } = reminder;
      if (pending.has(id) || at <= now()) continue;
      try {
        await notifications.schedule({ id, at, discreet: discreetFor(reminder) });
        changed = true;
      } catch {
        // The date remains visible and retryable while it is in the future.
      }
    }
    const armed = changed
      ? new Map((await notifications.pending()).map(({ id, discreet }) => [id, discreet]))
      : pending;
    const scheduled = new Set(wanted.filter((reminder) =>
      armed.get(reminder.id) === discreetFor(reminder)).map(({ id }) => id));
    return { scheduled, complete: wanted.every(({ id, at }) => at <= now() || scheduled.has(id)) };
  }

  function statusOf(reminder: ThoughtReminder, prefs: ReminderPreferences, permission: ReminderPermission | null, pending: PendingAlert[]): ReminderStatus {
    if (reminder.delivery === 'in-app') return reminder.at <= now() ? 'ready' : 'in-app';
    if (prefs.paused) return 'paused';
    if (permission === null) return 'unavailable';
    if (permission !== 'granted') return 'alerts-off';
    return pending.some((alert) => alert.id === reminder.id && alert.discreet === (prefs.discreet || reminder.discreet === 1))
      ? 'scheduled' : 'unavailable';
  }

  return {
    permission: notifications.permission,
    requestPermission: notifications.requestPermission,
    preferences,
    reconcile: () => enqueue(syncPending),

    setPreferences: (next: ReminderPreferences) => enqueue(async () => {
      await writePreferences(next);
      try { return (await syncPending()).complete; }
      catch { return false; }
    }),

    get: (fragmentId: string) =>
      db.getFirstAsync<ThoughtReminder>(`${SELECT_LIVE} AND r.fragment_id = ?
        AND (r.fire_at > ? OR r.delivery = 'in-app')`, fragmentId, now()),

    list: () => enqueue(async () => {
      const [live, prefs, permission, pending] = await Promise.all([
        listIntents(), preferences(), notifications.permission().catch(() => null), notifications.pending().catch(() => []),
      ]);
      return live.filter((reminder) => reminder.at > now() || reminder.delivery === 'in-app')
        .map((reminder) => ({ ...reminder, status: statusOf(reminder, prefs, permission, pending) }));
    }),

    status: (reminder: ThoughtReminder) => enqueue(async () => {
      const [prefs, permission, pending] = await Promise.all([
        preferences(), notifications.permission().catch(() => null), notifications.pending().catch(() => []),
      ]);
      return statusOf(reminder, prefs, permission, pending);
    }),

    setDiscreet: (reminder: ThoughtReminder, discreet: 0 | 1) => enqueue(async () => {
      const current = await db.getFirstAsync<ThoughtReminder>(`${SELECT_LIVE} AND r.id = ?`, reminder.id);
      if (!current) throw new ReminderError('gone');
      const updated = { ...current, discreet };
      if (!await put(updated)) throw new ReminderError('gone');
      try { return { reminder: updated, applied: (await syncPending()).complete }; }
      catch { return { reminder: updated, applied: false }; }
    }),

    save: (fragmentId: string, at: number, delivery: ReminderDelivery = 'alert') => enqueue(async () => {
      if (!Number.isSafeInteger(at) || at <= now()) throw new ReminderError('past');
      const existing = await db.getFirstAsync<ThoughtReminder>(`${SELECT_LIVE} AND r.fragment_id = ?`, fragmentId);
      if (delivery === 'alert') {
        const { paused } = await preferences();
        if (paused && !(existing?.delivery === 'alert' && existing.at > now())) throw new ReminderError('paused');
        if (!paused && await notifications.permission() !== 'granted') throw new ReminderError('denied');
      }
      if (at <= now()) throw new ReminderError('past');
      const reminder = existing?.at === at && existing.delivery === delivery ? existing
        : { id: REMINDER_PREFIX + newId(), fragmentId, at, delivery, discreet: existing?.discreet ?? 0 };
      // A conversion to in-app must retire the old alert before claiming it is silent.
      const stopOldAlert = existing?.delivery === 'alert' && delivery === 'in-app';
      if (stopOldAlert) await notifications.cancel(existing.id);
      if (reminder !== existing && !await put(reminder)) throw new ReminderError('gone');
      try {
        if (existing && existing.id !== reminder.id && !stopOldAlert) await notifications.cancel(existing.id);
        return { reminder, scheduled: (await syncPending()).scheduled.has(reminder.id) };
      } catch {
        return { reminder, scheduled: false };
      }
    }),

    cancel: (id: string) => enqueue(async () => {
      await notifications.cancel(id);
      await drop(id);
    }),

    resolve: async (id: string) => {
      if (!id.startsWith(REMINDER_PREFIX)) return null;
      return db.getFirstAsync<ThoughtReminder>(`${SELECT_LIVE} AND r.id = ?`, id);
    },

    consume: (id: string) => enqueue(async () => {
      await drop(id);
      await notifications.cancel(id);
    }),
  };
}

export type Reminders = ReturnType<typeof createReminders>;
