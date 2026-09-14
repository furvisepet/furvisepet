/** Browser calendar dates are interpreted in the same IANA zone as the UI.
 * Missing/invalid client hints use UTC; they never confer data authority. */
export function resolveAskTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.length > 100) return "UTC";
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { return "UTC"; }
}
export function calendarDateInZone(instant: string, timeZone = "UTC"): string {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return "";
  if (timeZone === "UTC") return date.toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat("en", { timeZone: resolveAskTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)!.value).join("-");
}
/** Resolve a local date boundary, including 23/25-hour DST days. Iteration
 * compares wall-clock fields, never the host machine's local timezone. */
export function calendarBoundaryToInstant(value: string, timeZone = "UTC"): string {
  const zone = resolveAskTimeZone(timeZone);
  if (zone === "UTC") return value;
  const target = Date.parse(value.slice(0, 10) + "T00:00:00.000Z");
  if (!Number.isFinite(target)) throw new Error("INVALID_CALENDAR_BOUNDARY");
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let instant = target;
  const visited: number[] = [];
  for (let i = 0; i < 6; i++) {
    const parts = formatter.formatToParts(new Date(instant));
    const get = (key: string) => Number(parts.find(part => part.type === key)!.value);
    const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    if (local === target) return new Date(instant).toISOString();
    visited.push(instant);
    const next = instant + target - local;
    // A midnight skipped by a forward transition starts at the first valid
    // instant after the gap, rather than silently moving into the prior day.
    if (visited.includes(next)) return new Date(Math.max(next, instant)).toISOString();
    instant = next;
  }
  throw new Error("UNRESOLVED_CALENDAR_BOUNDARY");
}
export function calendarWindowToInstants<T extends { from: string | null; to: string | null }>(window: T, timeZone = "UTC"): T {
  return { ...window, from: window.from ? calendarBoundaryToInstant(window.from, timeZone) : null,
    to: window.to ? calendarBoundaryToInstant(window.to, timeZone) : null };
}
