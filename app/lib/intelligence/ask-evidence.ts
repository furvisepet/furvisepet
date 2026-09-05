import type { AskContextRecord } from "../ai/ask-reasoning.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import type { FurviseLiveContext } from "./types.ts";
import { buildSourceNoteRecall, sourceNoteAnswer, type SourceNoteRecall } from "./source-note-recall.ts";

export type Completeness = "complete" | "partial" | "unknown" | "unavailable" | "ambiguous";
export type EvidenceCompleteness = { retrieval: Completeness; corrections: Completeness; extraction: Completeness; grouping: Completeness };
export type EvidenceSource = {
  petId: string; source: string; status: "loaded" | "capped" | "not_loaded" | "unavailable";
  loadedIds: string[]; loadedCount: number; cap: number | null; reasons: string[]; completeness: EvidenceCompleteness;
  loadedPeriod?: { from: string; to: string };
};
export type EvidenceLoss = { sourceId: string; reason: string };
export type EvidenceLoading = { sources: EvidenceSource[]; losses: EvidenceLoss[]; dateRange?: { from: string; to: string } };
export type AskEvidenceScope = {
  authorizedPetIds: string[]; requestedTopic: string; requestText: string;
  requestedPeriod: { kind: "lifetime" | "requested" | "unspecified"; surface: string | null };
  requestKind: "ordinary" | "count" | "absence" | "comparison" | "overview" | "record_lookup";
  status: "resolved" | "ambiguous"; readOnlyRecall: boolean;
};
export type AskEvidenceContract = {
  historyFallback?: string;
  history?: import("./history-retrieval.ts").HistoryCoverage;
  sourceNoteRecall?: SourceNoteRecall;
  version: "ask-evidence.v1"; scope: AskEvidenceScope; sources: EvidenceSource[];
  completeness: EvidenceCompleteness; losses: EvidenceLoss[];
  represented: Array<{ sourceId: string; petId: string; sourceType: string; field: "value"; start: number; end: number; text: string }>;
  representation: "complete" | "partial";
  /** Only a server computation can supply these, never model JSON. Stage 1's
   * loader cannot certify exhaustive facts and deliberately supplies none. */
  verifiedFacts: Array<{ scopeKey: string; kind: AskEvidenceScope["requestKind"]; sourceIds: string[]; text: string }>;
};

const unknown = (): EvidenceCompleteness => ({ retrieval: "unknown", corrections: "unknown", extraction: "unknown", grouping: "unknown" });
export function careEvidenceId(id: string, history?: AskEvidenceContract["history"]): string {
  const claimId = id.startsWith("claim-") ? id.slice(6) : null;
  return claimId && history?.provenance.some(source => source.sourceId === `claim:${claimId}` && source.status === "effective_replacement") ? `claim:${claimId}` : `care:${id}`;
}
export function evidenceSource(petId: string, source: string, loadedIds: string[], cap: number | null = null, unavailable = false, loadedCount = loadedIds.length): EvidenceSource {
  const capped = cap !== null && loadedCount >= cap;
  return { petId, source, loadedIds: unavailable ? [] : loadedIds, loadedCount: unavailable ? 0 : loadedCount, cap, status: unavailable ? "unavailable" : capped ? "capped" : "loaded",
    reasons: unavailable ? ["source_unavailable"] : capped ? ["load_cap_reached"] : ["effective_history_not_certified"],
    completeness: { ...unknown(), retrieval: unavailable ? "unavailable" : capped ? "partial" : "unknown" } };
}

export function askEvidenceScope(message: string, authorizedPetIds: string[]): AskEvidenceScope {
  const history = /\b(?:history|record\w*|report\w*|episodes?|vomit\w*|stool|weights?|diagnos\w*|tests?|medication|litter|stiffness)\b/i.test(message);
  const lifetime = /\b(?:lifetime|ever|all (?:of )?(?:the )?(?:recorded )?history|entire (?:recorded )?history|complete history|full history)\b/i.test(message);
  const period = /\b(?:(?:19|20)\d{2}|(?:this|last|previous) (?:week|month|year)|since\s+[^?!.]+|between\s+[^?!.]+)\b/i.exec(message)?.[0] || null;
  const kind: AskEvidenceScope["requestKind"] = history && /\b(?:how many|number of|total|count)\b/i.test(message) ? "count"
    : history && /\b(?:compare|comparison|difference|change in weight|weight change)\b/i.test(message) && /\b(?:all|every|earliest|first|latest|recorded)\b/i.test(message) ? "comparison"
    : history && (/\b(?:ever|never|any record|no record)\b/i.test(message)
      || /^(?:have|has|did|do|does|is|are)\b[\s\S]*\b(?:any|reported|recorded)\b/i.test(message)) ? "absence"
    : /\b(?:summari[sz]e|summary|overview|review|list)\b/i.test(message) && (lifetime || Boolean(period) || /\b(?:all|entire|complete|full|history|recorded)\b/i.test(message) && history) ? "overview"
    : /\b(?:tests?|urine|diagnos\w*)\b/i.test(message) && /\b(?:results?|diagnos\w*)\b/i.test(message) ? "record_lookup" : "ordinary";
  const topics = message.toLowerCase().match(/\b(?:soft[- ]stool|stool|vomit\w*|weights?|food|diet|litter|urine|hiding|medication|stiffness|diagnos\w*)\b/g) || [];
  return { authorizedPetIds: [...new Set(authorizedPetIds)], requestedTopic: [...new Set(topics)].join(", ") || "unspecified", requestText: message,
    requestedPeriod: { kind: lifetime ? "lifetime" : period ? "requested" : "unspecified", surface: lifetime ? "lifetime" : period ? message : null },
    requestKind: kind, status: /\b(?:second|third|that|which) episode\b/i.test(message) ? "ambiguous" : "resolved",
    readOnlyRecall: (history || kind !== "ordinary") && !analyzeOwnerAssertions(message).hasOwnerAssertion
      && !/\b(?:save|log|record|remember|note)\s+(?:this|that|it)\b/i.test(message) };
}

/** Records what the existing loader/selector did; does not select more history. */
export function createAskEvidenceContract(context: FurviseLiveContext, authorizedPetIds: string[] = [context.pet.id]): AskEvidenceContract {
  const ids = authorizedPetIds.filter(id => context.eligiblePets.some(pet => pet.id === id && pet.user_id === context.owner.userId));
  const sources = structuredClone(context.evidenceLoading?.sources || [
    evidenceSource(context.pet.id, "profile", [context.pet.id]),
    evidenceSource(context.pet.id, "care_entries", context.careEntries.map(row => `care:${row.id}`), null, context.contextRecovery?.unavailableSources.includes("care_entries")),
  ]).filter(source => ids.includes(source.petId));
  for (const id of ids) {
    for (const name of ["profile", "care_entries", "care_episodes", "current_state", "legacy_memories", "furvise_memories", "inactive_memories", "active_concerns", "resolved_concerns", "conversation_messages", "product_feedback", "owner_profile"]) {
      if (sources.some(source => source.petId === id && source.source === name)) continue;
      const profileOnly = name === "profile";
      sources.push({ ...evidenceSource(id, name, profileOnly ? [id] : []), status: profileOnly ? "loaded" : "not_loaded",
        reasons: profileOnly ? [] : ["source_not_loaded_for_pet"] });
    }
  }
  const selected = new Set(context.selectedCareEntries.map(row => row.id));
  const contract: AskEvidenceContract = { version: "ask-evidence.v1", scope: askEvidenceScope(context.currentMessage, ids), sources,
    completeness: unknown(), losses: [...(context.evidenceLoading?.losses || []), ...context.careEntries
      .filter(row => ids.includes(row.pet_profile_id) && !selected.has(row.id)).map(row => ({ sourceId: `care:${row.id}`, reason: "intermediate_selection" }))],
    represented: [], representation: "complete", verifiedFacts: [] };
  if (context.historyFallback) { contract.historyFallback = context.historyFallback; contract.scope.readOnlyRecall = true; }
  if (context.askHistory) {
    contract.scope.readOnlyRecall = true;
    const history = context.askHistory;
    contract.history = structuredClone(history.coverage);
    contract.sources = contract.sources.filter(source => source.source !== "care_entries");
    for (const petId of ids) {
      const status = history.coverage.perPet.find(pet => pet.petId === petId);
      const source = evidenceSource(petId, "care_entries", history.originals.filter(row => row.pet_profile_id === petId).map(row => `care:${row.id}`));
      source.loadedCount = status?.rows || 0;
      source.reasons = history.coverage.reasons;
      source.completeness = { retrieval: status?.status || "unavailable", corrections: history.coverage.corrections, extraction: "unknown", grouping: "unknown" };
      if (!status || status.status === "unavailable") source.status = "unavailable";
      contract.sources.push(source);
      const claims = evidenceSource(petId, "correction_claims", history.coverage.claimSources.find(source => source.petId === petId)?.sourceIds || []);
      claims.completeness = { retrieval: history.coverage.corrections, corrections: history.coverage.corrections, extraction: "unknown", grouping: "unknown" };
      claims.reasons = history.coverage.reasons;
      if (history.coverage.corrections === "unavailable") claims.status = "unavailable";
      contract.sources.push(claims);
    }
    contract.losses = contract.losses.filter(loss => !loss.sourceId.startsWith("care:"));
    contract.losses.push(...history.coverage.excludedIds.map(sourceId => ({ sourceId, reason: "historical_evidence_budget" })));
  }
  const sourceNoteRecall = buildSourceNoteRecall(context.askHistory ? { ...context, careEntries: context.askHistory.entries } : context, contract);
  if (sourceNoteRecall) contract.sourceNoteRecall = sourceNoteRecall;
  return refreshEvidenceCoverage(contract);
}

/** Conservative compatibility for direct generator callers without a loader. */
export function evidenceForRecords(records: AskContextRecord[], message: string, petIds: string[]): AskEvidenceContract {
  return refreshEvidenceCoverage({ version: "ask-evidence.v1", scope: askEvidenceScope(message, petIds),
    sources: petIds.map(petId => evidenceSource(petId, "care_entries", records.filter(record => record.petId === petId && record.sourceType === "care_update").map(record => record.id))),
    completeness: unknown(), losses: [], represented: [], representation: "complete", verifiedFacts: [] });
}

export function refreshEvidenceCoverage(contract: AskEvidenceContract): AskEvidenceContract {
  const combine = (key: keyof EvidenceCompleteness): Completeness => {
    const values = contract.sources.map(source => source.completeness[key]);
    for (const state of ["unavailable", "ambiguous", "partial", "unknown"] as const) if (values.includes(state)) return state;
    return values.length ? "complete" : "unknown";
  };
  contract.completeness = { retrieval: combine("retrieval"), corrections: combine("corrections"), extraction: combine("extraction"), grouping: combine("grouping") };
  contract.representation = contract.losses.length ? "partial" : "complete";
  return contract;
}

export function representEvidence(contract: AskEvidenceContract, records: AskContextRecord[]) {
  contract.represented = records.map(record => ({ sourceId: record.id, petId: record.petId, sourceType: record.sourceType,
    field: "value", start: 0, end: record.value.length, text: record.value }));
  return refreshEvidenceCoverage(contract);
}

export function evidenceScopeKey(scope: AskEvidenceScope) { return JSON.stringify(scope); }

/** Deliberately bounded policy, not general factual entailment. It only replaces
 * recognized exhaustive/absence requests; ordinary supported answers stay intact. */
export function evidenceAnswerPolicy(contract: AskEvidenceContract): string | null {
  const kind = contract.scope.requestKind;
  if (contract.historyFallback && contract.scope.status !== "ambiguous") return "I couldn't resolve a supported historical topic or period for this lookup. Only limited recent context is available on this path. Please specify a topic and a single year or month; I can't establish a complete historical answer from recent notes.";
  if (contract.history?.reasons.includes("no_matching_candidates_not_absence")) {
    return "No matching notes were retrieved for this query. The search does not establish that the event or result is absent; try another topic or period.";
  }
  if (contract.history?.provenance.some(source => ["superseded", "tombstoned_or_inactive"].includes(source.status)) && !contract.represented.some(span => span.sourceType === "care_update")) {
    return "The retrieved original report is superseded or inactive and is not effective evidence for this pet. This does not establish an absence across the pet's history.";
  }
  if (contract.history && (contract.history.corrections === "unavailable" || contract.history.retrieval === "unavailable"
    || contract.history.retrieval === "partial" || contract.history.excludedIds.length || contract.history.reasons.includes("unlinked_correction_uncertain")
    || contract.history.reasons.includes("unsupported_claim_payload")
    || contract.losses.some(loss => /^(?:care|claim):/.test(loss.sourceId)))) {
    return "The requested history is incomplete or its correction evidence is unavailable or uncertain. I can't establish an effective historical answer from this subset. Please narrow the period or topic, or retry the lookup; this is not evidence that an event or result is absent.";
  }
  if (kind === "ordinary" && contract.scope.status !== "ambiguous") return null;
  if (contract.scope.status === "ambiguous") return "Which episode do you mean? Please identify the pet and approximate date so I can keep the records separate.";
  if (kind === "record_lookup") return sourceNoteAnswer(contract).text;
  const represented = new Set(contract.represented.map(span => span.sourceId));
  const certified = contract.scope.authorizedPetIds.length > 0 && Object.values(contract.completeness).every(value => value === "complete")
    && contract.representation === "complete" && contract.sources.every(source => source.status === "loaded");
  const fact = certified && contract.verifiedFacts.find(fact => fact.kind === kind && fact.scopeKey === evidenceScopeKey(contract.scope)
    && fact.sourceIds.every(id => represented.has(id)) && fact.text.length <= 1800);
  if (fact) return fact.text;
  const failed = contract.sources.some(source => source.status === "unavailable" || source.status === "not_loaded");
  const lead = failed ? "I couldn't verify all the requested records." : "The available records are limited, and their completeness and corrections are not verified.";
  const task = kind === "count" ? "an exact total" : kind === "absence" ? "whether something is absent from the full record"
    : kind === "comparison" ? "a complete weight or history comparison" : "a complete summary of the requested history";
  return `${lead} I can't establish ${task} from this evidence. I can discuss the supplied notes, or you can identify a specific record to review.`;
}
