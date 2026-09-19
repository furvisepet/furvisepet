import { wholeAskTaskQuestion } from "./ask-task-continuation.ts";
import { calendarPeriodContaining, oldestCalendarUnit } from "./history-periods.ts";
import { calendarWindowToInstants } from "../ask-time-zone.ts";
import { calendarDateInZone } from "../ask-time-zone.ts";
import { careOccurrence, calendarCandidateWindow } from "./care-occurrence.ts";
import { withExecutionDeadline } from "../ai/execution-deadline.ts";
import { readRecordInventory } from "./record-inventory.ts";
import { ASK_HISTORY_MAX_PETS } from "./history-limits.ts";
import { literalHistoryMonthWindow, literalHistoryYearWindow, withinEvidenceNeedWindow } from "./history-dates.ts";
import { historyQueryTerms, historyQueryRelevance, historyEventTerms, historySearchGroups, historyEventRelevance } from "./history-query-relevance.ts";
import { clipHistoryPlan, historyDateAccessible } from "./history-access.ts";
import "server-only";
import { compileHistoryReadStrategies, type HistoryReadStrategy } from "./history-read-strategies.ts";
import { explicitHistoryDays } from "./history-dates.ts";
import { compareHistoryTime, classifyOccurrenceReport, occurrenceCandidates, orderHistoryEvidence } from "./history-synthesis.ts";
import { createHash } from "node:crypto";
import { discoverDatedCorrectionNotes } from "./dated-correction-notes.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CareEntryRow } from "../supabase.ts";
import type { FurviseLiveContext } from "./types.ts";
import { askEvidenceScope, careEvidenceId, type Completeness } from "./ask-evidence.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { resolveEffectiveClaimGraph, type RebuildClaim, type RebuildRelation } from "./v2/projections/rebuild.ts";

export const HISTORY_BUDGET = { pageSize: 25, pagesPerPet: 4, totalPages: 20, candidateRows: 64, pets: ASK_HISTORY_MAX_PETS, graphCalls: 6, graphRows: 128, records: 32, chars: 18000, timeMs: 5000 } as const;
type Cursor = { petId: string; occurredAt: string; id: string };
export type HistoryPlan = { from: string | null; to: string | null; terms: string[]; interpretation: "period" | "lexical" | "broad_comparison" };
export type HistoryCoverage = {
  periods?: Array<{ petId: string; from: string; to: string; candidateIds: string[]; exhausted: boolean }>;
  /** True only when every server-owned bounded context need exhausted its full
   * authorized window for every applicable pet. This may raise prompt capacity
   * within the existing Ask admission ceiling; it never certifies semantics. */
  exhaustiveBoundedContext?: boolean;
  eventCandidateIds?: string[];
  requiredSourceIds?: string[];
  needs?: Array<{ petId: string; needId: string; candidateIds: string[]; exhausted: boolean; status: Completeness; reason?: string }>;
  targets?: Array<{ petId: string; day: string; candidateIds: string[]; retainedIds: string[]; exhausted: boolean; status: Completeness }>;
  chronology?: Array<{ petId: string; boundaryIds: string[]; blocked: boolean }>;
  endpointPairs?: Array<{ petId: string; earliestIds: string[]; latestIds: string[]; blocked: boolean }>;
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
  const literalPeriod = literalHistoryMonthWindow(message) || literalHistoryYearWindow(message) || null;
  if (!askEvidenceScope(message, []).readOnlyRecall && !literalPeriod && !(/\b(?:history|lifetime|records?)\b/i.test(message)
    && !analyzeOwnerAssertions(message).hasOwnerAssertion && !/\b(?:save|log|remember)\b/i.test(message))) return null;
  if (/\b(?:second|third|that|which) episode\b/i.test(message)) return null;
  const years = [...new Set(message.match(/\b(?:19|20)\d{2}\b/g) || [])];
  const closedYearRange = /\b(?:from\s+)?((?:19|20)\d{2})\s+(?:through|thru|to|[-\u2013\u2014])\s+((?:19|20)\d{2})\b/i.exec(message);
  if (years.length > 2 || years.length === 2 && !closedYearRange || /\b(?:since|between|last|previous|today|yesterday)\b/i.test(message)) return null;
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
  let from: string | null = literalPeriod?.from ? new Date(literalPeriod.from).toISOString() : null;
  let to: string | null = literalPeriod?.to ? new Date(literalPeriod.to).toISOString() : null;
  if (closedYearRange) {
    const startYear = Number(closedYearRange[1]), endYear = Number(closedYearRange[2]);
    if (startYear > endYear) return null;
    from = new Date(Date.UTC(startYear, 0, 1)).toISOString();
    to = new Date(Date.UTC(endYear + 1, 0, 1)).toISOString();
  }
  const explicitDays = years.length === 1 ? explicitHistoryDays(message, Number(years[0]), 8).sort() : [];
  const closedDayRange = explicitDays.length === 2 && /\b(?:from|between)\b[\s\S]*\b(?:through|thru|to|and)\b/i.test(message);
  if (closedDayRange) {
    from = new Date(`${explicitDays[0]}T00:00:00Z`).toISOString();
    to = new Date(Date.parse(`${explicitDays[1]}T00:00:00Z`) + 86400000).toISOString();
  } else if (years.length === 1 && !literalPeriod) {
    const year = Number(years[0]);
    from = new Date(Date.UTC(year, 0, 1)).toISOString();
    to = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
  }
  // Explicit ISO day is narrower than the surrounding month/year.
  const day = /\b(\d{4}-\d{2}-\d{2})\b/.exec(message)?.[1];
  if (day) {
    const instant = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== day) return null;
    from = new Date(instant).toISOString(); to = new Date(instant + 86400000).toISOString();
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
export async function retrieveAskHistory(context: FurviseLiveContext, db: SupabaseClient, petIds: string[], vetBriefRead?: { plan: HistoryPlan; termGroups: string[][]; periodFrom?: string | null; periodTo?: string | null }): Promise<FurviseLiveContext> {
  if (vetBriefRead && context.feature !== "vet_brief") throw new Error("vet_brief_read_scope_required");
  context = { ...context, recordInventory: await readRecordInventory(context, db) };
  const authorizedComparisonPets = new Set(petIds.filter(id => context.eligiblePets.some(pet => pet.id === id && pet.user_id === context.owner.userId)));
  const proposedPlan = vetBriefRead?.plan ?? (context.askInterpretation ? context.askInterpretation.history : planHistoricalQuery(context.currentMessage, authorizedComparisonPets.size > 1));
  const plan = proposedPlan ? clipHistoryPlan(proposedPlan, context.historyAccess) : null;
  if (context.askInterpretation && !plan) return context;
  if (!plan) return isHistoricalRecall(context.currentMessage) ? { ...context, historyFallback: "unsupported_query_interpretation_recent_context_only" } : context;
  const sharedRead = context.askInterpretation?.request?.mode === "read";
  const retrievalQuestion = context.askInterpretation?.request?.task?.originalRequest ? wholeAskTaskQuestion(context) : context.askInterpretation?.request?.referenceTurnIds.length
    ? context.askInterpretation.referenceQuestion || context.currentMessage : context.currentMessage;
  const eventTerms = sharedRead ? historyEventTerms(context.currentMessage) : [];
  const searchTerms = context.askInterpretation?.request
    ? historyQueryTerms(plan.terms, context.eligiblePets.map(pet => pet.name || ""))
    : plan.terms;
  const asOf = Date.now();
  const namedDays = [...explicitHistoryDays(context.currentMessage, new Date(asOf).getUTCFullYear()),
    ...(context.currentMessage.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])];
  // A future appointment is not permission to retrieve future-dated records.
  // Vet Brief always reviews history through its already bounded as-of date.
  const futureSourceRequested = !vetBriefRead && (/\b(?:future[- ]dated|tomorrow)\b/i.test(context.currentMessage)
    || namedDays.some(day => Date.parse(day) > asOf));
  const deadline = asOf + (vetBriefRead ? 15_000 : HISTORY_BUDGET.timeMs);
  // Candidate discovery cannot spend the time needed to validate those
  // candidates. Reserve both correction discovery and linked-source closure
  // within the same overall Ask budget; Vet Brief retains its own allocation.
  const candidateDeadline = vetBriefRead ? deadline : deadline - 2_500;
  const correctionDiscoveryDeadline = vetBriefRead ? deadline : deadline - 1_250;
  const owned = new Set(context.eligiblePets.filter(pet => pet.user_id === context.owner.userId).map(pet => pet.id));
  const ids = [...new Set(petIds)].filter(id => owned.has(id)).sort();
  const coverage: HistoryCoverage = { plan, candidateIds: [], queryCount: 0, retrieval: "unknown", corrections: "unknown", extraction: "unknown", grouping: "unknown",
    continuation: [], reasons: ["lexical_or_period_matches_not_semantic_completeness", "no_cross_query_snapshot"], consistency: "read_committed_no_snapshot", perPet: [], provenance: [], claimSources: [], excludedIds: [] };
  if (context.historyAccess) coverage.reasons.push("subscription_history_window");
  if (context.askInterpretation?.request?.evidenceBasis === "saved_profile") {
    coverage.reasons = ["current_profile_read_no_history_requested"];
    return { ...context, askHistory: { coverage, entries: [], originals: [] } };
  }
  if (plan.from && plan.to && plan.from >= plan.to) {
    coverage.reasons.push("requested_period_outside_subscription_window");
    return { ...context, askHistory: { coverage, entries: [], originals: [] } };
  }
  const latestSavedCareRead = sharedRead && (
    /\b(?:last|latest|most recent|newest)\b[^.!?]{0,80}\b(?:care[- ]history\s+)?(?:receipt|entry|note|record)\b/i.test(context.currentMessage)
    || /\b(?:last|latest|most recent|newest)\s+thing\s+(?:i|we)\s+(?:saved|logged|recorded)\b/i.test(context.currentMessage)
  );
  if (latestSavedCareRead) {
    const candidates: CareEntryRow[] = [];
    let failed = false;
    // Read by actual save time, not event date. Eight roots per pet keeps the
    // correction/tombstone fallback bounded while allowing a few recent saves
    // to be invalidated without silently choosing a stale record.
    for (const petId of ids.slice(0, HISTORY_BUDGET.pets)) {
      coverage.queryCount++;
      try {
        const result = await withExecutionDeadline(signal => db.from("pet_care_entries").select("*")
          .eq("user_id", context.owner.userId).eq("pet_profile_id", petId).is("deleted_at", null)
          .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(8)
          .abortSignal(signal).returns<CareEntryRow[]>(), historyReadRemaining(candidateDeadline));
        if (result.error) throw new Error("latest_saved_history_unavailable");
        const rows = (result.data || []).filter(row => row.user_id === context.owner.userId && row.pet_profile_id === petId && !row.deleted_at);
        candidates.push(...rows);
        coverage.perPet.push({ petId, rows: rows.length, pages: 1, exhausted: rows.length < 8, status: "unknown" });
      } catch {
        failed = true;
        coverage.perPet.push({ petId, rows: 0, pages: 1, exhausted: false, status: "unavailable" });
        coverage.reasons.push("latest_saved_history_unavailable");
      }
    }
    if (failed) {
      coverage.retrieval = "unavailable";
      return { ...context, askHistory: { coverage, entries: [], originals: candidates } };
    }
    coverage.candidateIds = candidates.map(row => `care:${row.id}`);
    const effective = await effectiveCandidates(candidates, owned, ids, context.owner.userId, db, coverage, deadline);
    const chosen = ids.flatMap(petId => {
      const rows = effective.filter(row => row.pet_profile_id === petId && historyDateAccessible(row.occurred_at, context.historyAccess))
        .sort((a,b) => compareHistoryTime(b.created_at, a.created_at) || b.id.localeCompare(a.id));
      return rows.slice(0, 1);
    });
    if (chosen.length !== ids.length) {
      coverage.retrieval = "partial";
      coverage.reasons.push("latest_saved_effective_boundary_unavailable");
    } else {
      coverage.retrieval = "complete";
    }
    coverage.chronology = ids.map(petId => {
      const row = chosen.find(entry => entry.pet_profile_id === petId);
      return { petId, boundaryIds: row ? [careEvidenceId(row.id, coverage)] : [], blocked: !row };
    });
    coverage.requiredSourceIds = chosen.map(row => careEvidenceId(row.id, coverage));
    return { ...context, askHistory: { coverage, entries: chosen, originals: candidates } };
  }
  const oldestUnit = sharedRead && ids.length === 1 ? oldestCalendarUnit(context.currentMessage) : null;
  let boundaryPages = 0;
  let oldestProbe: { id: string; occurredAt: string } | null = null;
  if (oldestUnit) {
    // Resolve data-relative calendar operators from the owned accessible
    // history, not a year guessed by the model or an earlier answer.
    try {
      let query = db.from("pet_care_entries").select("id,user_id,pet_profile_id,occurred_at")
        .eq("user_id", context.owner.userId).eq("pet_profile_id", ids[0]).is("deleted_at", null);
      if (plan.from) query = query.gte("occurred_at", plan.from);
      query = query.lt("occurred_at", plan.to || new Date(asOf + 1).toISOString());
      coverage.queryCount++; boundaryPages = 1;
      const result = await withExecutionDeadline(signal => query.order("occurred_at", { ascending: true })
        .order("id", { ascending: true }).limit(1).abortSignal(signal).returns<CareEntryRow[]>(), historyReadRemaining(candidateDeadline));
      const row = result.data?.[0];
      if (result.error || row && (row.user_id !== context.owner.userId || row.pet_profile_id !== ids[0])) throw new Error("oldest_period_unavailable");
      if (row) {
        oldestProbe = { id: row.id, occurredAt: row.occurred_at };
        const period = calendarWindowToInstants(calendarPeriodContaining(row.occurred_at, oldestUnit, context.timeZone), context.timeZone);
        plan.from = plan.from && plan.from > period.from! ? plan.from : period.from;
        plan.to = plan.to && plan.to < period.to! ? plan.to : period.to;
      }
    } catch {
      coverage.retrieval = "unavailable";
      coverage.reasons.push("oldest_period_unavailable");
      return { ...context, askHistory: { coverage, entries: [], originals: [] } };
    }
  }
  const descending = context.askInterpretation?.selection === "latest";
  const endpointComparison = context.askInterpretation?.request
    ? ["summary", "comparison"].includes(context.askInterpretation.selection || "") || ["comparison", "overview"].includes(context.askInterpretation.readOperation || "")
    : context.askInterpretation?.readOnly === true
    && /\bweights?\b/i.test(context.currentMessage)
    && /\b(?:earliest|first)\b/i.test(context.currentMessage) && /\b(?:latest|last)\b/i.test(context.currentMessage);
  const candidates: CareEntryRow[] = [];
  const endpointSeeds = new Map<string, { earliestIds: string[]; latestIds: string[]; earliestReady: boolean; latestReady: boolean }>();
  // Reserve coverage/provenance space independently of model evidence. Split
  // the candidate budget fairly so the first pet cannot consume every slot.
  // Reserve twelve of the existing roots for later correction notes on dated
  // lookups. Supplemental discovery must not expand the graph/input budgets.
  const boundedContextCohort = Boolean(context.askInterpretation?.request?.evidenceNeeds?.length)
    && (context.askInterpretation?.request?.evidenceNeeds || []).every(need => (need.order || "context") === "context"
      && need.window && Date.parse(need.window.to) - Date.parse(need.window.from) <= 370 * 86400000);
  // A bounded <=5-pet cohort may need 12 monthly rows per pet. Reserving the
  // legacy 12 correction slots makes that exhaustive read mathematically
  // impossible (52 / 5 = 10). Borrow all but four slots for the certified
  // bounded scan; supplemental corrections are still capped below so the
  // global 64-candidate authority never grows.
  const correctionReserve = plan.from || namedDays.length ? boundedContextCohort && ids.length <= 5 ? 4 : 12 : 0;
  const rowsPerPet = Math.floor((HISTORY_BUDGET.candidateRows - correctionReserve) / Math.max(1, Math.min(ids.length, HISTORY_BUDGET.pets)));
  const pagesPerPet = Math.min(vetBriefRead ? HISTORY_BUDGET.totalPages - HISTORY_BUDGET.graphCalls : HISTORY_BUDGET.pagesPerPet - boundaryPages, Math.floor(HISTORY_BUDGET.totalPages / Math.max(1, Math.min(ids.length, HISTORY_BUDGET.pets))));
  const distributePeriod = sharedRead && (Boolean(oldestUnit)
    || context.askInterpretation?.readOperation === "overview" || context.askInterpretation?.selection === "summary" && !searchTerms.length);
  for (const petId of ids.slice(0, HISTORY_BUDGET.pets)) {
    let failed = false; let pages = 0; let exhausted = true;
    const endpointSeed = { earliestIds: [] as string[], latestIds: [] as string[], earliestReady: false, latestReady: false };
    if (endpointComparison) endpointSeeds.set(petId, endpointSeed);
    let recoveredWindowedNeed = false;
    let deferredGenericLexicalFailure = false;
    const windowedNeedIds = new Set((context.askInterpretation?.request?.evidenceNeeds || [])
      .filter(need => (!need.petIds || need.petIds.includes(petId)) && Boolean(need.window))
      .map(need => need.id));
    const collected: CareEntryRow[] = [];
    const directions = endpointComparison ? [false, true] : [descending];
    // Reserve half of the same budget for period context: lexical candidates
    // alone cannot expose synonyms, intervening reports or missing search terms.
    // Reserve separate candidate slots for distinct hints so common terms
    // cannot consume every slot before a rare, decisive middle-history record.
    // Event facets and temporal presentation are independent. A generic summary
    // label must not suppress searches for a decisive middle-history event.
    const explicitEndpointComparison = endpointComparison
      && /\b(?:earliest|first)\b/i.test(context.currentMessage)
      && /\b(?:latest|last|most recent|newest)\b/i.test(context.currentMessage);
    const diversify = context.askInterpretation?.request
      && !explicitEndpointComparison
      && (eventTerms.length > 0 || !endpointComparison && !["latest", "earliest", "earliest_occurrence"].includes(context.askInterpretation.selection || "") && searchTerms.length > 1);
    const termGroups = historySearchGroups(searchTerms, sharedRead ? context.currentMessage : "");
    const proposedStrategies = vetBriefRead
      ? [...vetBriefRead.termGroups.map(terms => ({ descending: false, lexical: true, terms })), { descending: true, lexical: false, terms: searchTerms }]
      : diversify
      ? [...termGroups.map(terms => ({ descending, lexical: true, terms })), { descending: endpointComparison || descending, lexical: false, terms: searchTerms }]
      : context.askInterpretation?.request && plan.terms.length
        ? directions.flatMap(descending => [{ descending, lexical: true, terms: searchTerms }, { descending, lexical: false, terms: searchTerms }])
        : directions.map(descending => ({ descending, lexical: !!plan.terms.length, terms: searchTerms }));
    const scopedStrategies: HistoryReadStrategy[] = proposedStrategies.map(strategy => ({ ...strategy, from: vetBriefRead && !strategy.lexical && vetBriefRead.periodFrom
        ? (!plan.from || vetBriefRead.periodFrom > plan.from ? vetBriefRead.periodFrom : plan.from) : plan.from, to: vetBriefRead && !strategy.lexical && vetBriefRead.periodTo
        ? (!plan.to || vetBriefRead.periodTo < plan.to ? vetBriefRead.periodTo : plan.to) : plan.to }));
    // Reserve up to five named-date queries in addition to every topic and the
    // selected period. A broad background search cannot displace a middle-date
    // comparison, and date anchors cannot displace a requested clinical topic.
    const appointmentDates = vetBriefRead ? compileHistoryReadStrategies(retrievalQuestion, new Date(asOf).getUTCFullYear(), plan, [], 6) : null;
    // A month can contain many unrelated early records. Apply the appointment
    // topics inside that authorized month instead of spending its entire row
    // allowance on the first household logs. Exact-day context is unchanged;
    // broad topic and recent-period strategies remain independently reserved.
    if (appointmentDates && searchTerms.length) {
      appointmentDates.strategies = appointmentDates.strategies.map(strategy => strategy.target?.length === 7
        ? { ...strategy, lexical: true, terms: searchTerms } : strategy);
    }
    const scopedNeeds = context.askInterpretation?.request?.evidenceNeeds?.filter(need => !need.petIds || need.petIds.includes(petId))
      .map(need => ({ ...need, terms: historyQueryTerms(need.terms, context.eligiblePets.map(pet => pet.name || "")) })) || [];
    const compiled = appointmentDates
      ? { ...appointmentDates, strategies: [...appointmentDates.strategies, ...scopedStrategies].filter((strategy, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(strategy)) === index) }
      : compileHistoryReadStrategies(retrievalQuestion, new Date(asOf).getUTCFullYear(), plan, scopedStrategies, pagesPerPet, scopedNeeds, context.timeZone, distributePeriod);
    const boundedContextNeed = !vetBriefRead && scopedNeeds.length === 1 && scopedNeeds[0].order === "context" && scopedNeeds[0].window
      && Date.parse(scopedNeeds[0].window.to) - Date.parse(scopedNeeds[0].window.from) <= 370 * 86400000
      ? scopedNeeds[0] : null;
    const boundedFrom = boundedContextNeed ? (!plan.from || boundedContextNeed.window!.from > plan.from ? boundedContextNeed.window!.from : plan.from) : null;
    const boundedTo = boundedContextNeed ? (!plan.to || boundedContextNeed.window!.to < plan.to ? boundedContextNeed.window!.to : plan.to) : null;
    const strategies: HistoryReadStrategy[] = boundedContextNeed && boundedFrom && boundedTo && boundedFrom < boundedTo
      ? [{ from: boundedFrom, to: boundedTo, descending: false, lexical: false, terms: [], needId: boundedContextNeed.id, exhaustive: true }]
      : compiled.strategies.map(strategy => strategy.target?.length === 7 && searchTerms.length
        ? { ...strategy, lexical: true, terms: searchTerms } : strategy);
    coverage.needs ??= [];
    coverage.needs.push(...compiled.outsideNeeds.map(needId => ({ petId, needId, candidateIds: [], exhausted: false, status: "unavailable" as const, reason: "need_window_outside_scope" })));
    if (compiled.outsideNeeds.length) coverage.reasons.push("need_window_outside_scope");
    coverage.needs.push(...compiled.omittedNeeds.map(needId => ({ petId, needId, candidateIds: [], exhausted: false, status: "partial" as const, reason: "need_query_budget" })));
    if (compiled.omittedNeeds.length) coverage.reasons.push("need_query_budget");
    if (compiled.omittedTargets.length) coverage.reasons.push("explicit_date_target_budget");
    coverage.targets ??= [];
    coverage.targets.push(...compiled.omittedTargets.map(day => ({ petId, day, candidateIds: [], retainedIds: [], exhausted: false, status: "partial" as const })));
    // Split the existing candidate/page budget across both ends. Never scan a
    // decade sequentially just to compare the first and last recorded values.
    for (const [strategyIndex, { descending: readDescending, lexical, terms, from, to, target, needId, period, exhaustive }] of strategies.entries()) {
      // Lexical endpoint strategies run before their chronological
      // counterpart when a topic term exists, so they remain preferred. If a
      // morphology mismatch (for example "weight" vs "weighed") returns no
      // lexical row, allow the bounded chronological strategy for that same
      // direction to certify the endpoint instead. The seed is written only
      // once per direction, so this is a fallback, never an override.
      const orderedNeed = needId ? context.askInterpretation?.request?.evidenceNeeds?.find(need =>
        need.id === needId && (!need.petIds || need.petIds.includes(petId))) : null;
      const endpointDirection = endpointComparison && !target && !period
        ? needId
          ? orderedNeed?.order === "earliest" ? "earliest" : orderedNeed?.order === "latest" ? "latest" : null
          : readDescending ? "latest" : "earliest"
        : null;
      // Lexical endpoint reads are the preferred measurement-specific query.
      // Once one has certified this direction, do not spend another page on
      // the generic chronological fallback. A failed lexical read still falls
      // through to that fallback, and need-specific strategies are never skipped.
      if (explicitEndpointComparison && endpointDirection && !needId && !lexical
        && endpointSeed[endpointDirection === "latest" ? "latestReady" : "earliestReady"]) continue;
      const candidatesWindow = clipHistoryPlan(calendarCandidateWindow({ from, to }, context.timeZone), context.historyAccess);
      let cursor: Cursor | null = null; let traversalExhausted = false; let strategyFailed = false;
      const rows: CareEntryRow[] = [];
      const matchedIds = new Set<string>();
      const priorIds = new Set(collected.map(row => row.id));
      // Empty and overlapping strategies return unused capacity to the remaining
      // searches. Total distinct candidates and page limits stay unchanged.
      const directionRows = Math.floor((rowsPerPet - priorIds.size) / (strategies.length - strategyIndex));
      const directionPages = Math.floor((pagesPerPet - pages) / (strategies.length - strategyIndex));
      if (directionPages < 1 || directionRows < 1) {
        exhausted = false;
        coverage.reasons.push("history_query_budget");
      }
      try {
        for (let attempt = 0; attempt < directionPages && !traversalExhausted && rows.length < directionRows; attempt++) {
          pages++;
          coverage.queryCount++;
          // Duplicate hits from another strategy do not consume new-evidence quota.
          // A bounded exhaustive need may overfetch one sentinel row. That row
          // proves whether more data exists but never enters the candidate set.
          const remainingRows = Math.max(0, directionRows - rows.length);
          const pageLimit = Math.min(HISTORY_BUDGET.pageSize, remainingRows + priorIds.size + (exhaustive ? 1 : 0));
          const timeoutMs = historyReadRemaining(candidateDeadline);
          let result: { data: unknown; error: { code?: string } | null };
          if (lexical) {
            // The RPC derives auth.uid(). Never pass an owner or fall back to a
            // different lexical authority when its migration/service is missing.
            result = await withExecutionDeadline(signal => db.rpc(readDescending ? "read_ask_history_candidates_latest" : "read_ask_history_candidates", {
              p_pet_id: petId, p_terms: terms.length ? terms : plan.terms,
              p_from: candidatesWindow.from || (futureSourceRequested ? null : "1900-01-01T00:00:00.000Z"),
              p_to: futureSourceRequested ? candidatesWindow.to : new Date(Math.min(candidatesWindow.to ? Date.parse(candidatesWindow.to) : Infinity, asOf + 1)).toISOString(),
              p_after_time: cursor?.occurredAt ?? null, p_after_id: cursor?.id ?? null, p_limit: pageLimit,
            }).abortSignal(signal), timeoutMs);
            // For an already-authorized evidence need with an explicit date
            // window, lexical matching is only a candidate hint. A transient or
            // validator RPC failure must not erase the bounded period itself.
            // Re-read the same owner/pet/window through ordinary RLS. Auth/scope
            // failures remain fail-closed and never take this recovery path.
            if (result.error && candidatesWindow.from && candidatesWindow.to
              && (needId ? windowedNeedIds.has(needId) : windowedNeedIds.size > 0)
              && !["42501", "28000"].includes(result.error.code || "")) {
              let fallback = db.from("pet_care_entries").select("id,user_id,pet_profile_id,category,title,note,severity,occurred_at,created_at,updated_at,deleted_at")
                .eq("user_id", context.owner.userId).eq("pet_profile_id", petId).is("deleted_at", null)
                .gte("occurred_at", candidatesWindow.from).lt("occurred_at", candidatesWindow.to);
              if (!futureSourceRequested) fallback = fallback.lt("occurred_at", new Date(asOf + 1).toISOString());
              if (cursor) fallback = fallback.or(`occurred_at.${readDescending ? "lt" : "gt"}.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.${readDescending ? "lt" : "gt"}.${cursor.id})`);
              const recovered = await withExecutionDeadline(signal => fallback.order("occurred_at", { ascending: !readDescending })
                .order("id", { ascending: !readDescending }).limit(pageLimit).abortSignal(signal).returns<CareEntryRow[]>(), timeoutMs);
              if (!recovered.error) {
                result = recovered;
                recoveredWindowedNeed = true;
                coverage.reasons.push("windowed_need_lexical_fallback");
              }
            }
            if (result.error) coverage.reasons.push(result.error.code === "57014" ? "candidate_rpc_timeout"
              : result.error.code === "55000" ? "candidate_rpc_timeout_configuration" : "candidate_rpc_unavailable");
          } else {
            let query = db.from("pet_care_entries").select("id,user_id,pet_profile_id,category,title,note,severity,occurred_at,created_at,updated_at,deleted_at").eq("user_id", context.owner.userId).eq("pet_profile_id", petId).is("deleted_at", null);
            if (!futureSourceRequested) query = query.lt("occurred_at", new Date(asOf + 1).toISOString());
            if (candidatesWindow.from) query = query.gte("occurred_at", candidatesWindow.from);
            if (candidatesWindow.to) query = query.lt("occurred_at", candidatesWindow.to);
            if (cursor) query = query.or(`occurred_at.${readDescending ? "lt" : "gt"}.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.${readDescending ? "lt" : "gt"}.${cursor.id})`);
            result = await withExecutionDeadline(signal => query.order("occurred_at", { ascending: !readDescending }).order("id", { ascending: !readDescending }).limit(pageLimit).abortSignal(signal).returns<CareEntryRow[]>(), timeoutMs);
          }
          if (result.error) throw new Error("history_page_unavailable");
          if (result.data !== null && !Array.isArray(result.data)) throw new Error("history_page_invalid_shape");
          const page = (result.data || []) as CareEntryRow[];
          if (page.length > pageLimit) throw new Error("history_page_bound_exceeded");
          // Never tolerate a mock/misconfigured boundary returning foreign rows.
          if (page.some(row => row.user_id !== context.owner.userId || row.pet_profile_id !== petId || row.deleted_at)) throw new Error("history_scope_mismatch");
          if (!page.length) { traversalExhausted = true; break; }
          const retainedPage = exhaustive && page.length > remainingRows ? page.slice(0, remainingRows) : page;
          if (exhaustive && !lexical && page.length < pageLimit) traversalExhausted = true;
          if (endpointDirection && !endpointSeed[endpointDirection === "latest" ? "latestReady" : "earliestReady"]) {
            const boundaryTime = retainedPage[0]?.occurred_at || page[0].occurred_at;
            const idsAtBoundary = retainedPage.filter(row => compareHistoryTime(row.occurred_at, boundaryTime) === 0).map(row => row.id);
            if (endpointDirection === "latest") {
              endpointSeed.latestIds = idsAtBoundary;
              endpointSeed.latestReady = true;
            } else {
              endpointSeed.earliestIds = idsAtBoundary;
              endpointSeed.earliestReady = true;
            }
          }
          for (const row of retainedPage) {
            if (!/^[a-zA-Z0-9_-]+$/.test(row.id) || !row.occurred_at || !Number.isFinite(Date.parse(row.occurred_at))) throw new Error("invalid_history_cursor");
            const next: Cursor = { petId, occurredAt: row.occurred_at, id: row.id };
            const advance = cursor ? compareHistoryTime(next.occurredAt, cursor.occurredAt) || next.id.localeCompare(cursor.id) : 0;
            if (cursor && (readDescending ? advance >= 0 : advance <= 0)) throw new Error("non_advancing_history_cursor");
            cursor = next;
            if (needId) matchedIds.add(`care:${row.id}`);
            if (!priorIds.has(row.id)) rows.push(row);
            else {
              // A duplicate must still match the earlier source version.
              const prior = collected.find(item => item.id === row.id);
              if (!sameCandidateVersion(row, prior)) { failed = true; coverage.excludedIds.push(`care:${row.id}`); coverage.reasons.push("source_deleted_or_changed"); }
            }
            if (rows.length >= directionRows) break;
          }
          // Do not infer exhaustion from a short page: a server row cap may be
          // smaller than requested. An empty next page is the only traversal end.
        }
      } catch (error) {
        strategyFailed = true;
        // A generic lexical strategy is advisory when the same pet has an
        // explicit bounded evidence need. Defer that failure until all scoped
        // strategies have had a chance to recover through the same RLS window.
        // Targets and unbounded primary reads remain fail-closed immediately.
        if (target) failed = true;
        else if (!needId) {
          if (lexical && windowedNeedIds.size) deferredGenericLexicalFailure = true;
          else failed = true;
        }
        coverage.reasons.push("history_page_unavailable_or_changed");
        if (error instanceof Error && (error.message === "history_time_budget" || ["AbortError", "TimeoutError"].includes(error.name))) {
          coverage.reasons.push(plan.terms.length ? "candidate_rpc_timeout" : "history_time_budget");
        }
      }
      if (!traversalExhausted && cursor) coverage.continuation.push(cursor);
      exhausted = exhausted && traversalExhausted;
      if (needId) coverage.needs.push({ petId, needId,
        candidateIds: [...matchedIds],
        exhausted: traversalExhausted, status: strategyFailed ? "unavailable" : traversalExhausted ? "unknown" : "partial" });
      if (target) coverage.targets.push({ petId, day: target, candidateIds: rows.map(row => `care:${row.id}`), retainedIds: [],
        exhausted: traversalExhausted, status: strategyFailed ? "unavailable" : traversalExhausted ? "unknown" : "partial" });
      if (period && from && to) (coverage.periods ??= []).push({ petId, from, to,
        candidateIds: rows.filter(row => Date.parse(row.occurred_at) >= Date.parse(from) && Date.parse(row.occurred_at) < Date.parse(to)).map(row => `care:${row.id}`), exhausted: traversalExhausted });
      collected.push(...rows);
    }
    if (deferredGenericLexicalFailure && !recoveredWindowedNeed) failed = true;
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
    const rows = [...unique.values()].filter(row => !changed.has(row.id) && !coverage.excludedIds.includes(`care:${row.id}`));
    coverage.perPet.push({ petId, rows: rows.length, pages, exhausted, status: failed ? "unavailable" : exhausted ? "unknown" : "partial" });
    candidates.push(...rows);
  }
  if (ids.length > HISTORY_BUDGET.pets) coverage.reasons.push("pet_query_budget");
  if (context.askInterpretation?.request && plan.terms.length) coverage.reasons.push("bounded_period_context_not_semantic_completeness");
  if (endpointComparison) coverage.reasons.push("bidirectional_endpoint_subset");
  coverage.retrieval = coverage.perPet.some(p => p.status === "unavailable") ? "unavailable" : coverage.continuation.length || ids.length > HISTORY_BUDGET.pets ? "partial" : "unknown";
  const supplementalCorrectionIds = new Set<string>();
  if (correctionReserve && coverage.retrieval !== "unavailable") {
    const supplemental = await discoverDatedCorrectionNotes(candidates, ids.slice(0, HISTORY_BUDGET.pets), context.owner.userId, db, coverage, correctionDiscoveryDeadline);
    const remaining = Math.max(0, HISTORY_BUDGET.candidateRows - candidates.length);
    const retainedSupplemental = supplemental.slice(0, remaining);
    for (const row of retainedSupplemental) supplementalCorrectionIds.add(row.id);
    candidates.push(...retainedSupplemental);
    if (supplemental.length > retainedSupplemental.length) {
      coverage.corrections = "partial";
      coverage.reasons.push("correction_candidate_budget");
    }
  }
  coverage.candidateIds = candidates.map(row => `care:${row.id}`);
  const entries = await effectiveCandidates(candidates, owned, ids, context.owner.userId, db, coverage, deadline);
  if (endpointComparison) {
    const effectiveIds = new Set(entries.map(entry => careEvidenceId(entry.id, coverage)));
    coverage.endpointPairs = ids.map(petId => {
      const seed = endpointSeeds.get(petId);
      const expectedEarliest = (seed?.earliestIds || []).map(id => careEvidenceId(id, coverage));
      const expectedLatest = (seed?.latestIds || []).map(id => careEvidenceId(id, coverage));
      const earliestIds = expectedEarliest.filter(id => effectiveIds.has(id));
      const latestIds = expectedLatest.filter(id => effectiveIds.has(id));
      const blocked = !seed?.earliestReady || !seed.latestReady
        || earliestIds.length !== expectedEarliest.length || latestIds.length !== expectedLatest.length
        || coverage.perPet.find(pet => pet.petId === petId)?.status === "unavailable"
        || coverage.corrections === "unavailable"
        || coverage.reasons.includes("unsupported_claim_payload") || coverage.reasons.includes("unknown_effective_event_date")
        || candidates.some(row => row.pet_profile_id === petId
          && coverage.provenance.some(source => source.sourceId === `care:${row.id}` && source.status === "deleted_or_changed"));
      return { petId, earliestIds, latestIds, blocked };
    });
  }
  // The physical boundary is provisional until the ordinary correction and
  // source-version checks have confirmed it. Never present a superseded or
  // concurrently changed boundary as the oldest effective calendar period.
  if (oldestProbe && !entries.some(entry => entry.id === oldestProbe.id
    && entry.occurred_at === oldestProbe.occurredAt
    && (!plan.from || Date.parse(careOccurrence(entry, context.timeZone)) >= Date.parse(plan.from))
    && (!plan.to || Date.parse(careOccurrence(entry, context.timeZone)) < Date.parse(plan.to)))) {
    coverage.retrieval = "unavailable";
    coverage.reasons.push("oldest_period_boundary_unverified");
    return { ...context, askHistory: { coverage, entries: [], originals: [] } };
  }
  if (!candidates.length && !entries.length && coverage.retrieval !== "unavailable" && coverage.corrections !== "unavailable") coverage.reasons.push("no_matching_candidates_not_absence");
  const selection = vetBriefRead ? "summary" : context.askInterpretation?.request && endpointComparison ? "comparison" : context.askInterpretation?.selection;
  const occurrence = (entry: CareEntryRow) => classifyOccurrenceReport([entry.title, entry.note].filter(Boolean).join(": "),
    context.eligiblePets.find(pet => pet.id === entry.pet_profile_id)?.name || "", plan.terms);
  const periodEntries = entries.filter(entry => historyDateAccessible(entry.occurred_at, context.historyAccess) && (futureSourceRequested || Date.parse(entry.occurred_at) <= asOf)
    && (!plan.from || Date.parse(careOccurrence(entry, context.timeZone)) >= Date.parse(plan.from))
    && (!plan.to || Date.parse(careOccurrence(entry, context.timeZone)) < Date.parse(plan.to))
    && (!!vetBriefRead || !!context.askInterpretation?.request || !plan.terms.length || plan.terms.some(term =>
    `${entry.title || ""} ${entry.note}`.toLocaleLowerCase().includes(term.toLocaleLowerCase()))));
  // A later correction qualifies the requested period without becoming an
  // observation within it. Only independently discovered and freshly validated
  // sources may cross the query window; subscription access still applies.
  const matchingEntries = [...periodEntries, ...entries.filter(entry => supplementalCorrectionIds.has(entry.id)
    && !periodEntries.some(row => row.id === entry.id) && historyDateAccessible(entry.occurred_at, context.historyAccess)
    && Date.parse(entry.occurred_at) <= asOf)];
  const relevant = selection === "earliest_occurrence" ? ids.flatMap(petId => occurrenceCandidates(periodEntries.filter(entry => entry.pet_profile_id === petId), occurrence, entry => entry.occurred_at)) : periodEntries;
  const relevantIds = new Set(relevant.map(entry => entry.id));
  const eventRelevance = historyEventRelevance(matchingEntries.map(entry => `${entry.title || ""} ${entry.note}`),
    eventTerms);
  if (eventTerms.length && ["latest", "earliest", "earliest_occurrence"].includes(selection || "")) coverage.eventCandidateIds = matchingEntries.filter(entry => eventRelevance(`${entry.title || ""} ${entry.note}`) > 0)
    .map(entry => careEvidenceId(entry.id, coverage));
  const ordered = orderHistoryEvidence(matchingEntries, selection, entry => entry.occurred_at, entry => entry.id, entry => entry.pet_profile_id,
    selection === "earliest_occurrence" ? entry => relevantIds.has(entry.id) ? 0 : 1
      : context.askInterpretation?.request && (searchTerms.length || eventTerms.length) ? entry => {
        const text = `${entry.title || ""} ${entry.note}`;
        const score = historyQueryRelevance(text, searchTerms);
        const eventScore = eventRelevance(text);
        // Keep event facets ahead of routine topic matches through both budgets.
        // Within the same event tier, retain the requested chronological order.
        return -1000 * eventScore + (["latest", "earliest"].includes(selection || "") ? score > 0 ? 0 : 1 : -score);
      } : undefined);
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
  // Reserve representation for each requested day before general ranking can
  // fill the evidence budget. Round-robin keeps multiple dates/pets represented.
  const effectiveBySourceId = new Map(entries.map(entry => [careEvidenceId(entry.id, coverage), entry]));
  const targetGroups = (coverage.targets || []).map(target => target.candidateIds
    .map(id => effectiveBySourceId.get(id))
    .filter((entry): entry is CareEntryRow => Boolean(entry))
    .sort((a, b) => compareHistoryTime(a.occurred_at, b.occurred_at) || a.id.localeCompare(b.id)));
  const needGroups = (context.askInterpretation?.request?.evidenceNeeds || []).flatMap(need => ids.filter(petId => !need.petIds || need.petIds.includes(petId)).map(petId => {
    const queries = (coverage.needs || []).filter(query => query.petId === petId && query.needId === need.id);
    const queriedIds = [...new Set(queries.flatMap(query => query.candidateIds))];
    // A successful need-specific search owns candidate identity. General
    // relevance ranking may add context, but it cannot replace the newest/
    // oldest effective candidate selected for this evidence obligation.
    const candidates = queriedIds.length
      ? queriedIds.map(id => effectiveBySourceId.get(id)).filter((entry): entry is CareEntryRow => Boolean(entry))
      : ordered.filter(entry => entry.pet_profile_id === petId
        && withinEvidenceNeedWindow(careOccurrence(entry, context.timeZone), need.window)
        && need.terms.some(term => `${entry.title || ""} ${entry.note}`.toLowerCase().includes(term.toLowerCase())));
    return candidates.filter(entry => entry.pet_profile_id === petId && withinEvidenceNeedWindow(careOccurrence(entry, context.timeZone), need.window)).sort((a, b) =>
      need.order === "earliest" ? compareHistoryTime(a.occurred_at, b.occurred_at) || a.id.localeCompare(b.id)
        : need.order === "latest" ? compareHistoryTime(b.occurred_at, a.occurred_at) || b.id.localeCompare(a.id) : 0);
  }));
  // Larger cohorts receive one evidence slot per pet before any pet gets more.
  const petGroups = ids.length > 3 ? ids.map(petId => ordered.filter(entry => entry.pet_profile_id === petId)) : [];
  const vetGroups = vetBriefRead?.termGroups.map(terms => ordered.filter(entry => terms.some(term => `${entry.title || ""} ${entry.note}`.toLowerCase().includes(term.toLowerCase())))) || [];
  const currentRead = ["current", "historical_and_current"].includes(context.askInterpretation?.request?.temporalScope || "");
  const currentGroups = currentRead ? ids.map(petId => ordered.filter(entry => entry.pet_profile_id === petId)
    .sort((a, b) => compareHistoryTime(b.occurred_at, a.occurred_at)).slice(0, 2)) : [];
  const periodGroups = (coverage.periods || []).map(period => ordered.filter(entry => entry.pet_profile_id === period.petId
    && Date.parse(entry.occurred_at) >= Date.parse(period.from) && Date.parse(entry.occurred_at) < Date.parse(period.to)));
  const boundaryIds = new Set((coverage.chronology || []).flatMap(boundary => boundary.boundaryIds));
  const endpointPairIds = new Set((coverage.endpointPairs || []).flatMap(pair => [...pair.earliestIds, ...pair.latestIds]));
  const requestNeeds = context.askInterpretation?.request?.evidenceNeeds || [];
  const exhaustiveBoundedContext = requestNeeds.length > 0
    && requestNeeds.every(need => (need.order || "context") === "context" && need.window
      && Date.parse(need.window.to) - Date.parse(need.window.from) <= 370 * 86400000)
    && requestNeeds.every(need => ids.filter(petId => !need.petIds || need.petIds.includes(petId)).every(petId => {
      const queries = (coverage.needs || []).filter(query => query.needId === need.id && query.petId === petId);
      return queries.length === 1 && queries[0].exhausted && !queries[0].reason
        && !["unavailable", "partial"].includes(queries[0].status);
    }));
  coverage.exhaustiveBoundedContext = exhaustiveBoundedContext;
  const required = [...ordered.filter(entry => boundaryIds.has(careEvidenceId(entry.id, coverage))
      || endpointPairIds.has(careEvidenceId(entry.id, coverage))),
    // Large owned cohorts reserve one effective row per pet before any shared
    // period/context group can consume the evidence budget. This preserves
    // subject coverage at the maximum 10-pet read scope without increasing
    // record or character limits.
    ...petGroups.flatMap(group => group.slice(0, 1)),
    ...targetGroups.flatMap(group => group.slice(0, 1)),
    ...needGroups.flatMap(group => exhaustiveBoundedContext ? group : group.slice(0, 1)),
    ...currentGroups.flat(), ...periodGroups.flatMap(group => group.slice(0, 2))];
  coverage.requiredSourceIds = [...new Set(required.map(entry => careEvidenceId(entry.id, coverage)))];
  const priorityGroups = [...petGroups, ...targetGroups, ...needGroups, ...currentGroups, ...periodGroups, ...vetGroups];
  const anchoredIds = new Set(priorityGroups.flat().map(entry => entry.id));
  const exactNeedComparison = context.askInterpretation?.operation === "comparison"
    && (context.askInterpretation.request?.evidenceNeeds?.length || 0) > 1
    && context.askInterpretation.request!.evidenceNeeds!.every(need => Boolean(need.window));
  const groups = exactNeedComparison ? priorityGroups : [...priorityGroups, ordered.filter(entry => !anchoredIds.has(entry.id))];
  const prioritized: CareEntryRow[] = [...new Map(required.map(entry => [entry.id, entry])).values()];
  for (let index = 0; groups.some(group => index < group.length); index++)
    for (const group of groups) if (group[index] && !prioritized.some(entry => entry.id === group[index].id)) prioritized.push(group[index]);
  const kept: CareEntryRow[] = []; let chars = 0; let budgetExcluded = false;
  const representationRecordLimit = exhaustiveBoundedContext ? HISTORY_BUDGET.candidateRows : HISTORY_BUDGET.records;
  const representationCharLimit = exhaustiveBoundedContext ? 36_000 : HISTORY_BUDGET.chars;
  for (const entry of prioritized) {
    const size = JSON.stringify(entry).length;
    if (kept.length >= representationRecordLimit || chars + size > representationCharLimit) { coverage.excludedIds.push(careEvidenceId(entry.id, coverage)); budgetExcluded = true; continue; }
    kept.push(entry); chars += size;
  }
  for (const target of coverage.targets || []) {
    target.retainedIds = kept.filter(entry => entry.pet_profile_id === target.petId && calendarDateInZone(careOccurrence(entry, context.timeZone), context.timeZone).startsWith(target.day))
      .map(entry => careEvidenceId(entry.id, coverage));
    if (target.candidateIds.length && !target.retainedIds.length) {
      target.status = "partial"; coverage.reasons.push("explicit_date_target_not_represented");
    }
  }
  if (budgetExcluded) coverage.reasons.push("effective_evidence_budget");
  return { ...context, askHistory: { coverage, entries: kept, originals: candidates } };
}

function historyReadRemaining(deadline: number) {
  const remaining = deadline - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error("history_time_budget");
  return remaining;
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
    const seedBatches = Array.from({ length: Math.ceil(requestedPets.length / 3) }, (_, i) => requestedPets.slice(i * 3, (i + 1) * 3));
    if (!batches.length) batches.push([]);
    // Ten-pet reads need four seed calls before correction traversal begins.
    // Keep a bounded traversal reserve proportional to the authorized cohort
    // instead of spending the fixed six-call budget mostly on ownership seeds.
    const graphCallBudget = Math.min(12, HISTORY_BUDGET.graphCalls + Math.max(0, seedBatches.length - 1));
    for (let call = 0; batches.length || frontier.length || seedBatches.length; call++) {
      if (call >= graphCallBudget) throw new Error("correction_budget");
      const rootIds = batches.shift() || [];
      const claimIds = frontier.splice(0, 64); claimIds.forEach(id => visited.add(id));
      coverage.queryCount++;
      const result = await withExecutionDeadline(signal => db.rpc("read_ask_history_correction_page", {
        p_care_ids: rootIds, p_claim_ids: claimIds,
        // A reassigned event may have no legacy row under its corrected pet.
        // Seed only stored correction authors, never arbitrary shadow claims.
        p_seed_pet_ids: seedBatches.shift() || [],
        p_event_from: coverage.plan.from, p_event_to: coverage.plan.to, p_terms: coverage.plan.terms,
      }).abortSignal(signal), historyReadRemaining(deadline));
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
        output.push({ ...original, care_event_metadata: sources.get(original.id)?.care_event_metadata }); continue;
      }
      const effective = related.some(link => graph.effectiveClaimIds.has(link.claim_id));
      const inactive = related.some(link => claims.get(link.claim_id)?.knowledge_status !== "effective");
      coverage.provenance.push({ sourceId: `care:${original.id}`, claimIds: related.map(link => link.claim_id), status: effective ? "effective_linked" : inactive ? "tombstoned_or_inactive" : "superseded" });
      if (effective) output.push({ ...original, care_event_metadata: sources.get(original.id)?.care_event_metadata });
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
  } catch (error) {
    episodeClaims?.verified.clear();
    const knownFailureClasses = new Set([
      "correction_budget", "correction_read_incomplete", "correction_changed_during_read",
      "claim_changed_during_read", "missing_relation_endpoint", "missing_lineage_source",
      "stale_lineage", "ambiguous_correction_graph", "history_time_budget",
    ]);
    const rawFailure = error instanceof Error ? error.message : "";
    const failureClass = knownFailureClasses.has(rawFailure) ? rawFailure
      : error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "history_time_budget" : "unknown";
    console.info("[Ask history correction] closure unavailable", {
      candidateCount: candidates.length,
      failureClass,
      petCount: requestedPets.length,
      queryCount: coverage.queryCount,
    });
    coverage.corrections = "unavailable"; coverage.reasons.push("correction_closure_unavailable_or_ambiguous");
    coverage.provenance = candidates.map(row => ({ sourceId: `care:${row.id}`, claimIds: [], status: "withheld_correction_authority" }));
    return [];
  }
}
