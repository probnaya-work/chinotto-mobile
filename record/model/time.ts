/**
 * How the Record says when.
 *
 * A faithful port of the date helpers in the prototype's `chinotto-data.js`, which desktop
 * and mobile share. Every label the record draws comes from here, so a moment reads the same
 * on both devices.
 *
 * Everything is local-time on purpose: "today" means the day the person is living in, not a
 * UTC day. `captured_at` is stored as ISO and converted once, at the edge.
 */

export const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

export const MONTHS_FULL = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export const MS_HOUR = 3600e3;
export const MS_DAY = 864e5;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `09:41`. */
export const fmtTime = (t: number): string => {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** `0:42` — a voice chip's duration, from seconds. */
export const fmtDur = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${pad2(Math.floor(seconds % 60))}`;

/** `12 mar 2024`. */
export const fullDate = (t: number): string => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** `12 mar`. */
export const dayMonth = (t: number): string => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** `mar` within this year, `mar 2024` otherwise — or always with the year when forced. */
export const monthLabel = (t: number, now: number, forceYear = false): string => {
  const d = new Date(t);
  const n = new Date(now);
  return !forceYear && d.getFullYear() === n.getFullYear()
    ? MONTHS[d.getMonth()]
    : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const sameDay = (a: number, b: number): boolean => {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
};

/** `today` · `yesterday` · `thu 12` · `12 mar` · `12 mar 2024`, widening as it recedes. */
export const dayLabel = (t: number, now: number): string => {
  if (sameDay(t, now)) return 'today';
  if (sameDay(t, now - MS_DAY)) return 'yesterday';
  const d = new Date(t);
  if (now - t < 7 * MS_DAY) return `${DAYS[d.getDay()]} ${d.getDate()}`;
  if (new Date(now).getFullYear() === d.getFullYear()) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return fullDate(t);
};

/** `this month` · `7 months` · `3 years 2 months` — the distance a Return states. */
export const ago = (t: number, now: number): string => {
  const m = Math.round((now - t) / (30.4 * MS_DAY));
  if (m < 1) return 'this month';
  if (m < 12) return `${m} months`;
  const y = Math.floor(m / 12);
  const r = m % 12;
  return `${y} year${y > 1 ? 's' : ''}${r ? ` ${r} months` : ''}`;
};

/** Local midnight at the start of the day `now` falls in. */
export const startOfDay = (now: number): number => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
