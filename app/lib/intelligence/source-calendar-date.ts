import { calendarDateInZone } from "../ask-time-zone.ts";

const months: Record<string, number> = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const valid = (year:number, month:number, day:number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const iso = (year:number, month:number, day:number) => `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

/** A leading explicit calendar date is part of the saved fact's attribution.
 * Otherwise the event instant is displayed in the owner's timezone. */
export function explicitLeadingSourceDate(text: string): string | null {
  const head = text.trim().slice(0, 120);
  let match = /^(?:on\s+)?(\d{4})-(\d{2})-(\d{2})(?=\b|\s|[:,-])/i.exec(head);
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    return valid(year, month, day) ? iso(year, month, day) : null;
  }
  match = /^(?:on\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+)(\d{4})(?=\b|\s|[:,-])/i.exec(head);
  if (!match) return null;
  const month = months[match[1].slice(0,3).toLowerCase()], day = Number(match[2]), year = Number(match[3]);
  return month && valid(year, month, day) ? iso(year, month, day) : null;
}

export function sourceDisplayDate(text: string, occurredAt: string | null | undefined, timeZone = "UTC") {
  return explicitLeadingSourceDate(text) || (occurredAt ? calendarDateInZone(occurredAt, timeZone) : null);
}