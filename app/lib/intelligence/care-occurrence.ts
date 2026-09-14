import { calendarBoundaryToInstant, calendarDateInZone } from "../ask-time-zone.ts";
import type { CareEntryRow } from "../supabase.ts";

/** Older date-only reports were stored at UTC midnight. Their explicit saved
 * calendar date is not an event at midnight in a different time zone. Preserve
 * genuine timestamps and never infer date precision merely from note wording. */
export function careOccurrence(entry: CareEntryRow, timeZone = "UTC"): string {
  const explicit = entry.care_event_metadata?.explicitTime;
  const instant = entry.occurred_at;
  if (typeof explicit !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(explicit)
    || Date.parse(instant) !== Date.parse(explicit + "T00:00:00.000Z")) return instant;
  return calendarBoundaryToInstant(explicit, timeZone);
}

/** Candidate envelope only. Final membership uses authoritative date precision;
 * ownership, access windows, cursor ordering and page budgets remain unchanged. */
export function calendarCandidateWindow(window: { from: string | null; to: string | null }, timeZone = "UTC") {
  const boundary = (instant: string, lower: boolean) => {
    const calendar = Date.parse(calendarDateInZone(instant, timeZone) + "T00:00:00.000Z");
    return new Date((lower ? Math.min : Math.max)(Date.parse(instant), calendar)).toISOString();
  };
  return { from: window.from ? boundary(window.from, true) : null, to: window.to ? boundary(window.to, false) : null };
}
