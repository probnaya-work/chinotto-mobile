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
    expect(f.notifications.schedule).toHaveBeenCalledWith({ id: a.reminder.id, at: f.now + 1000, discreet: true });
    expect(f.notifications.schedule).toHaveBeenCalledWith({ id: b.reminder.id, at: f.now + 2000, discreet: true });
    expect(await f.reminders.get(f.first.id)).toEqual(a.reminder);
    expect(await f.reminders.get(f.second.id)).toEqual(b.reminder);
    expect((await f.reminders.resolve(a.reminder.id))?.fragmentId).toBe(f.first.id);
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
    expect(await f.reminders.status(a.reminder)).toBe('alerts-off');
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
    expect((await reopened.resolve(a.reminder.id))?.fragmentId).toBe(f.first.id);
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

  it('pauses pending deliveries, retains intent and resumes only future dates', async () => {
    const soon = await f.reminders.save(f.first.id, f.now + 1000);
    await f.reminders.save(f.second.id, f.now + 3000);
    expect(await f.reminders.setPreferences({ paused: true, discreet: true })).toBe(true);
    expect(f.armed.size).toBe(0);
    expect((await f.reminders.list()).map(({ status }) => status)).toEqual(['paused', 'paused']);
    expect((await f.open().preferences()).paused).toBe(true);
    const newTime = await f.reminders.save(f.second.id, f.now + 5000);
    expect(newTime.scheduled).toBe(false);
    expect(newTime.reminder.delivery).toBe('alert');
    const extra = await f.store.capture({ body: 'a third thought' });
    await expect(f.reminders.save(extra.id, f.now + 2000)).rejects.toMatchObject({ reason: 'paused' });

    f.advance(f.now + 2000);
    expect(await f.reminders.setPreferences({ paused: false, discreet: true })).toBe(true);
    expect([...f.armed.keys()]).toEqual([newTime.reminder.id]);
    expect(f.armed.has(soon.reminder.id)).toBe(false);
    expect((await f.reminders.list()).map(({ id }) => id)).toEqual([newTime.reminder.id]);
  });

  it('replaces only the affected OS previews and keeps the stricter thought choice', async () => {
    const a = await f.reminders.save(f.first.id, f.now + 1000);
    const b = await f.reminders.save(f.second.id, f.now + 2000);
    expect(f.previews.get(a.reminder.id)).toBe(true);
    expect(f.previews.get(b.reminder.id)).toBe(true);
    await f.reminders.setDiscreet(a.reminder, 1);
    await f.reminders.setPreferences({ paused: false, discreet: false });
    expect(f.previews.get(a.reminder.id)).toBe(true);
    expect(f.previews.get(b.reminder.id)).toBe(false);
    expect(f.armed.size).toBe(2);
    expect(f.notifications.cancel).toHaveBeenCalledWith(b.reminder.id);
    expect(f.notifications.cancel).not.toHaveBeenCalledWith(a.reminder.id);
    expect((await f.open().get(f.first.id))?.discreet).toBe(1);
  });

  it('keeps an explicit in-app intent while denied and never arms it on permission recovery', async () => {
    f.setPermission('denied');
    const result = await f.reminders.save(f.first.id, f.now + 1000, 'in-app');
    expect(result.scheduled).toBe(false);
    expect((await f.reminders.list())[0].status).toBe('in-app');
    f.setPermission('granted');
    await f.open().reconcile();
    expect(f.armed.size).toBe(0);
    f.advance(f.now + 1000);
    expect((await f.reminders.list())[0].status).toBe('ready');
    expect((await f.reminders.resolve(result.reminder.id))?.fragmentId).toBe(f.first.id);
    await f.reminders.consume(result.reminder.id);
    expect(await f.reminders.list()).toEqual([]);
  });

  it('does not promise a silent reminder when the old alert could not be cancelled', async () => {
    const saved = await f.reminders.save(f.first.id, f.now + 5000);
    f.notifications.cancel.mockRejectedValueOnce(new Error('native unavailable'));
    await expect(f.reminders.save(f.first.id, f.now + 1000, 'in-app')).rejects.toThrow('native unavailable');
    expect(await f.reminders.get(f.first.id)).toEqual(saved.reminder);
    expect([...f.armed.keys()]).toEqual([saved.reminder.id]);
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
