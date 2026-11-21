import { fmtTime } from './model/time';

export function reminderPresets(now: number) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(9, 0, 0, 0);
  return [
    { label: 'in an hour', at: now + 60 * 60 * 1000 },
    { label: 'tomorrow morning', at: tomorrow.getTime() },
    { label: 'in a week', at: nextWeek.getTime() },
  ];
}

export function postponeReminder(at: number) {
  const next = new Date(at);
  next.setDate(next.getDate() + 1);
  return next.getTime();
}

export function reminderDate(at: number) {
  return new Date(at).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export const reminderTime = fmtTime;
