/**
 * Day boundaries. The browser sends `tz` as Date.getTimezoneOffset(): minutes
 * UTC is ahead of local time (New York in winter is 300). Local = UTC - tz.
 */
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export const isDateString = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** The UTC instants [start, end) that make up one local calendar day. */
export function dayRange(date: string, tz: number): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${date}T00:00:00Z`) + tz * MIN);
  return { start, end: new Date(start.getTime() + DAY) };
}

/** The local calendar date (YYYY-MM-DD) of a UTC instant. */
export function localDate(instant: Date | string, tz: number): string {
  return new Date(new Date(instant).getTime() - tz * MIN).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}
