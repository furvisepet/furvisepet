import { calendarDateInZone } from "../ask-time-zone.ts";

/** Literal relative cutoffs are query bounds, never evidence of an event. */
export function historicalAgeCutoff(question: string, now = new Date(), timeZone = "UTC"): string | null {
  const match = /\b(?:more than|over|older than)\s+(\d{1,3})\s+(years?|months?)\s+ago\b|\bolder than\s+(\d{1,3})\s+(years?|months?)\b/i.exec(question);
  if (!match) return null;
  const count = Number(match[1] || match[3]);
  if (count < 1) return null;
  const [year, month, day] = calendarDateInZone(now.toISOString(), timeZone).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - count * (/year/i.test(match[2] || match[4]) ? 12 : 1), 1));
  target.setUTCDate(Math.min(day, new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()));
  return target.toISOString().slice(0, 10);
}

export function oldestCalendarUnit(question: string): "year" | "month" | null {
  const match = /\b(?:oldest|earliest|first)\s+(?:(?:recorded|calendar)\s+)?(year|month)\b[^.!?]{0,60}\b(?:histor(?:y|ies)|records?|notes?)\b/i.exec(question);
  return match ? match[1].toLowerCase() as "year" | "month" : null;
}

export function calendarPeriodContaining(instant: string, unit: "year" | "month", timeZone = "UTC") {
  const [year, month] = calendarDateInZone(instant, timeZone).split("-").map(Number);
  return { from: new Date(Date.UTC(year, unit === "year" ? 0 : month - 1, 1)).toISOString(),
    to: new Date(Date.UTC(unit === "year" ? year + 1 : year, unit === "year" ? 0 : month, 1)).toISOString() };
}
