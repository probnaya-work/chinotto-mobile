import { serializeRecordWrite, type RecordDb } from './db';

export const REMINDER_PREFIX = 'chinotto-reminder:';
export type ReminderPermission = 'granted' | 'ask' | 'denied';
export type ThoughtReminder = { id: string; fragmentId: string; at: number };

export type ReminderNotifications = {
  permission: () => Promise<ReminderPermission>;
  requestPermission: () => Promise<ReminderPermission>;
  pending: () => Promise<string[]>;
  schedule: (reminder: Pick<ThoughtReminder, 'id' | 'at'>) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  subscribe: (open: (id: string) => void) => () => void;
  acknowledge: (id: string) => void;
};

export class ReminderError extends Error {
  constructor(readonly reason: 'past' | 'denied' | 'gone') {
    super(reason);
  }
}

const SELECT_LIVE = `
  SELECT r.id, r.fragment_id AS fragmentId, r.fire_at AS at
    FROM thought_reminders r
    JOIN fragments f ON f.id = r.fragment_id
   WHERE f.removed_at IS NULL`;

export function createReminders(
  db: RecordDb,
  notifications: ReminderNotifications,
  newId: () => string,
  now = Date.now,
) {
  // The notification center is outside SQLite. Serialize its mutations without holding the
  // Record's write queue across permission prompts or native scheduling.
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  }

  const put = serializeRecordWrite(async (reminder: ThoughtReminder) => {
    const result = await db.runAsync(`
      INSERT INTO thought_reminders (fragment_id, id, fire_at)
      SELECT id, ?, ? FROM fragments WHERE id = ? AND removed_at IS NULL
      ON CONFLICT(fragment_id) DO UPDATE SET id = excluded.id, fire_at = excluded.fire_at
    `, reminder.id, reminder.at, reminder.fragmentId);
    return result.changes > 0;
  });

  const drop = serializeRecordWrite((id: string) =>
    db.runAsync('DELETE FROM thought_reminders WHERE id = ?', id),
  );

  const pruneRemoved = serializeRecordWrite(() => db.runAsync(`
    DELETE FROM thought_reminders
     WHERE fragment_id IN (SELECT id FROM fragments WHERE removed_at IS NOT NULL)
  `));

  /** SQLite holds intent. On restart, repair interrupted edits and remove orphaned requests. */
  async function syncPending(): Promise<Set<string>> {
    await pruneRemoved();
    const live = await db.getAllAsync<ThoughtReminder>(`${SELECT_LIVE} ORDER BY r.fire_at`);
    const future = live.filter(({ at }) => at > now());
    const wanted = new Set(live.map(({ id }) => id));
    const pending = new Set(await notifications.pending());

    // Clear replaced identifiers before scheduling the new ones. If the OS rejects a
    // cancellation, retry on the next foreground rather than arming two deliveries.
    for (const id of pending) {
      if (!wanted.has(id)) {
        await notifications.cancel(id);
        pending.delete(id);
      }
    }

    if (!future.length || await notifications.permission() !== 'granted') return new Set();

    let changed = false;
    for (const { id, at } of future) {
      if (!pending.has(id) && at > now()) {
        try {
          await notifications.schedule({ id, at });
          changed = true;
        } catch {
          // The chosen time stays visible and remains retryable while it is in the future.
        }
      }
    }
    // Check actual OS state after adding requests in case the queue is already full.
    return changed ? new Set(await notifications.pending()) : pending;
  }

  return {
    permission: notifications.permission,
    requestPermission: notifications.requestPermission,
    reconcile: () => enqueue(syncPending),

    get: (fragmentId: string) =>
      db.getFirstAsync<ThoughtReminder>(`${SELECT_LIVE} AND r.fragment_id = ? AND r.fire_at > ?`, fragmentId, now()),

    scheduled: (id: string) => enqueue(async () =>
      await notifications.permission() === 'granted' && (await notifications.pending()).includes(id)
    ),

    save: (fragmentId: string, at: number) => enqueue(async () => {
      if (!Number.isSafeInteger(at) || at <= now()) throw new ReminderError('past');
      if (await notifications.permission() !== 'granted') throw new ReminderError('denied');
      if (at <= now()) throw new ReminderError('past');
      const existing = await db.getFirstAsync<ThoughtReminder>(`${SELECT_LIVE} AND r.fragment_id = ?`, fragmentId);
      const reminder = existing?.at === at ? existing : { id: REMINDER_PREFIX + newId(), fragmentId, at };
      if (reminder !== existing && !await put(reminder)) throw new ReminderError('gone');
      // Retire any delivered copy of the replaced request as well as its pending request.
      // An old tap already in flight cannot resolve after the id changes.
      try {
        if (existing && existing.id !== reminder.id) await notifications.cancel(existing.id);
        return { reminder, scheduled: (await syncPending()).has(reminder.id) };
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
      return (await db.getFirstAsync<ThoughtReminder>(`${SELECT_LIVE} AND r.id = ?`, id))?.fragmentId ?? null;
    },

    consume: (id: string) => enqueue(async () => {
      // It already fired. Leave other reminders alone and a stale response unable to reopen it.
      await drop(id);
      await notifications.cancel(id);
    }),
  };
}

export type Reminders = ReturnType<typeof createReminders>;
