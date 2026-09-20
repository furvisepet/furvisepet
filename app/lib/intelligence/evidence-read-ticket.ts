import { bindReadTicket, type ReadTicket } from "../furvise-brain/read-ticket.ts";
import type { AskEvidenceScope } from "./ask-evidence.ts";
import type { SourceNoteRecall } from "./source-note-recall.ts";
import type { CareEntryRow } from "../supabase.ts";

/** Publication obligations for the bounded direct caller. The same read ticket
 * describes selection; this envelope adds no retrieval or mutation authority.
 * A proposal contains no records, coverage, totals, or proposed source IDs.
 */
export type EvidenceReadProposal = {
  read: Omit<ReadTicket, "subjects">;
  kind: AskEvidenceScope["requestKind"];
  topics: string[];
  period: AskEvidenceScope["requestedPeriod"];
  status: "resolved" | "ambiguous";
  locator: null | {
    intent: "source" | "effective";
    status: "resolved" | "ambiguous";
    date: null | { year: number | null; month: number; day: number; label: string };
  };
};
export type EvidenceReadTicket = Omit<EvidenceReadProposal, "read"> & { read: ReadTicket };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join() === expected.sort().join();

export function bindEvidenceReadTicket(value: unknown, petIds: string[], sourceText: string): EvidenceReadTicket {
  const fail = (): never => { throw new Error("ASK_EVIDENCE_TICKET_INVALID"); };
  if (!object(value) || !keys(value, ["read", "kind", "topics", "period", "status", "locator"])) return fail();
  if (!["ordinary", "count", "absence", "comparison", "overview", "record_lookup", "resolution_status"].includes(String(value.kind))
    || !["resolved", "ambiguous"].includes(String(value.status))
    || !Array.isArray(value.topics) || value.topics.length > 6
    || value.topics.some(topic => typeof topic !== "string" || !topic.trim() || topic.length > 80)
    || !object(value.period) || !keys(value.period, ["kind", "surface"])
    || !["lifetime", "requested", "unspecified"].includes(String(value.period.kind))
    || value.period.surface !== null && (typeof value.period.surface !== "string" || !sourceText.includes(value.period.surface))) return fail();
  const read = bindReadTicket(value.read, petIds);
  if (!read) return fail();
  // This caller binds already-loaded evidence. Anchor discovery and bounded
  // result selection belong to Lungs and cannot silently fall back here.
  if (read.temporal.anchor !== null || read.outputs.limit !== null || read.operation === "rank") return fail();
  for (const at of [read.temporal.from, read.temporal.to]) {
    if (at && new Date(`${at.slice(0,10)}T00:00:00.000Z`).toISOString().slice(0,10) !== at.slice(0,10)) return fail();
  }
  const locator = value.locator;
  if (locator !== null) {
    if (!object(locator) || !keys(locator, ["intent", "status", "date"])
      || !["source", "effective"].includes(String(locator.intent))
      || !["resolved", "ambiguous"].includes(String(locator.status))) return fail();
    const date = locator.date;
    if (date !== null) {
      if (!object(date) || !keys(date, ["year", "month", "day", "label"])
        || date.year !== null && (!Number.isInteger(date.year) || Number(date.year) < 1900 || Number(date.year) > 2100)
        || !Number.isInteger(date.month) || !Number.isInteger(date.day)
        || typeof date.label !== "string" || !date.label.trim() || date.label.length > 40
        || !sourceText.includes(date.label) || /[\r\n"“”]/.test(date.label)) return fail();
      const iso = `${date.year ?? 2000}-${String(date.month).padStart(2,"0")}-${String(date.day).padStart(2,"0")}`;
      if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0,10) !== iso) return fail();
    }
  }
  if ((value.kind === "record_lookup") !== (locator !== null)) return fail();
  // Exhaustive obligations cannot be weakened to a sufficient/sample ticket.
  if (["count", "absence", "comparison", "overview"].includes(String(value.kind))
    && read.outputs.completeness !== "exhaustive") return fail();
  return Object.freeze({ ...structuredClone(value), read }) as EvidenceReadTicket;
}

const normalized = (s: string) => s.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu," ").trim();

/** A certified fact must remain bound to the ticket's actual represented
 * sources, not merely to a matching question string or topic display label. */
export function publicationSourceMatches(ticket: EvidenceReadTicket, source: { petId: string; text: string; occurredAt?: string | null }) {
  const at = source.occurredAt ? Date.parse(source.occurredAt) : Number.NaN;
  return ticket.read.subjects.petIds.includes(source.petId)
    && (!ticket.read.temporal.from || Number.isFinite(at) && at >= Date.parse(ticket.read.temporal.from))
    && (!ticket.read.temporal.to || Number.isFinite(at) && at < Date.parse(ticket.read.temporal.to))
    && ticket.read.predicates.every(predicate => predicate.terms.some(term =>
      (` ${normalized(source.text)} `).includes(` ${normalized(term)} `)));
}

/** Bind a locator to server-loaded records before prompt selection. No raw
 * question is accepted here. Missing years stay missing; ambiguity is retained.
 * Related later/undated rows block a unique quote even if the prompt drops them.
 */
export function bindEvidenceLocator(ticket: EvidenceReadTicket, rows: readonly CareEntryRow[], userId: string,
  sourceId: (id: string) => string): SourceNoteRecall | undefined {
  const locator = ticket.locator;
  if (!locator) return undefined;
  const petId = ticket.read.subjects.petIds.length === 1 ? ticket.read.subjects.petIds[0] : null;
  const result: SourceNoteRecall = { intent: locator.intent, petId, dateLabel: locator.date?.label || null,
    topicStatus: locator.status === "ambiguous" ? "unsupported_or_ambiguous" : "supported", candidateIds: [], competingIds: [] };
  if (locator.intent !== "source" || !petId || !locator.date || locator.status !== "resolved") return result;
  if (!ticket.read.predicates.length) { result.topicStatus = "unsupported_or_ambiguous"; return result; }
  const related = rows.filter(row => row.user_id === userId && row.pet_profile_id === petId && !row.deleted_at
    && ticket.read.predicates.every(predicate => predicate.terms.some(term =>
      (` ${normalized(`${row.title || ""} ${row.note}`)} `).includes(` ${normalized(term)} `))));
  const { year, month, day } = locator.date;
  const candidates = related.filter(row => {
    const date = row.occurred_at?.slice(0,10);
    return date && date.slice(5) === `${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`
      && (year === null || date.startsWith(`${year}-`))
      && (!ticket.read.temporal.from || Date.parse(row.occurred_at) >= Date.parse(ticket.read.temporal.from))
      && (!ticket.read.temporal.to || Date.parse(row.occurred_at) < Date.parse(ticket.read.temporal.to));
  });
  result.candidateIds = candidates.map(row => sourceId(row.id));
  if (candidates.length === 1) result.competingIds = related.filter(row => row.id !== candidates[0].id
    && (!row.occurred_at || Date.parse(row.occurred_at) >= Date.parse(candidates[0].occurred_at))).map(row => sourceId(row.id));
  return result;
}
