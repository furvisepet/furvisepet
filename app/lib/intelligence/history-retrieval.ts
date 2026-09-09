import "server-only";
import { explicitHistoryDays } from "./explicit-history-dates.ts";
import { compareHistoryTime, classifyOccurrenceReport, occurrenceCandidates, orderHistoryEvidence } from "./history-synthesis.ts";
import { createHash } from "node:crypto";
import { discoverDatedCorrectionNotes } from "./dated-correction-notes.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CareEntryRow } from "../supabase.ts";
import type { FurviseLiveContext } from "./types.ts";
import { askEvidenceScope, careEvidenceId, type Completeness } from "./ask-evidence.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { resolveEffectiveClaimGraph, type RebuildClaim, type RebuildRelation } from "./v2/projections/rebuild.ts";

export const HISTORY_BUDGET = { pageSize: 25, pagesPerPet: 4, candidateRows: 64, pets: 3, graphCalls: 6, graphRows: 128, records: 32, chars: 18000, timeMs: 5000 } as const;
type Cursor = { petId: string; occurredAt: string; id: string };
export type HistoryPlan = { from: string | null; to: string | null; terms: string[]; interpretation: "period" | "lexical" | "broad_comparison" };
export type HistoryCoverage = {
  chronology?: Array<{ petId: string; boundaryIds: string[]; blocked: boolean }>;
  plan: HistoryPlan; candidateIds: string[]; queryCount: number;
  retrieval: Completeness; corrections: Completeness; extraction: Completeness; grouping: Completeness;
  continuation: Cursor[]; reasons: string[]; consistency: "read_committed_no_snapshot";
  perPet: Array<{ petId: string; rows: number; pages: number; exhausted: boolean; status: Completeness }>;
  provenance: Array<{ sourceId: string; claimIds: string[]; status: string; subjectId?: string | null }>;
  claimSources: Array<{ petId: string; sourceIds: string[] }>;
  excludedIds: string[];
};
export type RetrievedAskHistory = { coverage: HistoryCoverage; entries: CareEntryRow[]; originals: CareEntryRow[] };
export type DbClaim = Record<string, unknown> & { id: string; user_id: string; subject_id: string; structured_value: unknown };
export type EpisodeClaimValidation = { claims: DbClaim[]; verified: Map<string, string | null>; revision?: string; sourceRevisions?: Map<string, string> };
type DbRelation = { id: string; user_id: string; from_claim_id: string; to_claim_id: string; relation_type: RebuildRelation["relationType"] };
type Lineage = { user_id: string; claim_id: string; legacy_row_id: string; legacy_table: string; claim_role: string };
type GraphPage = { claims: DbClaim[]; relations: DbRelation[]; lineage: Lineage[]; sources: CareEntryRow[]; truncated: boolean; withheld_claim_ids?: string[]; withheld_source_ids?: string[] };

/** Deliberately bounded, deterministic query interpretation. No model query
 * authority. Unknown/disjoint/relative periods stay on the disclosed old path. */
export function planHistoricalQuery(message: string, allowBroadComparison = false): HistoryPlan | null {
  if (!isHistoricalRecall(message)) return null;
  if (!askEvidenceScope(message, []).readOnlyRecall && !(/\b(?:history|lifetime|records?)\b/i.test(message)
    && !analyzeOwnerAssertions(message).hasOwnerAssertion && !/\b(?:save|log|remember)\b/i.test(message))) return null;
  if (/\b(?:second|third|that|which) episode\b/i.test(message)) return null;
  const years = [...new Set(message.match(/\b(?:19|20)\d{2}\b/g) || [])];
  if (years.length > 1 || /\b(?:since|between|last|previous|today|yesterday)\b/i.test(message)) return null;
  const terms: string[] = [];
  for (const [pattern, words] of [
    [/\b(?:vomit\w*|throw\w* up|threw up)\b/i, ["vomit", "threw up", "thrown up"]],
    [/\b(?:stool|diarrh\w*)\b/i, ["stool", "diarrh"]], [/\bweight\w*\b/i, ["weight", "weigh"]],
    [/\b(?:food|diet)\b/i, ["food", "rice", "diet"]], [/\blitter\b/i, ["litter"]],
    [/\b(?:medication|stiffness)\b/i, ["medication", "stiff"]], [/\burine\b/i, ["urine", "urinalysis"]],
    [/\bblood\b/i, ["blood"]], [/\bdiagnos\w*\b/i, ["diagnos"]],
  ] as Array<[RegExp, string[]]>) if (pattern.test(message)) terms.push(...words);
  // Digestive history is a search scope, never an episode boundary or diagnosis.
  if (/\b(?:stomach|digestive|gastrointestinal|GI)\b/i.test(message)) {
    terms.push("stomach", "vomit", "threw up", "thrown up", "stool", "diarrh");
  }
  if (new Set(terms).size > 6) return null;
  let from: string | null = null; let to: string | null = null;
  if (years.length === 1) {
    const year = Number(years[0]);
    const monthName = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.exec(message)?.[0];
    const month = monthName ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(monthName.slice(0, 3).toLowerCase()) : null;
    from = new Date(Date.UTC(year, month ?? 0, 1)).toISOString();
    to = new Date(Date.UTC(month === null ? year + 1 : year, month === null ? 0 : month + 1, 1)).toISOString();
    // Explicit ISO day is narrower than the surrounding year.
    const day = /\b(\d{4}-\d{2}-\d{2})\b/.exec(message)?.[1];
    if (day) {
      const instant = Date.parse(`${day}T00:00:00Z`);
      if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== day) return null;
      from = new Date(instant).toISOString(); to = new Date(instant + 86400000).toISOString();
    }
  }
  if (!from && !terms.length) return allowBroadComparison && /\bcompare\b/i.test(message) && /\bhistor(?:y|ies)\b/i.test(message)
    ? { from: null, to: null, terms: [], interpretation: "broad_comparison" } : null;
  return { from, to, terms: [...new Set(terms)], interpretation: terms.length ? "lexical" : "period" };
}

function isHistoricalRecall(message: string) {
  return !/\b(?:save|log|remember)\b/i.test(message) && !analyzeOwnerAssertions(message).hasOwnerAssertion
    && /\b(?:history|summari[sz]e|overview|review|records?|reported|recorded|episodes?|ever|lifetime|measurements?|notes?|results?|diagnos\w*|(?:19|20)\d{2})\b/i.test(message);
}

/** Called only after conversation subject authorization, inside the real
 * generation callback. Recent safety context is retained separately. */
export async function retrieveAskHistory(context: FurviseLiveContext, db: SupabaseClient, petIds: string[]): Promise<FurviseLiveContext> {
  const authorizedComparisonPets = new Set(petIds.filter(id => context.eligiblePets.some(pet => pet.id === id && pet.user_id === context.owner.userId)));
  const plan = context.askInterpretation ? context.askInterpretation.history : planHistoricalQuery(context.currentMessage, authorizedComparisonPets.size > 1);
  if (context.askInterpretation && !plan) return context;
  if (!plan) return isHistoricalRecall(context.currentMessage) ? { ...context, historyFallback: "unsupported_query_interpretation_recent_context_only" } : context;
  const asOf = Date.now();
  const namedDays = [...explicitHistoryDays(context.currentMessage, new Date(asOf).getUTCFullYear()),
    ...(context.currentMessage.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])];
  const futureSourceRequested = /\b(?:future[- ]dated|tomorrow)\b/i.test(context.currentMessage)
    || namedDays.some(day => Date.parse(day) > asOf);
  const deadline = asOf + HISTORY_BUDGET.timeMs;
  const owned = new Set(context.eligiblePets.filter(pet => pet.user_id === context.owner.userId).map(pet => pet.id));
  const ids = [...new Set(petIds)].filter(id => owned.has(id)).sort();
  const coverage: HistoryCoverage = { plan, candidateIds: [], queryCount: 0, retrieval: "unknown", corrections: "unknown", extraction: "unknown", grouping: "unknown",
    continuation: [], reasons: ["lexical_or_period_matches_not_semantic_completeness", "no_cross_query_snapshot"], consistency: "read_committed_no_snapshot", perPet: [], provenance: [], claimSources: [], excludedIds: [] };
  const descending = context.askInterpretation?.selection === "latest";
  const endpointComparison = context.askInterpretation?.request
    ? context.askInterpretation.selection === "comparison" || context.askInterpretation.readOperation === "comparison"
    : context.askInterpretation?.readOnly === true
    && /\bweights?\b/i.test(context.currentMessage)
    && /\b(?:earliest|first)\b/i.test(context.currentMessage) && /\b(?:latest|last)\b/i.test(context.currentMessage);
  const candidates: CareEntryRow[] = [];
  // Reserve coverage/provenance space independently of model evidence. Split
  // the candidate budget fairly so the first pet cannot consume every slot.
  // Reserve twelve of the existing roots for later correction notes on dated
  // lookups. Supplemental discovery must not expand the graph/input budgets.
  const correctionReserve = plan.from ? 12 : 0;
  const rowsPerPet = Math.floor((HISTORY_BUDGET.candidateRows - correctionReserve) / Math.max(1, Math.min(ids.length, HISTORY_BUDGET.pets)));
  for (const petId of ids.slice(0, HISTORY_BUDGET.pets)) {
    let failed = false; let pages = 0; let exhausted = true;
    const collected: CareEntryRow[] = [];
    const directions = endpointComparison ? [false, true] : [descending];
    // Split the existing candidate/page budget across both ends. Never scan a
    // decade sequentially just to compare the first and last recorded values.
    for (const readDescending of directions) {
      let cursor: Cursor | null = null; let traversalExhausted = false;
      const rows: CareEntryRow[] = [];
      const directionRows = Math.floor(rowsPerPet / directions.length);
      const directionPages = Math.floor(HISTORY_BUDGET.pagesPerPet / directions.length);
      try {
        for (let attempt = 0; attempt < directionPages && !traversalExhausted && rows.length < directionRows; attempt++) {
          pages++;
          coverage.queryCount++;
          const pageLimit = Math.min(HISTORY_BUDGET.pageSize, directionRows - rows.length);
          const signal = readSignal(deadline);
          let result: { data: unknown; error: { code?: string } | null };
          if (plan.terms.length) {
            // The RPC derives auth.uid(). Never pass an owner or fall back to a
            // different lexical authority when its migration/service is missing.
            result = await db.rpc(readDescending ? "read_ask_history_candidates_latest" : "read_ask_history_candidates", {
              p_pet_id: petId, p_terms: plan.terms,
              p_from: plan.from || (futureSourceRequested ? null : "1900-01-01T00:00:00.000Z"),
              p_to: futureSourceRequested ? plan.to : new Date(Math.min(plan.to ? Date.parse(plan.to) : Infinity, asOf + 1)).toISOString(),
              p_after_time: cursor?.occurredAt ?? null, p_after_id: cursor?.id ?? null, p_limit: pageLimit,
            }).abortSignal(signal);
            if (result.error) coverage.reasons.push(signal.aborted || result.error.code === "57014" ? "candidate_rpc_timeout"
              : result.error.code === "55000" ? "candidate_rpc_timeout_configuration" : "candidate_rpc_unavailable");
          } else {
            let query = db.from("pet_care_entries").select("id,user_id,pet_profile_id,category,title,note,severity,occurred_at,created_at,updated_at,deleted_at").eq("user_id", context.owner.userId).eq("pet_profile_id", petId).is("deleted_at", null);
            if (!futureSourceRequested) query = query.lt("occurred_at", new Date(asOf + 1).toISOString());
            if (plan.from) query = query.gte("occurred_at", plan.from);
            if (plan.to) query = query.lt("occurred_at", plan.to);
            if (cursor) query = query.or(`occurred_at.${readDescending ? "lt" : "gt"}.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.${readDescending ? "lt" : "gt"}.${cursor.id})`);
            result = await query.order("occurred_at", { ascending: !readDescending }).order("id", { ascending: !readDescending }).limit(pageLimit).abortSignal(signal).returns<CareEntryRow[]>();
          }
          if (result.error) throw new Error("history_page_unavailable");
          if (result.data !== null && !Array.isArray(result.data)) throw new Error("history_page_invalid_shape");
          const page = (result.data || []) as CareEntryRow[];
          if (page.length > pageLimit) throw new Error("history_page_bound_exceeded");
          // Never tolerate a mock/misconfigured boundary returning foreign rows.
          if (page.some(row => row.user_id !== context.owner.userId || row.pet_profile_id !== petId || row.deleted_at)) throw new Error("history_scope_mismatch");
          if (!page.length) { traversalExhausted = true; break; }
          for (const row of page) {
            if (!/^[a-zA-Z0-9_-]+$/.test(row.id) || !row.occurred_at || !Number.isFinite(Date.parse(row.occurred_at))) throw new Error("invalid_history_cursor");
            const next: Cursor = { petId, occurredAt: row.occurred_at, id: row.id };
            const advance = cursor ? compareHistoryTime(next.occurredAt, cursor.occurredAt) || next.id.localeCompare(cursor.id) : 0;
            if (cursor && (readDescending ? advance >= 0 : advance <= 0)) throw new Error("non_advancing_history_cursor");
            cursor = next; rows.push(row);
          }
          // Do not infer exhaustion from a short page: a server row cap may be
          // smaller than requested. An empty next page is the only traversal end.
        }
      } catch (error) {
        failed = true; coverage.reasons.push("history_page_unavailable_or_changed");
        if (error instanceof Error && (error.message === "history_time_budget" || ["AbortError", "TimeoutError"].includes(error.name))) {
          coverage.reasons.push(plan.terms.length ? "candidate_rpc_timeout" : "history_time_budget");
        }
      }
      if (!traversalExhausted && cursor) coverage.continuation.push(cursor);
      exhausted = exhausted && traversalExhausted;
      collected.push(...rows);
    }
    const unique = new Map<string, CareEntryRow>();
    const changed = new Set<string>();
    for (const row of collected) {
      const previous = unique.get(row.id);
      if (previous && !sameCandidateVersion(previous, row)) changed.add(row.id);
      unique.set(row.id, row);
    }
    if (changed.size) {
      failed = true;
      coverage.reasons.push("source_deleted_or_changed");
      coverage.excludedIds.push(...[...changed].map(id => `care:${id}`));
    }
    const rows = [...unique.values()].filter(row => !changed.has(row.id));
    coverage.perPet.push({ petId, rows: rows.length, pages, exhausted, status: failed ? "unavailable" : exhausted ? "unknown" : "partial" });
    candidates.push(...rows);
  }
  if (ids.length > HISTORY_BUDGET.pets) coverage.reasons.push("pet_query_budget");
  if (endpointComparison) coverage.reasons.push("bidirectional_endpoint_subset");
  coverage.retrieval = coverage.perPet.some(p => p.status === "unavailable") ? "unavailable" : coverage.continuation.length || ids.length > HISTORY_BUDGET.pets ? "partial" : "unknown";
  if (correctionReserve && coverage.retrieval !== "unavailable") {
    candidates.push(...await discoverDatedCorrectionNotes(candidates, ids.slice(0, HISTORY_BUDGET.pets), context.owner.userId, db, coverage, deadline));
  }
  coverage.candidateIds = candidates.map(row => `care:${row.id}`);
  const entries = await effectiveCandidates(candidates, owned, ids, context.owner.userId, db, coverage, deadline);
  if (!candidates.length && !entries.length && coverage.retrieval !== "unavailable" && coverage.corrections !== "unavailable") coverage.reasons.push("no_matching_candidates_not_absence");
  const selection = context.askInterpretation?.selection;
  const occurrence = (entry: CareEntryRow) => classifyOccurrenceReport([entry.title, entry.note].filter(Boolean).join(": "),
    context.eligiblePets.find(pet => pet.id === entry.pet_profile_id)?.name || "", plan.terms);
  const matchingEntries = entries.filter(entry => (futureSourceRequested || Date.parse(entry.occurred_at) <= asOf)
    && (!plan.terms.length || plan.terms.some(term =>
    `${entry.title || ""} ${entry.note}`.toLocaleLowerCase().includes(term.toLocaleLowerCase()))));
  const relevant = selection === "earliest_occurrence" ? ids.flatMap(petId => occurrenceCandidates(matchingEntries.filter(entry => entry.pet_profile_id === petId), occurrence, entry => entry.occurred_at)) : matchingEntries;
  const relevantIds = new Set(relevant.map(entry => entry.id));
  const ordered = orderHistoryEvidence(matchingEntries, selection, entry => entry.occurred_at, entry => entry.id, entry => entry.pet_profile_id,
    selection === "earliest_occurrence" ? entry => relevantIds.has(entry.id) ? 0 : 1 : undefined);
  // Broad food summaries should retain explicit diet records before incidental
  // appetite/eating matches. This is ranking only; keep all candidates and losses.
  if (!context.askInterpretation?.request && ["summary", "comparison"].includes(selection || "") && /\b(?:foods?|diet)\b/i.test(context.currentMessage)) {
    const explicitFood = (entry: CareEntryRow) => /\b(?:food|diet|kibble|treats?)\b/i.test(`${entry.title || ""} ${entry.note}`) ? 0 : 1;
    ordered.sort((a, b) => explicitFood(a) - explicitFood(b));
  }
  if (selection?.startsWith("earliest") || descending) {
    // Save the effective boundary BEFORE either evidence budget. Final rendering
    // checks these IDs against the actual represented spans, never row counts.
    coverage.chronology = ids.map(petId => {
      const matching = ordered.filter(entry => entry.pet_profile_id === petId && relevantIds.has(entry.id));
      const boundary = matching[0]?.occurred_at;
      const cursor = coverage.continuation.find(cursor => cursor.petId === petId);
      const blocked = coverage.perPet.find(pet => pet.petId === petId)?.status === "unavailable"
        || coverage.corrections === "unavailable" || (coverage.reasons.includes("unsupported_claim_payload") || coverage.reasons.includes("unknown_effective_event_date"))
        || candidates.some(row => row.pet_profile_id === petId && coverage.provenance.some(source => source.sourceId === `care:${row.id}` && source.status === "deleted_or_changed"))
        // A corrected date may cross the unvisited frontier. Equal timestamps
        // also mean an unseen tied/conflicting record may remain on the next page.
        || !!(boundary && cursor && (descending ? compareHistoryTime(boundary, cursor.occurredAt) <= 0 : compareHistoryTime(boundary, cursor.occurredAt) >= 0));
      return { petId, boundaryIds: matching.filter(entry => compareHistoryTime(entry.occurred_at, boundary || "") === 0).map(entry => careEvidenceId(entry.id, coverage)), blocked };
    });
  }
  const kept: CareEntryRow[] = []; let chars = 0; let budgetExcluded = false;
  for (const entry of ordered) {
    const size = JSON.stringify(entry).length;
    if (kept.length >= HISTORY_BUDGET.records || chars + size > HISTORY_BUDGET.chars) { coverage.excludedIds.push(careEvidenceId(entry.id, coverage)); budgetExcluded = true; continue; }
    kept.push(entry); chars += size;
  }
  if (budgetExcluded) coverage.reasons.push("effective_evidence_budget");
  return { ...context, askHistory: { coverage, entries: kept, originals: candidates } };
}

function readSignal(deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("history_time_budget");
  return AbortSignal.timeout(remaining);
}

/** The emitted candidate must be the same version as the source validated by
 * the RPC/lineage checks. Do not replace it with a fresh row: pet, period or
 * lexical topic membership may have changed since candidate selection. */
function sameCandidateVersion(candidate: CareEntryRow, fresh: CareEntryRow | undefined) {
  const fields = ["id", "user_id", "pet_profile_id", "category", "title", "note", "severity",
    "occurred_at", "created_at", "updated_at", "deleted_at"] as const;
  return Boolean(fresh && !fresh.deleted_at && fields.every(field => (candidate[field] ?? null) === (fresh[field] ?? null))
    && (!("episode_id" in candidate) || candidate.episode_id === fresh.episode_id));
}

export async function effectiveCandidates(candidates: CareEntryRow[], owned: Set<string>, requestedPets: string[], userId: string, db: SupabaseClient, coverage: HistoryCoverage, deadline: number, episodeClaims?: EpisodeClaimValidation): Promise<CareEntryRow[]> {
  const claims = new Map<string, DbClaim>(); const relations = new Map<string, DbRelation>(); const links = new Map<string, Lineage>(); const sources = new Map<string, CareEntryRow>();
  const removedTargets = new Set<string>();
  const removedSources = new Set<string>();
  let frontier: string[] = episodeClaims?.claims.map(c => c.id) || []; const visited = new Set<string>();
  try {
    episodeClaims?.verified.clear();
    // Batch the candidate roots so no request or graph frontier grows unbounded.
    const batches = Array.from({ length: Math.ceil(candidates.length / 64) }, (_, i) => candidates.slice(i * 64, (i + 1) * 64).map(row => row.id));
    const visitedCare = new Set(candidates.map(c => c.id));
    if (!batches.length) batches.push([]);
    for (let call = 0; batches.length || frontier.length; call++) {
      if (call >= HISTORY_BUDGET.graphCalls) throw new Error("correction_budget");
      const rootIds = batches.shift() || [];
      const claimIds = frontier.splice(0, 64); claimIds.forEach(id => visited.add(id));
      coverage.queryCount++;
      const result = await db.rpc("read_ask_history_correction_page", {
        p_care_ids: rootIds, p_claim_ids: claimIds,
        // A reassigned event may have no legacy row under its corrected pet.
        // Seed only stored correction authors, never arbitrary shadow claims.
        p_seed_pet_ids: call === 0 ? requestedPets.slice(0, HISTORY_BUDGET.pets) : [],
        p_event_from: coverage.plan.from, p_event_to: coverage.plan.to, p_terms: coverage.plan.terms,
      }).abortSignal(readSignal(deadline));
      if (result.error || !result.data || result.data.truncated) throw new Error("correction_read_incomplete");
      const page = result.data as GraphPage;
      for (const id of page.withheld_claim_ids || []) removedTargets.add(id);
      for (const id of page.withheld_source_ids || []) removedSources.add(id);
      const returnedEdges = new Set(page.relations.filter(edge => edge.user_id === userId).map(edge => edge.id));
      if ([...relations.values()].some(edge => (claimIds.includes(edge.from_claim_id) || claimIds.includes(edge.to_claim_id)) && !returnedEdges.has(edge.id))) throw new Error("correction_changed_during_read");
      for (const next of page.claims.filter(claim => claim.user_id === userId)) {
        const prior = claims.get(next.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(next)) throw new Error("claim_changed_during_read");
      }
      for (const row of page.sources) if (row.user_id === userId && owned.has(row.pet_profile_id)) sources.set(row.id, row);
      for (const claim of page.claims) if (claim.user_id === userId && owned.has(claim.subject_id)) claims.set(claim.id, claim);
      coverage.claimSources = requestedPets.map(petId => ({ petId, sourceIds: [...claims.values()].filter(claim => claim.subject_id === petId).map(claim => `claim:${claim.id}`).sort() }));
      for (const relation of page.relations) if (relation.user_id === userId) relations.set(relation.id, relation);
      for (const link of page.lineage) if (link.user_id === userId && link.legacy_table === "pet_care_entries") links.set(link.claim_id, link);
      // Imported claim roots also need care-root tombstone lookup. The existing
      // RPC returns withheld_source_ids only for explicitly requested care IDs.
      if (episodeClaims) {
        const newCare = [...links.values()].map(l=>l.legacy_row_id).filter(id=>!visitedCare.has(id));
        newCare.forEach(id=>visitedCare.add(id));
        for (let i=0;i<newCare.length;i+=64) batches.push(newCare.slice(i,i+64));
      }
      if (claims.size > HISTORY_BUDGET.graphRows || relations.size > HISTORY_BUDGET.graphRows) throw new Error("correction_budget");
      frontier = [...new Set([...frontier, ...claims.keys()])].filter(id => !visited.has(id));
    }
    const graphRelations = [...relations.values()];
    if (graphRelations.some(edge => !claims.has(edge.from_claim_id) || !claims.has(edge.to_claim_id))) throw new Error("missing_relation_endpoint");
    // Compare the authoritative current source with the candidate and imported
    // payload. Changed/deleted sources must not silently reuse a stale import.
    for (const link of links.values()) {
      const source = sources.get(link.legacy_row_id); const claim = claims.get(link.claim_id);
      if (!source || !claim) throw new Error("missing_lineage_source");
      const value = claim.structured_value as { note?: unknown; title?: unknown; severity?: unknown } | null;
      if (!value || value.note !== source.note || (value.title ?? null) !== (source.title ?? null) || (value.severity ?? null) !== (source.severity ?? null)
        || claim.subject_id !== source.pet_profile_id || claim.occurred_at !== source.occurred_at) throw new Error("stale_lineage");
      if (source.deleted_at || removedSources.has(source.id)) claim.knowledge_status = "tombstoned";
    }
    for (const id of removedTargets) if (claims.has(id)) claims.get(id)!.knowledge_status = "tombstoned";
    const mapped = [...claims.values()].map((claim): RebuildClaim => ({ id: claim.id, userId, subjectId: claim.subject_id, subjectType: String(claim.subject_type),
      claimKind: String(claim.claim_kind), operationType: claim.operation_type as RebuildClaim["operationType"], conceptKey: String(claim.concept_key),
      canonicalConceptKey: typeof claim.canonical_concept_key === "string" ? claim.canonical_concept_key : null, conceptResolutionStatus: claim.concept_resolution_status as RebuildClaim["conceptResolutionStatus"],
      lifecycleCapable: false, lifecycleRole: null, lifecycleTransition: null, persistenceDestination: String(claim.persistence_destination),
      knowledgeStatus: claim.knowledge_status as RebuildClaim["knowledgeStatus"], occurredAt: typeof claim.occurred_at === "string" ? claim.occurred_at : null,
      recordedAt: String(claim.recorded_at), provenanceClassification: String(claim.provenance_classification), structuredValue: claim.structured_value }));
    const graph = resolveEffectiveClaimGraph(mapped, graphRelations.map(edge => ({ fromClaimId: edge.from_claim_id, toClaimId: edge.to_claim_id, relationType: edge.relation_type })));
    if (graph.ambiguousOperationClaimIds.length || graph.invalidRelationClaimIds.length) throw new Error("ambiguous_correction_graph");
    if (episodeClaims) episodeClaims.revision = createHash("sha256").update(JSON.stringify([
      [...claims.values()].sort((a,b)=>a.id.localeCompare(b.id)), [...relations.values()].sort((a,b)=>a.id.localeCompare(b.id)),
      [...links.values()].sort((a,b)=>a.claim_id.localeCompare(b.claim_id)), [...sources.values()].sort((a,b)=>a.id.localeCompare(b.id)),
      [...removedTargets].sort(), [...removedSources].sort(),
    ])).digest("hex");
    if (episodeClaims) {
      // Saved page references must not depend on unrelated, undisplayed groups.
      // Hash each source's complete connected correction/lineage component.
      episodeClaims.sourceRevisions = new Map();
      const roots = [...candidates.map(c => ({key:`care:${c.id}`,care:c.id,claim:null as string | null})),
        ...episodeClaims.claims.map(c => ({key:`claim:${c.id}`,care:null as string | null,claim:c.id}))];
      for (const root of roots) {
        const careIds = new Set(root.care ? [root.care] : []);
        const claimIds = new Set(root.claim ? [root.claim] : []);
        let changed = true;
        while (changed) {
          const before = careIds.size + claimIds.size;
          for (const l of links.values()) if (careIds.has(l.legacy_row_id) || claimIds.has(l.claim_id)) {
            careIds.add(l.legacy_row_id); claimIds.add(l.claim_id);
          }
          for (const e of relations.values()) if (claimIds.has(e.from_claim_id) || claimIds.has(e.to_claim_id)) {
            claimIds.add(e.from_claim_id); claimIds.add(e.to_claim_id);
          }
          changed = before !== careIds.size + claimIds.size;
        }
        episodeClaims.sourceRevisions.set(root.key,createHash("sha256").update(JSON.stringify([
          [...claims.values()].filter(c=>claimIds.has(c.id)).sort((a,b)=>a.id.localeCompare(b.id)),
          [...relations.values()].filter(e=>claimIds.has(e.from_claim_id)||claimIds.has(e.to_claim_id)).sort((a,b)=>a.id.localeCompare(b.id)),
          [...links.values()].filter(l=>claimIds.has(l.claim_id)).sort((a,b)=>a.claim_id.localeCompare(b.claim_id)),
          [...sources.values()].filter(c=>careIds.has(c.id)).sort((a,b)=>a.id.localeCompare(b.id)),
          [...removedTargets].filter(id=>claimIds.has(id)).sort(),[...removedSources].filter(id=>careIds.has(id)).sort(),
        ])).digest("hex"));
      }
    }
    for (const candidate of episodeClaims?.claims || []) {
      const fresh = claims.get(candidate.id);
      // Both readers return stored claim objects. Compare every supplied field;
      // omitted payloads and changed concept/role/owner cannot inherit membership.
      if (!fresh || Object.keys(candidate).some(key => JSON.stringify(candidate[key]) !== JSON.stringify(fresh[key]))
        || !graph.effectiveClaimIds.has(candidate.id)) continue;
      const lineage = links.get(candidate.id);
      if (candidate.source_type === "legacy_import" && !lineage) continue;
      if (lineage && (lineage.claim_role !== "primary" || removedSources.has(lineage.legacy_row_id))) continue;
      episodeClaims!.verified.set(candidate.id, lineage?.legacy_row_id || null);
      coverage.provenance.push({sourceId:`claim:${candidate.id}`,claimIds:[candidate.id],status:"effective_episode_member"});
    }
    const output: CareEntryRow[] = [];
    const linkedCandidates = new Set<string>();
    for (const original of candidates) {
      if (removedSources.has(original.id)) {
        coverage.provenance.push({ sourceId: `care:${original.id}`, claimIds: [], status: "tombstoned_or_inactive" });
        continue;
      }
      const related = [...links.values()].filter(link => link.legacy_row_id === original.id);
      // Mark these before withholding so the same claim cannot re-enter below
      // disguised as a replacement. This check applies to linked AND legacy rows.
      related.forEach(link => linkedCandidates.add(link.claim_id));
      if (!sameCandidateVersion(original, sources.get(original.id))) {
        coverage.provenance.push({ sourceId: `care:${original.id}`, claimIds: related.map(link => link.claim_id), status: "deleted_or_changed" });
        coverage.excludedIds.push(`care:${original.id}`); coverage.reasons.push("source_deleted_or_changed"); continue;
      }
      if (!related.length) {
        const unlinkedCorrection = /\b(?:correct\w*|retract\w*|supersed\w*)\b/i.test(`${original.title || ""} ${original.note}`);
        coverage.provenance.push({ sourceId: `care:${original.id}`, claimIds: [], status: unlinkedCorrection ? "unlinked_correction_uncertain" : "unverified_legacy" });
        if (unlinkedCorrection) coverage.reasons.push("unlinked_correction_uncertain");
        output.push(original); continue;
      }
      const effective = related.some(link => graph.effectiveClaimIds.has(link.claim_id));
      const inactive = related.some(link => claims.get(link.claim_id)?.knowledge_status !== "effective");
      coverage.provenance.push({ sourceId: `care:${original.id}`, claimIds: related.map(link => link.claim_id), status: effective ? "effective_linked" : inactive ? "tombstoned_or_inactive" : "superseded" });
      if (effective) output.push(original);
    }
    const replacementAuthors = new Set(graphRelations.filter(edge => ["corrects", "supersedes"].includes(edge.relation_type)).map(edge => edge.from_claim_id));
    for (const claim of mapped.filter(claim => graph.effectiveClaimIds.has(claim.id) && !linkedCandidates.has(claim.id) && replacementAuthors.has(claim.id))) {
      const eventTime = claim.occurredAt ? Date.parse(claim.occurredAt) : NaN;
      const outsidePeriod = Boolean((coverage.plan.from || coverage.plan.to) && (!Number.isFinite(eventTime)
        || coverage.plan.from && eventTime < Date.parse(coverage.plan.from)
        || coverage.plan.to && eventTime >= Date.parse(coverage.plan.to)));
      coverage.provenance.push({ sourceId: `claim:${claim.id}`, claimIds: [claim.id], status: !requestedPets.includes(claim.subjectId!) ? "reassigned_outside_requested_pet" : outsidePeriod ? "outside_requested_period" : "effective_replacement", subjectId: claim.subjectId });
      if (outsidePeriod) continue;
      if (!requestedPets.includes(claim.subjectId!) || claim.persistenceDestination !== "history") continue;
      const value = claim.structuredValue as { note?: unknown } | null;
      // Only an opaque complete stored payload is rendered, with no inferred
      // clinical lifecycle or projection cutover. Other shapes remain missing.
      if (!value || typeof value.note !== "string") { coverage.reasons.push("unsupported_claim_payload"); continue; }
      if (!Number.isFinite(eventTime)) coverage.reasons.push("unknown_effective_event_date");
      const stored = claims.get(claim.id)!;
      output.push({ id: `claim-${claim.id}`, user_id: userId, category: "general", severity: null, deleted_at: null, pet_profile_id: claim.subjectId!, note: value.note,
        title: `Replacement recorded ${claim.recordedAt} for event ${claim.occurredAt || "unknown"} (polarity: ${String(stored.polarity || "unknown")}; modality: ${String(stored.modality || "unknown")})`,
        occurred_at: claim.occurredAt || claim.recordedAt, created_at: claim.recordedAt, updated_at: claim.recordedAt });
    }
    // Even a closed linked graph does not certify that all legacy corrections
    // were linked or imported. No semantic completeness claim is made.
    return output;
  } catch {
    episodeClaims?.verified.clear();
    coverage.corrections = "unavailable"; coverage.reasons.push("correction_closure_unavailable_or_ambiguous");
    coverage.provenance = candidates.map(row => ({ sourceId: `care:${row.id}`, claimIds: [], status: "withheld_correction_authority" }));
    return [];
  }
}
