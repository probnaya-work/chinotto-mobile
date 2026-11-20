import type { ReminderNotifications, ReminderPermission } from '../reminders';

export function testReminderNotifications(initial: ReminderPermission = 'granted') {
  let permission = initial;
  const armed = new Map<string, number>();
  const notifications: jest.Mocked<ReminderNotifications> = {
    permission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => permission),
    pending: jest.fn(async () => [...armed.keys()]),
    schedule: jest.fn(async ({ id, at }) => { armed.set(id, at); }),
    cancel: jest.fn(async (id) => { armed.delete(id); }),
    subscribe: jest.fn((_open: (id: string) => void) => () => {}),
    acknowledge: jest.fn(),
  };
  return { notifications, armed, setPermission: (value: ReminderPermission) => { permission = value; } };
}
