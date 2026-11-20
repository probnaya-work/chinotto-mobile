import * as Notifications from 'expo-notifications';
import { REMINDER_PREFIX, type ReminderNotifications, type ReminderPermission } from './reminders';

function status(value: Notifications.NotificationPermissionsStatus): ReminderPermission {
  if (value.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED && value.ios.allowsAlert) {
    return 'granted';
  }
  return value.ios?.status === Notifications.IosAuthorizationStatus.NOT_DETERMINED && value.canAskAgain
    ? 'ask' : 'denied';
}

function reminderId(response: Notifications.NotificationResponse | null) {
  const id = response?.notification.request.identifier;
  return response?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER && id?.startsWith(REMINDER_PREFIX)
    ? id : null;
}

export const nativeReminders: ReminderNotifications = {
  permission: async () => status(await Notifications.getPermissionsAsync()),
  requestPermission: async () => status(await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  })),
  pending: async () => (await Notifications.getAllScheduledNotificationsAsync())
    .map(({ identifier }) => identifier).filter((id) => id.startsWith(REMINDER_PREFIX)),
  async schedule({ id, at }) {
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title: 'Chinotto', body: 'A thought you asked to revisit.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  },
  async cancel(id) {
    await Notifications.cancelScheduledNotificationAsync(id);
    await Notifications.dismissNotificationAsync(id);
  },
  subscribe(open) {
    // The default foreground behavior discards presentation. The app does not interrupt a draft.
    const accept = (response: Notifications.NotificationResponse | null) => {
      const id = reminderId(response);
      if (id) open(id);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(accept);
    accept(Notifications.getLastNotificationResponse());
    return () => subscription.remove();
  },
  acknowledge(id) {
    if (reminderId(Notifications.getLastNotificationResponse()) === id) {
      Notifications.clearLastNotificationResponse();
    }
  },
};
