import type { CareEntryRow } from "../supabase.ts";
import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import { eventOrder } from "../furvise-brain/read-selection.ts";
import { validateEvidenceNeeds } from "./evidence-needs.ts";

/** Representation scope is server-owned and already resolved. Not a query plan. */
export type ContextScope = Readonly<{ userId: string; windows: readonly Readonly<{
  petId: string; from: string; to: string;
}>[] }>;
const signalBrand: unique symbol = Symbol("grounded_supporting_context");
const signals = new WeakSet<object>();
export type ContextSignal = Readonly<{
  [signalBrand]: true;
  scope: ContextScope; petIds: readonly string[]; terms: readonly string[];
  provenance: Readonly<{ kind: "ticket_hint"; index: number }
    | { kind: "user_span"; turnId: string; start: number; end: number }>;
  priority: number; reservation: number;
}>;
const freezeSignal = (signal: Omit<ContextSignal, typeof signalBrand>): ContextSignal => {
  const grounded = Object.freeze({ ...signal, scope: Object.freeze({ userId: signal.scope.userId,
    windows: Object.freeze(signal.scope.windows.map(w => Object.freeze({ ...w }))) }), petIds: Object.freeze([...signal.petIds].sort()),
    terms: Object.freeze([...signal.terms]), provenance: Object.freeze({ ...signal.provenance }), [signalBrand]: true as const });
  signals.add(grounded); return grounded;
};
const fail = (reason: string): never => { throw new Error("ASK_CONTEXT_ALLOCATION:" + reason); };
function checkScope(scope: ContextScope) {
  if (!scope.userId || !scope.windows.length || new Set(scope.windows.map(w => w.petId)).size !== scope.windows.length
    || scope.windows.some(w => !w.petId || !Number.isFinite(Date.parse(w.from)) || !Number.isFinite(Date.parse(w.to))
      || Date.parse(w.from) >= Date.parse(w.to))) fail("invalid_scope");
}
function policy(priority: number, reservation: number) {
  if (!Number.isSafeInteger(priority) || priority < 0 || !Number.isSafeInteger(reservation) || reservation < 0)
    fail("invalid_reservation");
}
/** Only already-bound ticket hints enter here. No sentence interpretation. */
export function contextSignalsFromTicket(ticket: ReadTicket, scope: ContextScope) {
  checkScope(scope);
  if (ticket.subjects.petIds.some(id => !scope.windows.some(w => w.petId === id
    && (!ticket.temporal.from || Date.parse(w.from) >= Date.parse(ticket.temporal.from))
    && (!ticket.temporal.to || Date.parse(w.to) <= Date.parse(ticket.temporal.to))))) fail("hint_scope");
  return (ticket.searchHints || []).map((term, index) => freezeSignal({
    scope, petIds: ticket.subjects.petIds, terms: [term], provenance: { kind: "ticket_hint", index }, priority: 0, reservation: 1,
  }));
}
/** Explicitly advisory USER spans only. Reuses source validation, discards need IDs.
 * Existing evidenceNeeds are NOT automatically reclassified as optional context.
 * priority/reservation are server policy, never model authority or truth status. */
export function groundContextSignals(raw: readonly Readonly<{
  quote: string; sourceTurnId: string | null; petNames: readonly string[]; terms: readonly string[];
}>[], context: { currentMessage: string; currentTurn?: { id: string } | null;
  conversationTurns: readonly { id: string; role: string; text: string }[] },
  referenceIds: readonly string[], pets: readonly { id: string; name: string | null }[],
  scope: ContextScope, priority = 0, reservation = 1) {
  checkScope(scope); policy(priority, reservation);
  if (raw.some(r => !r || Object.keys(r).sort().join() !== "petNames,quote,sourceTurnId,terms")) fail("signal_fields");
  const scoped = pets.filter(p => scope.windows.some(w => w.petId === p.id));
  const plan = validateEvidenceNeeds(raw.map(r => ({ ...r, order: "context" })),
    context.currentMessage, context.conversationTurns, referenceIds, scoped, { scopeSource: "ticket" });
  if (plan.issues.length || plan.needs.length !== raw.length) fail("ungrounded_signal");
  return plan.needs.map(need => {
    const source = need.sourceTurnId === null ? context.currentMessage
      : context.conversationTurns.find(t => t.id === need.sourceTurnId && t.role === "user")!.text;
    const start = source.indexOf(need.quote);
    return freezeSignal({ scope, petIds: need.petIds?.length ? need.petIds : scoped.map(p => p.id), terms: need.terms,
      provenance: { kind: "user_span", turnId: need.sourceTurnId ?? context.currentTurn?.id ?? "current", start, end: start + need.quote.length },
      priority, reservation });
  });
}
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Literal advisory matching only. No topic aliases, phrase intents, or filtering
// of the factual result. This preserves ticket-hint literal matching semantics.
const matches = (row: CareEntryRow, signal: ContextSignal) => !signal.terms.length || signal.terms.some(term => {
  const needle = normalize(term);
  return !!needle && (" " + normalize((row.title || "") + " " + (row.note || "")) + " ").includes(" " + needle + " ");
});
const size = (row: CareEntryRow) => JSON.stringify(row).length;

/** Pure bounded representation of EXISTING effective records. Never retrieves,
 * resolves corrections, selects a factual answer, certifies, or publishes.
 * Caller must keep support out of factual evidence/authorized-source collections.
 * No combined records property is returned to accidentally widen that collection.
 */
export function allocateSupportingContext(input: {
  scope: ContextScope;
  authoritativeRecords: readonly CareEntryRow[];
  effective: { records: readonly CareEntryRow[]; reliable: boolean; sourceLineage?: readonly { eventId: string }[] };
  signals: readonly ContextSignal[];
  budget: Readonly<{ records: number; chars: number }>;
  ordering: "asc" | "desc";
  acquisition?: readonly Readonly<{ petId: string; state: "available" | "partial" | "unavailable" }>[];
}) {
  const { scope, budget } = input; checkScope(scope);
  if (![budget.records, budget.chars].every(n => Number.isSafeInteger(n) && n >= 0)) fail("invalid_budget");
  if (input.ordering !== "asc" && input.ordering !== "desc") fail("invalid_ordering");
  if (input.signals.some(s => !signals.has(s) || !s.petIds.length || s.scope.userId !== scope.userId
    || s.petIds.some(id => !scope.windows.some(w => w.petId === id && s.scope.windows.some(original => original.petId === id
      && Date.parse(w.from) >= Date.parse(original.from) && Date.parse(w.to) <= Date.parse(original.to)))))) fail("ungrounded_signal_scope");
  if (input.acquisition?.some(a => !scope.windows.some(w => w.petId === a.petId)
    || !["available", "partial", "unavailable"].includes(a.state))) fail("acquisition_scope");
  const valid = (row: CareEntryRow) => row.user_id === scope.userId && !row.deleted_at && !!row.id
    && Number.isFinite(Date.parse(row.created_at)) && scope.windows.some(w => w.petId === row.pet_profile_id
      && Date.parse(row.occurred_at) >= Date.parse(w.from) && Date.parse(row.occurred_at) < Date.parse(w.to));
  const required = new Map(input.authoritativeRecords.map(r => [r.id, r]));
  if (required.size !== input.authoritativeRecords.length || input.authoritativeRecords.some(r => !valid(r))) fail("invalid_authoritative_snapshot");
  const authoritative: CareEntryRow[] = [], authoritativeOmittedIds: string[] = [];
  let chars = 0, count = 0;
  const fits = (row: CareEntryRow) => count < budget.records && chars + size(row) <= budget.chars;
  const retain = (row: CareEntryRow) => { chars += size(row); count++; return Object.freeze({ ...row }); };
  // Preserve semantic order. If mandatory facts cannot fit, do not fill their
  // missing slots with context or pretend their representation is complete.
  for (const row of input.authoritativeRecords) {
    if (fits(row)) authoritative.push(retain(row)); else authoritativeOmittedIds.push(row.id);
  }
  const omitted = new Map<string, string>();
  const pool = new Map<string, CareEntryRow>();
  const unresolved = new Set(input.effective.sourceLineage?.map(s => s.eventId) || []);
  for (const row of input.effective.records) {
    if (!valid(row)) { omitted.set(row.id, "outside_effective_scope"); continue; }
    if (!input.effective.reliable || unresolved.has(row.id)) { omitted.set(row.id, "effective_state_unavailable"); continue; }
    if (input.acquisition?.some(a => a.petId === row.pet_profile_id && a.state === "unavailable")) {
      omitted.set(row.id, "context_acquisition_unavailable"); continue;
    }
    if (required.has(row.id)) {
      if (JSON.stringify(required.get(row.id)) !== JSON.stringify(row)) omitted.set(row.id, "conflicting_support_snapshot");
      continue;
    }
    if (pool.has(row.id) && JSON.stringify(pool.get(row.id)) !== JSON.stringify(row)) omitted.set(row.id, "conflicting_support_snapshot");
    pool.set(row.id, row);
  }
  for (const id of omitted.keys()) pool.delete(id);
  const order = (a: CareEntryRow, b: CareEntryRow) => input.ordering === "asc" ? eventOrder(a, b) : eventOrder(b, a);
  const rows = [...pool.values()].sort(order);
  const groups = input.signals.flatMap(signal => signal.petIds.map(petId => ({ signal, petId,
    key: JSON.stringify([petId, signal.provenance, signal.terms]), rows: rows.filter(r => r.pet_profile_id === petId && matches(r, signal)),
    retainedIds: [] as string[], cursor: 0,
  }))).sort((a, b) => b.signal.priority - a.signal.priority || a.key.localeCompare(b.key));
  const supporting: CareEntryRow[] = [], retained = new Set<string>(), reservedIds: string[] = [];
  function keep(row: CareEntryRow) {
    if (retained.has(row.id)) return true;
    if (!fits(row)) { omitted.set(row.id, "representation_budget"); return false; }
    supporting.push(retain(row)); retained.add(row.id); omitted.delete(row.id); return true;
  }
  if (!authoritativeOmittedIds.length) {
    // One fitting reservation per signal/subject each round, before optional fill.
    // Deterministic subject/provenance order; request subject order has no effect.
    for (let round = 0; round < Math.min(budget.records, Math.max(0, ...groups.map(g => g.signal.reservation))); round++) {
      for (const g of groups) if (round < g.signal.reservation) {
        while (g.cursor < g.rows.length) {
          const row = g.rows[g.cursor++];
          if (keep(row)) { g.retainedIds.push(row.id); if (!reservedIds.includes(row.id)) reservedIds.push(row.id); break; }
        }
      }
    }
    const score = (row: CareEntryRow) => input.signals.filter(s => s.petIds.includes(row.pet_profile_id) && matches(row, s))
      .reduce((sum, s) => sum + 1 + s.priority, 0);
    for (const row of [...rows].sort((a,b) => score(b) - score(a) || order(a,b))) keep(row);
  } else for (const row of rows) omitted.set(row.id, "authoritative_representation_blocked");
  const receipts = groups.map(g => ({ petId: g.petId, provenance: g.signal.provenance,
    matchingIds: g.rows.map(r => r.id), representedIds: g.rows.filter(r => retained.has(r.id)).map(r => r.id),
    omittedIds: g.rows.filter(r => !retained.has(r.id)).map(r => r.id), reservedIds: g.retainedIds }));
  const acquisition = input.acquisition || [];
  const representation = !input.effective.reliable || acquisition.some(a => a.state === "unavailable")
    ? "unavailable" : omitted.size || acquisition.some(a => a.state === "partial") ? "partial" : "complete";
  return Object.freeze({
    authoritative: Object.freeze({ records: Object.freeze(authoritative), omittedIds: Object.freeze(authoritativeOmittedIds),
      representationComplete: authoritativeOmittedIds.length === 0 }),
    supporting: Object.freeze({ role: "supporting_context" as const, maySatisfyObligations: false as const,
      records: Object.freeze(supporting), representation, receipts, reservedIds,
      omissions: [...omitted].map(([eventId, reason]) => ({ eventId, reason })), acquisition }),
    usage: Object.freeze({ records: count, chars }),
  });
}
