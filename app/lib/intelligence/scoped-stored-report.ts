import type { SupabaseClient } from "@supabase/supabase-js";
import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import { textMatchesReadPredicate } from "../furvise-brain/read-text.ts";
import { withExecutionDeadline } from "../ai/execution-deadline.ts";

/** Internal evidence of a single source recheck, not result-set or fact authority. */
export type ScopedReportProof = Readonly<{
  kind: "scoped_stored_report.v1";
  sourceId: string;
  petId: string;
  body: string;
  occurredAt: string;
  recordedAt: string;
  updatedAt: string;
}>;

const snapshots = new WeakMap<ScopedReportProof, string>();
const versionFields = ["id", "user_id", "pet_profile_id", "category", "title", "note", "severity",
  "occurred_at", "created_at", "updated_at", "deleted_at"] as const;

/**
 * Only a bounded, unlinked, active source is covered. A linked claim needs its
 * own reviewed graph proof and is deliberately withheld. No absence of other
 * notes, corrections or effective facts follows from this source-only proof.
 */
export async function certifyScopedStoredReport(input: {
  db: SupabaseClient; userId: string; ownedPetIds: readonly string[];
  ticket: ReadTicket; candidate: CareEntryRow; deadline: number;
}): Promise<ScopedReportProof | null> {
  const { ticket, candidate, userId } = input;
  if (ticket.authority !== "stored_report" || ticket.operation !== "read"
    || ticket.outputs.completeness !== "sufficient" || ticket.outputs.limit !== null
    || ticket.outputs.strategy != null || ticket.selection || ticket.episode || ticket.needs?.length
    || ticket.attributedContexts?.length || ticket.temporal.anchor || ticket.temporal.calendar
    || ticket.subjects.petIds.length !== 1 || ticket.subjects.petIds[0] !== candidate.pet_profile_id
    || !input.ownedPetIds.includes(candidate.pet_profile_id) || candidate.user_id !== userId || candidate.deleted_at
    || typeof candidate.id !== "string" || !candidate.id || typeof candidate.note !== "string"
    || typeof candidate.updated_at !== "string" || !Number.isFinite(Date.parse(candidate.updated_at))
    || !Number.isFinite(Date.parse(candidate.occurred_at)) || !Number.isFinite(Date.parse(candidate.created_at))
    || !ticket.temporal.from || !ticket.temporal.to
    || !Number.isFinite(Date.parse(ticket.temporal.from)) || !Number.isFinite(Date.parse(ticket.temporal.to))
    || Date.parse(candidate.occurred_at) < Date.parse(ticket.temporal.from)
    || Date.parse(candidate.occurred_at) >= Date.parse(ticket.temporal.to)
    || !ticket.predicates.every(predicate => textMatchesReadPredicate((candidate.title || "") + " " + candidate.note, predicate)))
    return null;
  const remaining = input.deadline - Date.now();
  if (remaining <= 0) return null;
  try {
    const result = await withExecutionDeadline(signal => input.db.rpc("read_ask_history_correction_page", {
      p_care_ids: [candidate.id], p_claim_ids: [], p_seed_pet_ids: [], p_event_from: null, p_event_to: null, p_terms: [],
    }).abortSignal(signal), remaining);
    const page = result.data;
    if (result.error || !page || page.truncated !== false || !Array.isArray(page.sources)
      || !Array.isArray(page.claims) || !Array.isArray(page.relations) || !Array.isArray(page.lineage)
      || !Array.isArray(page.withheld_claim_ids) || !Array.isArray(page.withheld_source_ids)
      || page.sources.length !== 1 || page.claims.length || page.relations.length || page.lineage.length
      || page.withheld_claim_ids.length || page.withheld_source_ids.length) return null;
    const fresh = page.sources[0] as CareEntryRow;
    if (!fresh || fresh.deleted_at || versionFields.some(field => (fresh[field] ?? null) !== (candidate[field] ?? null))
      || ("episode_id" in candidate && candidate.episode_id !== fresh.episode_id)) return null;
    const proof: ScopedReportProof = Object.freeze({ kind: "scoped_stored_report.v1",
      sourceId: candidate.id, petId: candidate.pet_profile_id, body: candidate.note,
      occurredAt: candidate.occurred_at, recordedAt: candidate.created_at, updatedAt: candidate.updated_at });
    snapshots.set(proof, JSON.stringify({ userId, ticket, proof }));
    return proof;
  } catch {
    return null;
  }
}

/** This in-process token is not a portable publication certificate. */
export function matchesScopedStoredReport(proof: ScopedReportProof, userId: string, ticket: ReadTicket): boolean {
  return snapshots.get(proof) === JSON.stringify({ userId, ticket, proof });
}


// The receipt stays server-local. It cannot be minted from a cloned evidence
// object or provider output; transfer is allowed only across identical clones.
type ScopedReportSidecar = { proof: ScopedReportProof; userId: string; request: string; message: string; turnId: string; coverage: string; confirmed: boolean };
const sidecars = new WeakMap<object, ScopedReportSidecar>();
export function bindScopedReportSidecar(target: object, input: {
  proof: ScopedReportProof; userId: string; ticket: ReadTicket; request: unknown; message: string; turnId: string;
}): void {
  if (!input.turnId || !matchesScopedStoredReport(input.proof, input.userId, input.ticket))
    throw Error("ASK_SCOPED_REPORT_PROOF_INVALID");
  sidecars.set(target, { proof: input.proof, userId: input.userId,
    request: JSON.stringify(input.request), message: input.message, turnId: input.turnId, coverage: JSON.stringify(target), confirmed: false });
}
export function carryScopedReportSidecar(source: object | undefined, target: object | undefined): void {
  if (!source || !target) return;
  const sidecar = sidecars.get(source);
  if (!sidecar) return;
  if (JSON.stringify(source) !== sidecar.coverage || JSON.stringify(target) !== sidecar.coverage) throw Error("ASK_SCOPED_REPORT_CLONE_CHANGED");
  sidecars.set(target, sidecar);
}
export function confirmScopedReportTurn(target: object | undefined, turnId: string): void {
  if (!target) return;
  const sidecar = sidecars.get(target);
  if (sidecar) sidecar.confirmed = sidecar.turnId === turnId && sidecar.coverage === JSON.stringify(target);
}
export function getScopedReportSidecar(target: object | undefined, request: unknown, message: string): ScopedReportProof | null {
  if (!target) return null;
  const sidecar = sidecars.get(target);
  if (!sidecar || !sidecar.confirmed || sidecar.coverage !== JSON.stringify(target) || sidecar.request !== JSON.stringify(request) || sidecar.message !== message) return null;
  const ticket = (request as {readTicket?: ReadTicket} | undefined)?.readTicket;
  return ticket && matchesScopedStoredReport(sidecar.proof, sidecar.userId, ticket) ? sidecar.proof : null;
}
