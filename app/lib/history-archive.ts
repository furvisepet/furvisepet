import { formatCareEntryTimestamp } from "./care-log.mjs";

export const HISTORY_PAGE_SIZE = 50;
export const HISTORY_WHEN_FILTERS = ["all", "7d", "30d", "year"] as const;

export type HistoryWhenFilter = (typeof HISTORY_WHEN_FILTERS)[number];

export function normalizeHistorySearch(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function getHistoryFromInstant(when: HistoryWhenFilter, now = new Date()) {
  if (when === "all") return null;
  if (when === "year") return new Date(now.getFullYear(), 0, 1).toISOString();
  const days = when === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function formatHistoryTimestamp(value: string, locale?: string, metadata?: Record<string, unknown> | null) {
  const explicitDate = metadata?.explicitTime;
  const instant = new Date(value);
  // An explicit calendar date is stored at UTC midnight, not as an observed
  // local clock time. Do not move that date across days or invent a time of day.
  if (typeof explicitDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(explicitDate)
    && Number.isFinite(instant.getTime()) && instant.toISOString() === `${explicitDate}T00:00:00.000Z`) {
    return new Intl.DateTimeFormat(locale || "en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(instant);
  }
  return locale ? formatCareEntryTimestamp(value, locale) : formatCareEntryTimestamp(value);
}

export function isHistoryWhenFilter(value: string): value is HistoryWhenFilter {
  return HISTORY_WHEN_FILTERS.includes(value as HistoryWhenFilter);
}
