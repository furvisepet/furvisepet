import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
import { ownerDeclinesPersistence, unquotedOwnerText } from "../ai/owner-assertion.ts";
import { isPetObservationEvidence } from "../ai/recovery-subject.ts";
import { calendarBoundaryToInstant, resolveAskTimeZone } from "../ask-time-zone.ts";
import type { CanonicalEventProposal } from "./types.ts";

/** A dated, explicitly requested owner note is a record of the supplied words.
 * It does not assert a diagnosis, recovery, or change to an existing episode.
 * Ambiguous dates, subjects and additional tasks stay in the normal pipeline. */
export function explicitOwnerNote(input: {
  message: string; pet: { id: string; name: string | null };
  pets: Array<{ id: string; name: string | null }>; timeZone?: string;
}): CanonicalEventProposal | null {
  const { message, pet } = input;
  if (!pet.name || ownerDeclinesPersistence(message) || message.includes("?")
    || /\b(?:if|hypothetical|fictional|pretend|suppose|do not|don't|don’t)\b/i.test(unquotedOwnerText(message))) return null;
  const sentences = splitSentencesPreservingFacts(message);
  const command = /^(?:(?:I\s+(?:just\s+)?want\s+to|please)\s+)?(?:save|log|record|add)\s+(?:this|that|the)\s+(?:[\p{L}-]+\s+){0,3}note\b/iu;
  // Preserve the entire observation, including coordinated normal/negative
  // findings. Never select only the symptom with the highest model confidence.
  if (sentences.length < 2 || !command.test(sentences[1])
    || /\b(?:and|but|then|also|delete|edit|resolve|mark|change|diagnose|recommend|compare|explain)\b/i.test(sentences[1])
    || sentences.slice(2).some(s => !/^(?:please\s+)?keep\s+(?:the\s+)?(?:response|reply|answer)\s+(?:brief|short|concise)[.!]?$/i.test(s))) return null;
  const note = sentences[0];
  const escaped = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (note.length > 1000 || !new RegExp(`^${escaped(pet.name)}\\b`, "iu").test(note)
    || input.pets.some(other => other.id !== pet.id && other.name && new RegExp(`\\b${escaped(other.name)}\\b`, "iu").test(message))
    || !isPetObservationEvidence(note, note, pet.name)) return null;
  const dates = [...message.matchAll(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/gi)];
  if (dates.length !== 1) return null;
  const dateText = dates[0][0];
  const parsed = Date.parse(dateText + " UTC");
  if (!Number.isFinite(parsed)) return null;
  const day = new Date(parsed).toISOString().slice(0, 10);
  const dayNumber = /^\d{4}-/.test(dateText) ? Number(dateText.slice(-2)) : Number(/\s(\d{1,2})/.exec(dateText)?.[1]);
  if (Number(day.slice(-2)) !== dayNumber) return null;
  const zone = resolveAskTimeZone(input.timeZone);
  let occurredAt = calendarBoundaryToInstant(day + "T00:00:00.000Z", zone);
  const clocks = [...note.matchAll(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/gi)];
  if (clocks.length > 1) return null;
  if (clocks.length) {
    const [, hourText, minuteText, meridiem] = clocks[0];
    const hour = Number(hourText) % 12 + (meridiem.toUpperCase() === "PM" ? 12 : 0);
    const minute = Number(minuteText);
    const candidate = new Date(Date.parse(occurredAt) + (hour * 60 + minute) * 60_000);
    const parts = new Intl.DateTimeFormat("en-GB", {timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(candidate);
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    // Do not silently shift a wall-clock time across a DST transition. Such
    // dates remain with the normal interpretation/clarification pipeline.
    if ([part("year"),part("month"),part("day")].join("-") !== day || Number(part("hour")) !== hour || Number(part("minute")) !== minute) return null;
    occurredAt = candidate.toISOString();
  }
  if (Date.parse(occurredAt) > Date.now()) return null;
  return { subject: { type: "pet", name: pet.name }, domain: "other", topic: "owner_note",
    eventTitle: "Owner note", transition: "observed", state: "historical", importance: "routine",
    // Confidence is in reproducing the source, not in its clinical meaning.
    confidence: 1, sourceExcerpt: note, temporal: { occurredAt, explicitTime: dateText + (clocks.length ? " " + clocks[0][0] : "") } };
}
