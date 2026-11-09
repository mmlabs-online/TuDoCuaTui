const pad = (n: number) => String(n).padStart(2, "0");

/** Device-local calendar date (YYYY-MM-DD). */
export const localDate = (d: Date | number) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** Local calendar date (YYYY-MM-DD) — avoids UTC shifting "today" for UTC+7 users. */
export const localToday = (now: Date | number = Date.now()) => localDate(now);

/** DB date-only values pass through; timestamps become the local calendar date; empty/invalid → "". */
export const toLocalDate = (value: string) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? "" : localDate(t);
};

const utcDay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole local calendar days since `value`; null for empty/invalid; never negative. */
export const daysSince = (value: string, now: Date | number = Date.now()) => {
  const d = toLocalDate(value);
  if (!d) return null;
  return Math.max(0, Math.round((utcDay(localDate(now)) - utcDay(d)) / 86400000));
};
