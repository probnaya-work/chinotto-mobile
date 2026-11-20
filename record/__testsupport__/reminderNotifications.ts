import type { ReminderNotifications, ReminderPermission } from '../reminders';

export function testReminderNotifications(initial: ReminderPermission = 'granted') {
  let permission = initial;
  const armed = new Map<string, number>();
  const previews = new Map<string, boolean>();
  const notifications: jest.Mocked<ReminderNotifications> = {
    permission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => permission),
    pending: jest.fn(async () => [...armed.keys()].map((id) => ({ id, discreet: previews.get(id) ?? false }))),
    schedule: jest.fn(async ({ id, at, discreet }) => { armed.set(id, at); previews.set(id, discreet); }),
    cancel: jest.fn(async (id) => { armed.delete(id); previews.delete(id); }),
    subscribe: jest.fn((_open: (id: string) => void) => () => {}),
    acknowledge: jest.fn(),
  };
  return { notifications, armed, previews, setPermission: (value: ReminderPermission) => { permission = value; } };
}
