import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { testReminderNotifications } from '../__testsupport__/reminderNotifications';
import { migrate } from '../migrate';
import { createReminders, REMINDER_PREFIX } from '../reminders';
import { postponeReminder, reminderPresets } from '../reminderTime';
import { createRecordStore } from '../store';

async function fixture() {
  const db = openTestDb();
  await migrate(db);
  let now = new Date(2026, 10, 20, 23, 50).getTime();
  let sequence = 0;
  const newId = () => String(++sequence);
  const store = createRecordStore(db, { now: () => now, newId });
  const first = await store.capture({ body: 'private first thought' });
  const second = await store.capture({ body: 'private second thought' });
  const native = testReminderNotifications();
  const open = () => createReminders(db, native.notifications, newId, () => now);
  return {
    db, store, first, second, ...native, reminders: open(), open, now,
    advance: (time: number) => { now = time; },
  };
}

describe('one-shot reminder intents', () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { f = await fixture(); });
  afterEach(() => f.db.close());

  it('isolates schedules by thought and only passes an opaque id and time to the system', async () => {
    const a = await f.reminders.save(f.first.id, f.now + 1000);
    const b = await f.reminders.save(f.second.id, f.now + 2000);
    expect(a.scheduled && b.scheduled).toBe(true);
    expect(a.reminder.id).toMatch(new RegExp('^' + REMINDER_PREFIX));
    expect(f.notifications.schedule).toHaveBeenCalledWith({ id: a.reminder.id, at: f.now + 1000 });
    expect(f.notifications.schedule).toHaveBeenCalledWith({ id: b.reminder.id, at: f.now + 2000 });
    expect(await f.reminders.get(f.first.id)).toEqual(a.reminder);
    expect(await f.reminders.get(f.second.id)).toEqual(b.reminder);
    expect(await f.reminders.resolve(a.reminder.id)).toBe(f.first.id);
  });

  it('replaces and postpones a single schedule even under concurrent saves', async () => {
    const original = await f.reminders.save(f.first.id, f.now + 1000);
    const after = postponeReminder(original.reminder.at);
    const [edit, final] = await Promise.all([
      f.reminders.save(f.first.id, after),
      f.reminders.save(f.first.id, after + 1000),
    ]);
    expect([...f.armed]).toEqual([[final.reminder.id, after + 1000]]);
    expect(await f.reminders.resolve(original.reminder.id)).toBeNull();
    expect(await f.reminders.resolve(edit.reminder.id)).toBeNull();
    expect(await f.reminders.get(f.first.id)).toEqual(final.reminder);
    expect(await f.reminders.save(f.first.id, after + 1000)).toEqual(final);
  });

  it('cancels only the selected reminder and keeps the thought', async () => {
    const a = await f.reminders.save(f.first.id, f.now + 1000);
    const b = await f.reminders.save(f.second.id, f.now + 2000);
    await f.reminders.cancel(a.reminder.id);
    expect([...f.armed.keys()]).toEqual([b.reminder.id]);
    expect(await f.reminders.get(f.first.id)).toBeNull();
    expect(await f.reminders.resolve(a.reminder.id)).toBeNull();
    expect((await f.store.getFragment(f.first.id))?.body).toBe('private first thought');
  });

  it('keeps the old intent when permission is denied or the chosen time is past', async () => {
    const a = await f.reminders.save(f.first.id, f.now + 1000);
    f.setPermission('denied');
    await expect(f.reminders.save(f.first.id, f.now + 2000)).rejects.toMatchObject({ reason: 'denied' });
    await expect(f.reminders.save(f.second.id, f.now)).rejects.toMatchObject({ reason: 'past' });
    expect(await f.reminders.get(f.first.id)).toEqual(a.reminder);
    expect(await f.reminders.scheduled(a.reminder.id)).toBe(false);
    expect(await f.reminders.get(f.second.id)).toBeNull();
  });

  it('repairs a failed schedule on restart without replaying an expired one', async () => {
    f.notifications.schedule.mockRejectedValueOnce(new Error('native unavailable'));
    const a = await f.reminders.save(f.first.id, f.now + 1000);
    expect(a.scheduled).toBe(false);
    const reopened = f.open();
    expect(await reopened.get(f.first.id)).toEqual(a.reminder);
    await reopened.reconcile();
    expect(f.armed.get(a.reminder.id)).toBe(a.reminder.at);
    f.armed.delete(a.reminder.id);
    f.advance(f.now + 2000);
    await reopened.reconcile();
    expect(f.armed.size).toBe(0);
    expect(await reopened.resolve(a.reminder.id)).toBe(f.first.id);
    await reopened.consume(a.reminder.id);
    expect(await reopened.resolve(a.reminder.id)).toBeNull();
  });

  it('cleans replaced and removed targets before resolving a tap', async () => {
    const a = await f.reminders.save(f.first.id, f.now + 1000);
    await f.store.remove(f.first.id);
    expect(await f.reminders.resolve(a.reminder.id)).toBeNull();
    expect(await f.reminders.get(f.first.id)).toBeNull();
    await f.reminders.reconcile();
    expect(f.armed.size).toBe(0);
    await expect(f.reminders.save(f.first.id, f.now + 2000)).rejects.toMatchObject({ reason: 'gone' });
  });

  it('waits for failed replacement cancellation before arming a second alert', async () => {
    const a = await f.reminders.save(f.first.id, f.now + 1000);
    f.notifications.cancel.mockRejectedValueOnce(new Error('native unavailable'));
    const b = await f.reminders.save(f.first.id, f.now + 2000);
    expect(b.scheduled).toBe(false);
    expect(await f.reminders.resolve(a.reminder.id)).toBeNull();
    expect([...f.armed.keys()]).toEqual([a.reminder.id]);
    await f.open().reconcile();
    expect([...f.armed.keys()]).toEqual([b.reminder.id]);
  });
});

it('chooses 09:00 on local calendar days across midnight', () => {
  const now = new Date(2026, 10, 20, 23, 50).getTime();
  const [hour, tomorrow, week] = reminderPresets(now);
  expect(hour.at - now).toBe(3_600_000);
  expect(tomorrow.at).toBe(new Date(2026, 10, 21, 9).getTime());
  expect(week.at).toBe(new Date(2026, 10, 27, 9).getTime());
  expect(postponeReminder(tomorrow.at)).toBe(new Date(2026, 10, 22, 9).getTime());
});
