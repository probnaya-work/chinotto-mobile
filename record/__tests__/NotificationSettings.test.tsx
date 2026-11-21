import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ChinottoApp } from '../ChinottoApp';
import { testAppServices } from '../__testsupport__/appServices';
import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { testReminderNotifications } from '../__testsupport__/reminderNotifications';
import { migrate } from '../migrate';
import { protectRecordStore } from '../privacy';
import { createReminders } from '../reminders';
import { createRecordStore } from '../store';
import { NotificationSettings, ScheduledReminders } from '../ui/NotificationSettings';

jest.mock('../../widgets/widgetThoughtsBridge', () => ({
  refreshWidgetThoughtsFromLocalDb: jest.fn(async () => {}),
}));

async function setup() {
  const db = openTestDb();
  await migrate(db);
  let seq = 0;
  const newId = () => String(++seq);
  const ios = testReminderNotifications();
  const store = createRecordStore(db, { newId });
  const reminders = createReminders(db, ios.notifications, newId);
  return { db, store, reminders, ...ios };
}

it('separates the iPhone permission from the pause and preview choices', async () => {
  const h = await setup();
  const thought = await h.store.capture({ body: 'a private sentence' });
  const alert = await h.reminders.save(thought.id, Date.now() + 3_600_000);
  const openSystemSettings = jest.fn();
  const openScheduled = jest.fn();
  const view = render(<NotificationSettings reminders={h.reminders}
    openSystemSettings={openSystemSettings} openScheduled={openScheduled} />);
  try {
    await screen.findByText('alerts allowed by iOS');
    const alerts = await screen.findByRole('switch', { name: 'reminder alerts' });
    expect(alerts.props.accessibilityState.checked).toBe(true);
    await act(async () => { fireEvent.press(alerts); });
    expect(screen.getByRole('switch', { name: 'reminder alerts' }).props.accessibilityState.checked).toBe(false);
    expect(screen.getByText('alerts allowed by iOS')).toBeTruthy();
    expect(h.armed.has(alert.reminder.id)).toBe(false);
    expect(await h.reminders.get(thought.id)).toEqual(alert.reminder);
    fireEvent.press(screen.getByRole('button', { name: /iPhone notification settings/ }));
    expect(openSystemSettings).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.press(screen.getByRole('switch', { name: 'discreet previews' })); });
    expect((await h.reminders.preferences()).discreet).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: /scheduled reminders/ }));
    expect(openScheduled).toHaveBeenCalledTimes(1);
    expect(h.notifications.requestPermission).not.toHaveBeenCalled();
  } finally { view.unmount(); h.db.close(); }
});

it('keeps scheduled thought previews behind the read gate and hands off only the opaque id', async () => {
  const h = await setup();
  const thought = await h.store.capture({ body: 'private thought for later\nwith more private wording' });
  const result = await h.reminders.save(thought.id, Date.now() + 3_600_000, 'in-app');
  let unlocked = false;
  const read = jest.spyOn(h.store, 'getFragment');
  const guarded = protectRecordStore(h.store, () => unlocked);
  const onUnlock = jest.fn();
  const onOpen = jest.fn();
  const ui = (readAllowed: boolean) => <ScheduledReminders reminders={h.reminders}
    store={guarded} readAllowed={readAllowed} unlockBusy={false} onUnlock={onUnlock} onOpen={onOpen} />;
  const view = render(ui(false));
  try {
    expect(screen.queryByText('private thought for later')).toBeNull();
    expect(read).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: /open the record/ }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
    unlocked = true;
    view.rerender(ui(true));
    const row = await screen.findByRole('button', { name: /private thought for later.*manage/ });
    expect(screen.queryByText('with more private wording')).toBeNull();
    fireEvent.press(row);
    expect(onOpen).toHaveBeenCalledWith(result.reminder.id);
    unlocked = false;
    view.rerender(ui(false));
    expect(screen.queryByText('private thought for later')).toBeNull();
  } finally { view.unmount(); h.db.close(); }
});

it('opens Notifications from Settings and cancels through the existing thought editor', async () => {
  const h = await setup();
  const thought = await h.store.capture({ body: 'read this from settings' });
  const reminder = await h.reminders.save(thought.id, Date.now() + 3_600_000);
  const services = { ...testAppServices(h.db, null, () => {}), reminderNotifications: h.notifications };
  const view = render(<ChinottoApp services={services} />);
  try {
    const strip = await screen.findByTestId('pull-strip');
    await act(async () => { fireEvent(strip, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }); });
    fireEvent.press(await screen.findByRole('button', { name: 'notifications, open ›' }));
    fireEvent.press(await screen.findByRole('button', { name: 'scheduled reminders, open ›' }));
    fireEvent.press(await screen.findByRole('button', { name: /read this from settings.*manage/ }));
    expect(await screen.findByRole('button', { name: 'change time ›' })).toBeTruthy();
    expect(await h.reminders.get(thought.id)).toEqual(reminder.reminder);
    fireEvent.press(screen.getByRole('button', { name: 'cancel reminder ›' }));
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'cancel reminder' })); });
    expect(await screen.findByText(/no reminders on this iphone/)).toBeTruthy();
    expect(h.armed.size).toBe(0);
    expect((await h.store.getFragment(thought.id))?.body).toBe(thought.body);
    fireEvent.press(screen.getByRole('button', { name: '‹ notifications' }));
    expect(await screen.findByRole('switch', { name: 'reminder alerts' })).toBeTruthy();
  } finally { view.unmount(); h.db.close(); }
});
