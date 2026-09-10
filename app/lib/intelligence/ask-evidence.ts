import { historyEventTerms, historyEventRelevance } from "./history-query-relevance.ts";
import { directHistoryExplanation } from "./direct-history-explanation.ts";
import { compareHistoryTime, classifyOccurrenceReport, occurrenceCandidates, supportedHistoryParaphrase, orderHistoryEvidence, type HistorySynthesisProposal } from "./history-synthesis.ts";
import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
import type { AskContextRecord } from "../ai/ask-reasoning.ts";
import { requestedHistoryTimelineDays } from "./requested-history-timeline.ts";
import { withinNoteCountAnswer } from "./within-note-count.ts";
import { calendarIntervalAnswer } from "./calendar-interval.ts";
import { buildWeightComparison, weightComparisonAnswer } from "./weight-comparison.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import type { FurviseLiveContext } from "./types.ts";
import { buildSourceNoteRecall, sourceNoteAnswer, type SourceNoteRecall } from "./source-note-recall.ts";

import { correctionReportAnswer } from "./correction-report.ts";

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
  requestKind: "ordinary" | "count" | "absence" | "comparison" | "overview" | "record_lookup" | "resolution_status";
  resolutionSubject?: string;
  status: "resolved" | "ambiguous"; readOnlyRecall: boolean;
};
export type AskEvidenceContract = {
  historyAccess?: import("./history-access.ts").AskHistoryAccess;
  answerSourceIds?: string[];
  /** Server-validated report renderings; never taken from provider JSON. */
  answerContent?: string[];
  petNames?: Record<string, string>;
  interpretation?: Omit<import("./interpret-ask.ts").AskInterpretation, "frame">;
  weightComparison?: import("./weight-comparison.ts").WeightComparisonEvidence;
  episodes?: import("./episode-history.ts").EpisodeResult;
  historyFallback?: string;
  history?: import("./history-retrieval.ts").HistoryCoverage;
  sourceNoteRecall?: SourceNoteRecall;
  version: "ask-evidence.v1"; scope: AskEvidenceScope; sources: EvidenceSource[];
  completeness: EvidenceCompleteness; losses: EvidenceLoss[];
  represented: Array<{ sourceId: string; petId: string; sourceType: string; field: "value"; start: number; end: number; text: string; occurredAt?: string | null }>;
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
  // A deliberately small question-only grammar. Topic/subject alternatives
  // abstain; owner updates, saves, ordinals and safety observations stay outside.
  const resolution = /^(?:is|has)\s+([\p{L}]+(?:\s+(?:and|or)\s+[\p{L}]+)?)(?:['’]s)?(?:\s+((?:hiding|vomiting|stool|litter|stiffness|breathing|condition|issue)(?:\s+(?:and|or)\s+(?:hiding|vomiting|stool|litter|stiffness|breathing|condition|issue))?))?\s+(?:(?:fully|completely)\s+)?(?:resolved|ended|stopped)(?:\s+in\s+((?:19|20)\d{2}))?\s*\?$/iu.exec(message.trim());
  if (resolution) return { authorizedPetIds: [...new Set(authorizedPetIds)], requestedTopic: resolution[2]?.toLowerCase() || "unspecified",
    requestText: message, requestedPeriod: { kind: resolution[3] ? "requested" : "unspecified", surface: resolution[3] || null }, requestKind: "resolution_status",
    resolutionSubject: resolution[1], status: authorizedPetIds.length === 1 && Boolean(resolution[2]) && !/\b(?:and|or)\b/i.test(message) ? "resolved" : "ambiguous", readOnlyRecall: true };
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
  const contract: AskEvidenceContract = { ...(context.historyAccess ? { historyAccess: context.historyAccess } : {}), version: "ask-evidence.v1", scope: askEvidenceScope(context.currentMessage, ids), sources,
    completeness: unknown(), losses: [...(context.evidenceLoading?.losses || []), ...context.careEntries
      .filter(row => ids.includes(row.pet_profile_id) && !selected.has(row.id)).map(row => ({ sourceId: `care:${row.id}`, reason: "intermediate_selection" }))],
    represented: [], representation: "complete", verifiedFacts: [] };
  if (context.askInterpretation) {
    const plan = context.askInterpretation;
    const { frame, ...readPlan } = plan;
    void frame; // Extraction is exclusively for independent subject/write governance.
    contract.interpretation = readPlan;
    contract.petNames = Object.fromEntries(context.eligiblePets.filter(pet => ids.includes(pet.id) && pet.user_id === context.owner.userId).map(pet => [pet.id, pet.name]));
    const operation = plan.readOperation ?? plan.operation;
    const kind: AskEvidenceScope["requestKind"] = operation === "status" ? "resolution_status"
      : operation === "count" ? "count" : operation === "overview" ? "overview"
      : operation === "comparison" ? "comparison" : "ordinary";
    contract.scope = { authorizedPetIds: ids, requestedTopic: plan.topic, requestText: context.currentMessage,
      requestedPeriod: { kind: plan.history?.from || plan.history?.to ? "requested" : "unspecified", surface: plan.history?.from || plan.history?.to || null },
      requestKind: kind, readOnlyRecall: plan.readOnly, status: plan.clarification ? "ambiguous" : "resolved",
      resolutionSubject: ids.length === 1 ? context.eligiblePets.find(pet => pet.id === ids[0])?.name || context.pet.name : context.pet.name };
  }
  if (!contract.interpretation?.request && contract.scope.requestKind === "resolution_status") {
    const pet = context.eligiblePets.find(pet => pet.id === ids[0]);
    if (ids.length !== 1 || pet?.name?.toLowerCase() !== contract.scope.resolutionSubject?.toLowerCase()) contract.scope.status = "ambiguous";
  }
  if (context.episodeResult) { contract.episodes = structuredClone(context.episodeResult); if (!context.askInterpretation) contract.scope.readOnlyRecall = true; }
  if (context.historyFallback) { contract.historyFallback = context.historyFallback; if (!context.askInterpretation) contract.scope.readOnlyRecall = true; }
  if (context.askHistory) {
    if (!context.askInterpretation) contract.scope.readOnlyRecall = true;
    const history = context.askHistory;
    contract.history = structuredClone(history.coverage);
    contract.sources = contract.sources.filter(source => source.source !== "care_entries");
    for (const petId of ids) {
      const status = history.coverage.perPet.find(pet => pet.petId === petId);
      const source = evidenceSource(petId, "care_entries", history.originals.filter(row => row.pet_profile_id === petId).map(row => `care:${row.id}`));
      source.loadedCount = source.loadedIds.length;
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
    const changedSources = new Set(history.coverage.provenance.filter(source => source.status === "deleted_or_changed").map(source => source.sourceId));
    contract.losses.push(...history.coverage.excludedIds.map(sourceId => ({ sourceId, reason: changedSources.has(sourceId) ? "source_deleted_or_changed" : "historical_evidence_budget" })));
  }
  const weightComparison = contract.interpretation?.request ? null : buildWeightComparison(context, contract);
  if (weightComparison) contract.weightComparison = weightComparison;
  const sourceNoteRecall = contract.interpretation?.request ? null : buildSourceNoteRecall(context.askHistory ? { ...context, careEntries: context.askHistory.entries } : context, contract);
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
    field: "value", start: 0, end: record.value.length, text: record.value,
    ...(contract.interpretation || contract.scope.requestKind === "resolution_status" || contract.weightComparison ? { occurredAt: record.occurredAt } : {}) }));
  return refreshEvidenceCoverage(contract);
}

export function evidenceScopeKey(scope: AskEvidenceScope) { return JSON.stringify(scope); }

/** Attribution only, never a lifecycle computation or a current-state certificate.
 * Exact bounded sentence forms avoid stripping a qualification or quoting a
 * terminal phrase into the answer. All other prose remains uncertain. */
export function resolutionStatusAnswer(contract: AskEvidenceContract, synthesis: HistorySynthesisProposal[] = []): string | null {
  if (contract.interpretation?.request) return null;
  if (contract.scope.requestKind !== "resolution_status") return null;
  if (contract.interpretation) {
    if (contract.scope.status === "ambiguous" || !contract.scope.requestedTopic.trim()) return "Which issue do you mean?";
    return directHistoryExplanation(contract) || attributedHistoryAnswer(contract, true, synthesis);
  }
  const uncertainty = "I can't establish whether the hiding has ended now from the available dated evidence.";
  if (contract.scope.status !== "resolved" || contract.scope.authorizedPetIds.length !== 1 || contract.scope.requestedTopic !== "hiding") {
    return "I can't establish whether the condition has ended. Please identify one pet and a specific condition with a dated note.";
  }
  const petId = contract.scope.authorizedPetIds[0];
  if (contract.sources.some(source => source.petId === petId && source.source === "care_entries" && ["unavailable", "not_loaded"].includes(source.status))
    || contract.history && (contract.history.corrections === "unavailable" || contract.history.retrieval === "unavailable"
      || contract.history.reasons.includes("unlinked_correction_uncertain"))) return uncertainty;
  const subject = contract.scope.resolutionSubject!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const partial = new RegExp(`^${subject} (?:is hiding less but still hides sometimes; it has not fully resolved|still hides sometimes)\\.$`, "i");
  const terminal = new RegExp(`^(?:${subject} stopped hiding|${subject}['’]s hiding has (?:fully )?resolved)\\.$`, "i");
  const notes = contract.represented.filter(span => span.petId === petId && span.sourceType === "care_update" && /\bhid(?:ing|es?)\b/i.test(span.text));
  if (notes.length !== 1) return uncertainty;
  const note = notes[0];
  if (!note.occurredAt || !/^\d{4}-\d{2}-\d{2}T/.test(note.occurredAt) || !Number.isFinite(Date.parse(note.occurredAt))
    || new Date(note.occurredAt).toISOString().slice(0, 10) !== note.occurredAt.slice(0, 10) || Date.parse(note.occurredAt) > Date.now()
    || contract.losses.some(loss => loss.sourceId === note.sourceId)
    || !contract.sources.some(source => source.petId === petId && source.loadedIds.includes(note.sourceId))
    || contract.history?.provenance.some(source => source.sourceId === note.sourceId && !["effective_linked", "unverified_legacy"].includes(source.status))) return uncertainty;
  const report = partial.test(note.text) ? (/hiding less/i.test(note.text) ? "hiding had decreased but still happened sometimes" : "hiding still happened sometimes")
    : terminal.test(note.text) ? "the owner reported that hiding had ended at that time" : null;
  if (!report) return uncertainty;
  const date = new Date(note.occurredAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `The ${date} note reports that ${report}. ${uncertainty}`;
}

/** Deliberately bounded policy, not general factual entailment. Recognized
 * evidence requests receive server authority; ordinary answers stay intact. */
export function evidenceAnswerPolicy(contract: AskEvidenceContract, synthesis: HistorySynthesisProposal[] = []): string | null {
  // The shared request path is composed and reviewed semantically. Its safe
  // fallback may quote source reports, but never runs wording-specific answers.
  if (contract.interpretation?.request) {
    if (contract.historyAccess && contract.history?.reasons.includes("requested_period_outside_subscription_window")) {
      contract.answerSourceIds = []; contract.answerContent = [];
      return `Ask can use saved history from ${contract.historyAccess.from.slice(0, 10)} through ${new Date(Date.parse(contract.historyAccess.to) - 86400000).toISOString().slice(0, 10)} for your plan. The requested dates are outside that window. Future-dated notes cannot establish what has happened already, and older excluded records are not evidence that nothing happened.`;
    }
    if (contract.scope.status === "ambiguous") return "I couldn't resolve the requested subject or reference reliably. Could you clarify what you mean?";
    if (contract.history && contract.scope.requestKind !== "count") return attributedHistoryAnswer(contract, false, synthesis);
    if (contract.scope.requestKind !== "count") return null;
  }
  const resolution = resolutionStatusAnswer(contract, synthesis);
  if (resolution) return resolution;
  const kind = contract.scope.requestKind;
  if (contract.interpretation && (contract.interpretation.readOnly || contract.history)) {
    if (contract.scope.status === "ambiguous") return "Which pet, issue or earlier episode do you mean?";
    if (contract.history && !contract.represented.some(span => span.sourceType === "care_update")) {
      contract.answerSourceIds = []; contract.answerContent = [];
      return contract.scope.authorizedPetIds.map(id => missingHistoryPetLimitation(contract, id)).join("\n\n");
    }
    // Arbitrary narrative is not an evidence claim. Only complete source reports
    // and independently computed episode results have factual authority.
    if (kind !== "count" && contract.history) return withinNoteCountAnswer(contract) || calendarIntervalAnswer(contract) || correctionReportAnswer(contract) || weightComparisonAnswer(contract) || directHistoryExplanation(contract) || attributedHistoryAnswer(contract, false, synthesis);
    if (kind !== "count") return null;
  }
  if (contract.historyFallback && contract.scope.status !== "ambiguous") return "I couldn't resolve a supported historical topic or period for this lookup. Only limited recent context is available on this path. Please specify a topic and a single year or month; I can't establish a complete historical answer from recent notes.";
  if (contract.history?.reasons.includes("no_matching_candidates_not_absence")) {
    return contract.scope.authorizedPetIds.map(id => missingHistoryPetLimitation(contract, id)).join("\n\n");
  }
  if (contract.history?.provenance.some(source => ["superseded", "tombstoned_or_inactive"].includes(source.status)) && !contract.represented.some(span => span.sourceType === "care_update")) {
    return "The retrieved original report is superseded or inactive and is not effective evidence for this pet. This does not establish an absence across the pet's history.";
  }
  if (contract.history && (contract.history.corrections === "unavailable" || contract.history.retrieval === "unavailable"
    || contract.history.retrieval === "partial" || contract.history.corrections === "partial" || contract.history.excludedIds.length || contract.history.reasons.includes("unlinked_correction_uncertain")
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
  const comparison = weightComparisonAnswer(contract);
  if (comparison) return comparison;
  const failed = contract.sources.some(source => source.status === "unavailable" || source.status === "not_loaded");
  const lead = failed ? "I couldn't verify all the requested records." : "The available records are limited, and their completeness and corrections are not verified.";
  const task = kind === "count" ? "an exact total" : kind === "absence" ? "whether something is absent from the full record"
    : kind === "comparison" ? "a complete weight or history comparison" : "a complete summary of the requested history";
  return `${lead} I can't establish ${task} from this evidence. I can discuss the supplied notes, or you can identify a specific record to review.`;
}

export function conversationalHistoryLimitation(contract: AskEvidenceContract): string {
  if (!contract.interpretation || !contract.history) return "";
  const history = contract.history;
  if (history.corrections === "unavailable") return "I couldn't check corrections to these records, so I can't rely on them yet.";
  if (!contract.interpretation.request && history.reasons.includes("unlinked_correction_uncertain")) return "An unlinked correction leaves attribution uncertain; I cannot confirm which reports it changes."
    + (history.retrieval === "unavailable" ? " Some saved records also couldn't be loaded." : history.retrieval === "partial" ? " This includes only part of the matching history." : "");
  if (history.retrieval === "unavailable") return "Some saved records couldn't be loaded. This covers only the notes I could check.";
  if (history.retrieval === "partial" || history.excludedIds.length || contract.losses.some(loss => /^(care|claim):/.test(loss.sourceId))) return "Some history could not be checked or included. This answer covers only the usable reports; a narrower topic or date range may help.";
  return contract.scope.requestKind === "resolution_status" || contract.interpretation?.selection?.startsWith("earliest") ? ""
    : "This covers the matching saved notes I could verify, not necessarily every event in their life.";
}

/** Absence of usable spans is not evidence of an empty search. Per-pet row
 * counts precede representation; source IDs and provenance track later losses. */
export function missingHistoryPetLimitation(contract: AskEvidenceContract, petId: string): string {
  const name = contract.petNames?.[petId] || "Your pet";
  const history = contract.history;
  const pet = history?.perPet.find(item => item.petId === petId);
  const sources = contract.sources.filter(source => source.petId === petId && source.source === "care_entries");
  if (history?.corrections === "unavailable") return `${name}: I couldn't check corrections, so I can't reliably attribute the saved reports yet.`;
  if (pet?.status === "unavailable" || !pet && history?.retrieval === "unavailable" || sources.some(source => ["unavailable", "not_loaded"].includes(source.status))) {
    return `${name}: I couldn't check the saved history just now. Please try again.`;
  }
  const ids = new Set([...sources.flatMap(source => source.loadedIds), ...contract.represented.filter(span => span.petId === petId && span.sourceType === "care_update").map(span => span.sourceId)]);
  const attributionLoss = history?.provenance.some(source => (ids.has(source.sourceId) || source.subjectId === petId)
    && !["effective_linked", "effective_replacement", "unverified_legacy"].includes(source.status));
  if (attributionLoss || history?.reasons.includes("unlinked_correction_uncertain")) return `${name}: I couldn't verify an effective report for this question because correction or attribution evidence is unresolved or excludes the retrieved reports. This does not establish an absence in the saved history.`;
  if (contract.losses.some(loss => ids.has(loss.sourceId) && /budget|selection|truncat/i.test(loss.reason))) return `${name}: Saved evidence was excluded by selection or size limits, so I couldn't include a usable report for this question. A narrower topic or date range may help.`;
  // Global losses cannot always be attributed to one pet. Do not convert that
  // uncertainty (or a filtered/truncated span) into a no-match assertion.
  if (pet?.exhausted && pet.rows === 0 && !ids.size && !history?.candidateIds.length && !history?.excludedIds.length
    && !contract.losses.some(loss => /^(?:care|claim):/.test(loss.sourceId)) && history?.retrieval !== "partial") {
    return `${name}: I couldn't find matching saved notes for this query. This does not establish an absence in the saved history.`;
  }
  return `${name}: I couldn't verify a usable saved report for this question from the available evidence. This does not establish an absence in the saved history.`;
}

/** A bounded extractive claim mechanism shared by status, recall and comparison.
 * Identity is necessary but insufficient: the claim is the entire represented
 * source text, attributed to its record. No model prose or inferred grouping is
 * admitted. Full spans preserve negation, quantities and qualifications together.
 */
export function attributedHistoryAnswer(contract: AskEvidenceContract, status = false, synthesis: HistorySynthesisProposal[] = []): string {
  const correctionReport = correctionReportAnswer(contract);
  if (correctionReport) {
    if (contract.scope.authorizedPetIds.length === 1) return correctionReport;
    const ids: string[] = []; const content: string[] = [];
    const reports = contract.scope.authorizedPetIds.map(petId => {
      const scoped = structuredClone(contract); scoped.scope.authorizedPetIds = [petId];
      const text = attributedHistoryAnswer(scoped, status, synthesis);
      ids.push(...(scoped.answerSourceIds || [])); content.push(...(scoped.answerContent || []));
      return `${contract.petNames?.[petId] || "Your pet"}: ${text}`;
    });
    contract.answerSourceIds = ids; contract.answerContent = content;
    return reports.join("\n\n");
  }
  if (contract.history?.corrections === "unavailable") {
    contract.answerSourceIds = []; contract.answerContent = [];
    return contract.scope.authorizedPetIds.map(id => missingHistoryPetLimitation(contract, id)).join("\n\n");
  }
  contract.answerSourceIds = [];
  contract.answerContent = [];
  const sharedRequest = contract.interpretation?.request;
  const unresolvedCorrection = !sharedRequest && !!contract.history?.reasons.includes("unlinked_correction_uncertain");
  const period = contract.interpretation?.history;
  const terms = period?.terms || [];
  const timelineDays = sharedRequest ? null : requestedHistoryTimelineDays(contract.scope.requestText, new Date().getUTCFullYear());
  const notes = contract.represented.filter(span => span.sourceType === "care_update"
    && contract.scope.authorizedPetIds.includes(span.petId)
    && (!timelineDays || !!span.occurredAt && timelineDays.includes(span.occurredAt.slice(0,10)))
    && (!period?.from || !!span.occurredAt && span.occurredAt >= period.from)
    && (!period?.to || !!span.occurredAt && span.occurredAt < period.to)
    && span.start === 0 && span.end === span.text.length && span.text.trim()
    && (sharedRequest || !terms.length || terms.some(term => span.text.toLocaleLowerCase().includes(term.toLocaleLowerCase())))
    && !contract.losses.some(loss => loss.sourceId === span.sourceId)
    && contract.sources.some(source => source.petId === span.petId && source.loadedIds.includes(span.sourceId)
      && source.status !== "not_loaded")
    && !contract.history?.provenance.some(source => source.sourceId === span.sourceId
      && !["effective_linked", "effective_replacement", "unverified_legacy", ...(sharedRequest ? ["unlinked_correction_uncertain"] : [])].includes(source.status)))
    .sort((a, b) => (b.occurredAt || "").localeCompare(a.occurredAt || ""));
  const selection = contract.interpretation?.selection || (status ? "latest" : "summary");
  const quote = /\b(?:quote|verbatim|exact wording)\b/i.test(contract.scope.requestText);
  const reports: string[] = [];
  for (const petId of contract.scope.authorizedPetIds) {
    const petName = contract.petNames?.[petId] || "Your pet";
    const candidates = notes.filter(note => note.petId === petId);
    const occurrence = (note: typeof candidates[number]) => classifyOccurrenceReport(note.text, petName, terms);
    const eligible = selection === "earliest_occurrence" ? occurrenceCandidates(candidates, occurrence, note => note.occurredAt || "") : candidates;
    const eventTerms = sharedRequest?.mode === "read" && selection !== "earliest_occurrence"
      ? historyEventTerms(contract.scope.requestText) : [];
    const eventRelevance = historyEventRelevance(eligible.map(note => note.text), eventTerms);
    const eventFallback = eventTerms.length > 0;
    const ordered = orderHistoryEvidence(eligible, selection, note => note.occurredAt || "", note => note.sourceId,
      undefined, eventFallback ? note => -eventRelevance(note.text) : undefined);
    const boundary = contract.history?.chronology?.find(item => item.petId === petId);
    const boundaryBlocked = unresolvedCorrection || boundary?.blocked || boundary?.boundaryIds.some(id => !candidates.some(note => note.sourceId === id));
    const occurrenceUncertain = selection === "earliest_occurrence" && ordered.filter(note => compareHistoryTime(note.occurredAt || "", ordered[0]?.occurredAt || "") === 0).some(note => occurrence(note) !== "affirmative");
    // Earliest/latest answers retain their decisive report. Include the other
    // dated reports for status so a resolution cannot hide a later recurrence.
    const selected = !eventFallback && (selection.startsWith("earliest") || selection === "latest" && !status)
      ? ordered.filter(note => compareHistoryTime(note.occurredAt || "", ordered[0]?.occurredAt || "") === 0) : ordered;
    // An unresolved early report remains first. A later affirmative report can
    // still answer the supported portion, without taking first-occurrence authority.
    if (occurrenceUncertain) {
      const later = ordered.find(note => occurrence(note) === "affirmative" && !selected.includes(note));
      if (later) selected.push(...ordered.filter(note => compareHistoryTime(note.occurredAt || "", later.occurredAt || "") === 0 && !selected.includes(note)));
    }
    // Select the bounded sample before presentation sorting; otherwise chronology
    // can discard the same decisive event that retrieval deliberately retained.
    // Failed shared reads show a bounded sample, never pages of unreviewed prose.
    const omittedFallbackReports = sharedRequest ? Math.max(0, selected.length - 3) : 0;
    if (omittedFallbackReports) selected.splice(3);
    if (eventFallback || !selection.startsWith("earliest") && selection !== "latest") selected.sort((a, b) => (a.occurredAt || "").localeCompare(b.occurredAt || ""));
    const groups = new Map<string, typeof selected>();
    for (const note of selected) groups.set(note.text, [...(groups.get(note.text) || []), note]);
    const sentences = [...groups.values()].map(group => {
      const note = group[0];
      const dates = [...new Set(group.map(item => item.occurredAt?.slice(0, 10) || "date not recorded"))].join(", ");
      const proposals = synthesis.filter(proposal => group.some(item => item.sourceId === proposal.sourceId));
      // Verify each proposal against the complete content, independently of IDs.
      const natural = !quote ? proposals.filter(proposal => synthesis.filter(other => other.sourceId === proposal.sourceId).length === 1)
        .map(proposal => supportedHistoryParaphrase(note.text, proposal.text, petName)).find(Boolean) : null;
      contract.answerSourceIds!.push(...group.map(item => item.sourceId));
      const anchored = !boundaryBlocked && !occurrenceUncertain && (selection.startsWith("earliest") || selection === "latest") && note === selected[0] && group.length === 1;
      const futureDated = group.some(item => !!item.occurredAt && Date.parse(item.occurredAt) > Date.now());
      const unlinked = sharedRequest && contract.history?.provenance.some(source => source.sourceId === note.sourceId && source.status === "unlinked_correction_uncertain");
      const content = unlinked ? `The correction note saved under ${petName} on ${dates} says: ${JSON.stringify(note.text)} Its link to an original report has not been verified.${futureDated ? " This is future-dated and does not establish that the reported event has already happened." : ""}`
        : futureDated ? `${petName} has a future-dated saved report (${dates}); this is not evidence that it has already happened: ${JSON.stringify(note.text)}`
        : natural ? unresolvedCorrection ? `The ${dates} note saved for ${petName} reports: ${natural}` : anchored ? natural : `${natural.replace(/[.!]$/, "")} (${dates}).`
        : `${petName}'s ${dates} report: ${JSON.stringify(note.text)}`;
      contract.answerContent!.push(content);
      return content;
    });
    if (sentences.length) {
      const date = selected[0].occurredAt?.slice(0, 10) || "an unknown date";
      const lead = sharedRequest ? `I couldn't verify a complete answer to the request. Here are ${omittedFallbackReports ? "three sample source excerpts" : "the source excerpts"} for ${petName}${omittedFallbackReports ? "; additional matching records are not displayed" : ""}: `
        : unresolvedCorrection ? `${petName} has these saved reports, with correction uncertainty noted below. `
        : boundaryBlocked ? `I could verify this dated history for ${petName}, but could not establish the ${selection === "latest" ? "latest" : "earliest"} matching report because some candidates could not be checked. `
        : occurrenceUncertain ? `I found matching reports for ${petName}, but could not identify a supported first occurrence from them. `
        : selection.startsWith("earliest") ? `The earliest matching report I could check for ${petName} is from ${date}. `
        : selection === "latest" ? `The latest matching update I could check for ${petName} is dated ${date}. ` : `${petName}'s recorded history: `;
      reports.push(timelineDays ? sentences.join("\n\n") : lead + sentences.join(sharedRequest ? "\n\n" : " "));
    } else {
      reports.push(missingHistoryPetLimitation(contract, petId));
    }
  }
  if (contract.interpretation && !contract.interpretation.readOnly) {
    const assertions = analyzeOwnerAssertions(contract.scope.requestText).assertionSpans;
    const current = splitSentencesPreservingFacts(contract.scope.requestText).filter(sentence => !sentence.endsWith("?")
      && assertions.some(assertion => sentence.includes(assertion.text))
      && (!terms.length || terms.some(term => sentence.toLocaleLowerCase().includes(term.toLocaleLowerCase()))));
    if (current.length) reports.unshift(`You just reported: ${current.join(" ")} For comparison, here are the dated reports.`);
  }
  const limitation = conversationalHistoryLimitation(contract);
  if (selection.startsWith("earliest")) reports.push("These saved reports are not proof of when it first happened in their life.");
  if (status) {
    const today = new Date().toISOString().slice(0, 10);
    const current = notes.some(note => note.occurredAt?.slice(0, 10) === today);
    if (!current) reports.push(contract.interpretation?.history?.to ? "These reports describe the requested period, not the current situation."
      : "These are dated updates; I can't establish the current situation beyond what they report.");
  }
  if (limitation) reports.push(limitation);
  return reports.join("\n\n");
}
