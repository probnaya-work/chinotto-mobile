import { testReminderNotifications } from '../__testsupport__/reminderNotifications';
import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { returnFor } from '../model/returns';
import { MS_DAY, MS_HOUR } from '../model/time';
import { createReminders } from '../reminders';
import { createReturnAlerts, RETURN_ALERT_PREFIX } from '../returnAlerts';
import { createRecordStore } from '../store';

async function setup() {
  const db = openTestDb();
  await migrate(db);
  let now = Date.parse('2026-11-21T12:00:00Z');
  let seq = 0;
  const id = () => String(++seq);
  const clock = () => now;
  const ios = testReminderNotifications('ask');
  const store = createRecordStore(db, { newId: id, now: clock });
  const alerts = createReturnAlerts(db, ios.notifications, id, clock);
  const reminders = createReminders(db, ios.notifications, id, clock);
  async function surfaceReturn(words = 'blue porcelain cups') {
    const earlier = await store.capture({ body: `I brought the ${words} home.`, at: now - 400 * MS_DAY });
    const recent = await store.capture({ body: `Then I noticed the ${words} again.`, at: now });
    const chosen = returnFor({ material: [recent, earlier], now });
    if (!chosen) throw new Error('fixture has no Return');
    const returnId = await store.recordReturn(earlier.id, chosen.reason, chosen.evidence);
    return { earlier, recent, returnId };
  }
  return { db, store, alerts, reminders, surfaceReturn, clock, advance: (ms: number) => { now += ms; }, ...ios };
}

it('requests permission only on opt-in and sends no backlog', async () => {
  const h = await setup();
  try {
    await h.surfaceReturn();
    expect(await h.alerts.enabled()).toBe(false);
    await h.alerts.reconcile(h.store);
    expect(h.notifications.permission).not.toHaveBeenCalled();
    h.advance(MS_HOUR);
    await h.alerts.setEnabled(true);
    expect(h.notifications.requestPermission).toHaveBeenCalledTimes(1);
    h.setPermission('granted');
    await h.alerts.reconcile(h.store);
    expect(h.armed.size).toBe(0);
  } finally { h.db.close(); }
});

it('schedules one discreet alert and opens its original evidence exactly once', async () => {
  const h = await setup();
  try {
    h.setPermission('granted');
    await h.alerts.setEnabled(true);
    h.advance(MS_HOUR);
    const { earlier, recent, returnId } = await h.surfaceReturn();
    const due = h.clock() + 4 * MS_HOUR;
    await Promise.all([h.alerts.reconcile(h.store), h.alerts.reconcile(h.store)]);
    expect(h.notifications.schedule).toHaveBeenCalledTimes(1);
    const [[id, at]] = [...h.armed];
    expect(id).toMatch(new RegExp(`^${RETURN_ALERT_PREFIX}`));
    expect(at).toBe(due);
    expect(h.previews.get(id)).toBe(true);
    await h.reminders.reconcile();
    expect(h.armed.has(id)).toBe(true);
    h.advance(4 * MS_HOUR);
    expect(await h.alerts.open(id, h.store, () => false)).toBeNull();
    expect((await h.store.returnStatus()).open?.id).toBe(returnId);
    const arrived = await h.alerts.open(id, h.store);
    expect(arrived?.material.id).toBe(earlier.id);
    expect(arrived?.because.id).toBe(recent.id);
    expect(h.armed.size).toBe(0);
    expect(await h.alerts.open(id, h.store)).toBeNull();
    expect(await h.store.closeReturn(returnId, 'let_go')).toBe(false);
    h.advance(MS_DAY);
    await h.surfaceReturn('carved wooden spoons');
    await h.alerts.reconcile(h.store);
    expect(h.notifications.schedule).toHaveBeenCalledTimes(1);
  } finally { h.db.close(); }
});

it('cancels dismissed and opted-out alerts and rejects old deliveries', async () => {
  const h = await setup();
  try {
    h.setPermission('granted');
    await h.alerts.setEnabled(true);
    h.advance(MS_HOUR);
    const { returnId } = await h.surfaceReturn();
    await h.alerts.reconcile(h.store);
    const [dismissed] = h.armed.keys();
    await h.store.closeReturn(returnId, 'let_go');
    await h.alerts.reconcile(h.store);
    expect(h.armed.size).toBe(0);
    expect(await h.alerts.open(dismissed, h.store)).toBeNull();
    h.advance(8 * MS_DAY);
    await h.surfaceReturn('low brass lamps');
    await h.alerts.reconcile(h.store);
    const [expired] = h.armed.keys();
    expect(expired).toBeDefined();
    h.advance(3 * MS_DAY);
    expect(await h.alerts.open(expired, h.store)).toBeNull();
    const current = (await h.store.returnStatus()).open;
    if (current) await h.store.closeReturn(current.id, 'expired');
    h.advance(8 * MS_DAY);
    await h.surfaceReturn('green woven baskets');
    await h.alerts.reconcile(h.store);
    const [optedOut] = h.armed.keys();
    await h.alerts.setEnabled(false);
    expect(h.armed.size).toBe(0);
    expect(h.notifications.cancel).toHaveBeenCalledWith(optedOut);
    expect(await h.alerts.open(optedOut, h.store)).toBeNull();
  } finally { h.db.close(); }
});
