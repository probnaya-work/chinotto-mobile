import * as Notifications from 'expo-notifications';
import { nativeReminders } from '../nativeReminders.ios';

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'open',
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
}));

const native = jest.mocked(Notifications);
const id = 'chinotto-reminder:opaque';
const response = (identifier: string, action = Notifications.DEFAULT_ACTION_IDENTIFIER) => ({
  actionIdentifier: action,
  notification: { request: { identifier } },
} as Notifications.NotificationResponse);

afterEach(() => jest.clearAllMocks());

it('schedules one local, discreet alert and clears both pending and visible copies', async () => {
  const at = new Date('2026-11-21T09:00:00.000Z').getTime();
  await nativeReminders.schedule({ id, at, discreet: false });
  expect(native.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: id,
    content: { title: 'Chinotto', body: 'A thought you asked to revisit.' },
    trigger: { type: 'date', date: at },
  });
  await nativeReminders.schedule({ id, at, discreet: true });
  expect(native.scheduleNotificationAsync).toHaveBeenLastCalledWith(expect.objectContaining({
    content: { title: 'Chinotto', body: 'Open Chinotto' },
  }));
  await nativeReminders.cancel(id);
  expect(native.cancelScheduledNotificationAsync).toHaveBeenCalledWith(id);
  expect(native.dismissNotificationAsync).toHaveBeenCalledWith(id);
});

it('accepts cold and warm opens from only the owned reminder namespace', () => {
  const remove = jest.fn();
  const open = jest.fn();
  native.addNotificationResponseReceivedListener.mockReturnValue({ remove });
  native.getLastNotificationResponse.mockReturnValue(response(id));
  const unsubscribe = nativeReminders.subscribe(open);
  const receive = native.addNotificationResponseReceivedListener.mock.calls[0][0];
  receive(response('unrelated-notification'));
  receive(response(id, 'dismiss'));
  receive(response('chinotto-reminder:second'));
  expect(open.mock.calls).toEqual([[id], ['chinotto-reminder:second']]);
  native.getLastNotificationResponse.mockReturnValue(response('chinotto-reminder:second'));
  nativeReminders.acknowledge(id);
  expect(native.clearLastNotificationResponse).not.toHaveBeenCalled();
  nativeReminders.acknowledge('chinotto-reminder:second');
  expect(native.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  unsubscribe();
  expect(remove).toHaveBeenCalled();
});
