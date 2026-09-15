import { ownerDeclinesPersistence, unquotedOwnerText } from "../ai/owner-assertion.ts";
import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
import { calendarBoundaryToInstant, resolveAskTimeZone } from "../ask-time-zone.ts";

export type OwnerNoteRequest = { note: string; occurredAt: string | null; explicitTime: string | null; needsAnswer: boolean };

/** Transport intent is authoritative for arbitrary text. Natural-language routing
 * recognizes affirmative note commands only; it never evaluates clinical merit.
 * Unresolved subjects/commands retain the normal clarification path. */
export function resolveOwnerNoteRequest(input: {
  message: string; mode?: "note"; pet: { id: string; name: string | null };
  pets: Array<{ id: string; name: string | null }>; timeZone?: string;
}): OwnerNoteRequest | null {
  const text = input.message.trim();
  if (!text || ownerDeclinesPersistence(text)) return null;
  if (input.mode !== "note") {
    const commandText = unquotedOwnerText(text);
    if (/\b(?:hypothetical|fictional|pretend|suppose|if|example|translate)\b/i.test(commandText)) return null;
    const commands = splitSentencesPreservingFacts(commandText).filter(sentence =>
      /^(?:(?:please|also)\s+|I\s+(?:just\s+)?want\s+to\s+|(?:can|could|would)\s+you\s+)?(?:save|log|record|add)\b/i.test(sentence.trim()));
    if (!commands.length || !/\b(?:note|history|entry|observation|update|this|that|following)\b/i.test(commands.join(" "))) return null;
    if (/\b(?:notes|entries|separate|each|delete|remove|replace|correct|resolve|reopen|mark|profile|subscription|billing)\b/i.test(commands.join(" "))) return null;
    const named = input.pets.filter(pet => pet.name && new RegExp(`(?<![\\p{L}])${escape(pet.name)}(?![\\p{L}])`, "iu").test(commandText));
    if (named.some(pet => pet.id !== input.pet.id)) return null;
    // An explicit selected-pet name or first-person pet reference grounds a
    // natural-language write. The Save note control handles arbitrary wording.
    if (!named.length && !/\b(?:my|our)\s+(?:pet|dog|cat)\b/i.test(commandText)) return null;
  }
  const time = explicitNoteTime(text, input.timeZone);
  return { note: text, ...time, needsAnswer: input.mode !== "note" &&
    /\b(?:explain|compare|recommend|advise|tell me|what|why|how|should|is (?:it|this|that|he|she)|summari[sz]e)\b/i.test(unquotedOwnerText(text)) };
}

function escape(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Dates are optional metadata. Failure to resolve one must never reject text.
 * Multiple/invalid dates retain their literal wording with unknown occurrence. */
export function explicitNoteTime(text: string, timeZone?: string): { occurredAt: string | null; explicitTime: string | null } {
  const unknown = { occurredAt: null, explicitTime: null };
  const dates = [...text.matchAll(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/gi)];
  if (dates.length !== 1) return unknown;
  const literal = dates[0][0];
  const timestamp = Date.parse(literal + " UTC");
  if (!Number.isFinite(timestamp)) return unknown;
  const day = new Date(timestamp).toISOString().slice(0, 10);
  const expectedDay = /^\d{4}-/.test(literal) ? Number(literal.slice(-2)) : Number(/\s(\d{1,2})/.exec(literal)?.[1]);
  if (Number(day.slice(-2)) !== expectedDay) return unknown;
  const clocks = [...text.matchAll(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/gi)];
  if (clocks.length > 1) return unknown;
  const zone = resolveAskTimeZone(timeZone);
  let occurredAt = calendarBoundaryToInstant(day + "T00:00:00.000Z", zone);
  if (clocks.length) {
    const [, h, m, meridiem] = clocks[0];
    const hour = Number(h) % 12 + (meridiem.toUpperCase() === "PM" ? 12 : 0);
    const candidate = new Date(Date.parse(occurredAt) + (hour * 60 + Number(m)) * 60_000);
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(candidate);
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    if ([part("year"), part("month"), part("day")].join("-") !== day || Number(part("hour")) !== hour || Number(part("minute")) !== Number(m)) return unknown;
    occurredAt = candidate.toISOString();
  }
  return { occurredAt, explicitTime: clocks.length ? `${literal} ${clocks[0][0]}` : day };
}
