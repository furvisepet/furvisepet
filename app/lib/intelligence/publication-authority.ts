import { careEvidenceId, eligibleAnswerSources, type AskEvidenceContract } from "./ask-evidence.ts";
import { selectionPublication } from "./selection-publication.ts";
import { buildEvidenceNeedCoverage } from "./evidence-need-coverage.ts";
import { historyNarrativeAnchorsSupported } from "./history-narrative-facts.ts";
import type { HistoryObligation, ObligationCompletion } from "./history-obligations.ts";
import type { HistoryNarrative } from "./history-narrative.ts";

export type PublicationObligationAuthority = {
  obligationId: string; authority: "certified" | "existing_policy" | "composite";
  authorizedSourceIds: string[]; certifiedRecordIds: string[];
  certificateType: "selection" | null; status: string;
  subjectId?: string; clauseId?: number; profileField?: string; needId?: string;
};
export type PublicationAuthorityClaim = { obligationId: string; text: string; sourceIds: string[] };
const unique = (ids: string[]) => [...new Set(ids)];
// Recomputed from the existing ticket/organ receipts and represented source
// versions. Never persisted as a new factual or certification store.
export function derivePublicationAuthority(evidence: AskEvidenceContract | undefined) {
  const ticket = evidence?.interpretation?.request?.readTicket, coverage = evidence?.history?.ticketCoverage;
  if (!evidence || !ticket?.selection || !coverage) return null;
  const sources = eligibleAnswerSources(evidence);
  const records = coverage.groups?.flatMap(group => group.selectedIds.flatMap(id =>
    sources.some(source => source.sourceId === careEvidenceId(id, evidence.history) && source.petId === group.petId)
      ? [{ id, petId: group.petId }] : [])) || [];
  const selected = selectionPublication(ticket, coverage, records);
  const receipts = selectionPublication(ticket, coverage, coverage.groups?.flatMap(group =>
    group.selectedIds.map(id => ({ id, petId: group.petId }))) || []);
  if (!selected || !receipts?.certificates.some(c => c.certified)) return null;
  const obligations: PublicationObligationAuthority[] = receipts.certificates.map(c => ({
    obligationId: `selection:${c.subjectId}:${c.clauseId}`, authority: c.certified ? "certified" : "existing_policy",
    certificateType: "selection", status: c.certified && !selected.certificates.some(s =>
      s.subjectId === c.subjectId && s.clauseId === c.clauseId && s.certified) ? "unavailable" : c.status,
    subjectId: c.subjectId, clauseId: c.clauseId,
    authorizedSourceIds: c.certified ? c.selectedEventIds.map(id => careEvidenceId(id, evidence.history))
      : sources.filter(s => s.petId === c.subjectId).map(s => s.sourceId),
    certifiedRecordIds: c.certified ? [...c.selectedEventIds] : [],
  }));
  // Only explicit, already-bound profile fields create independent profile
  // obligations. Availability of a profile is not a request to publish it.
  for (const petId of ticket.subjects.petIds) for (const field of unique(evidence.interpretation?.request?.profileFields || [])) {
    obligations.push({ obligationId: `profile:${petId}:${field}`, authority: "existing_policy",
      certificateType: null, status: "not_certified", subjectId: petId, profileField: field,
      authorizedSourceIds: sources.filter(s => s.petId === petId && s.sourceType === "profile"
        && s.sourceId === `profile:${petId}:${field}`).map(s => s.sourceId), certifiedRecordIds: [] });
  }
  for (const need of buildEvidenceNeedCoverage(evidence)) for (const pet of need.pets) {
    obligations.push({ obligationId: `need:${need.needId}:${pet.petId}`, authority: "existing_policy",
      certificateType: null, status: pet.state, subjectId: pet.petId, needId: need.needId,
      authorizedSourceIds: sources.filter(s => pet.representedSourceIds.includes(s.sourceId)).map(s => s.sourceId),
      certifiedRecordIds: [] });
  }
  const authorizedSourceIds = unique(obligations.flatMap(o => o.authorizedSourceIds));
  return { obligations, authorizedSourceIds, sources: sources.filter(s => authorizedSourceIds.includes(s.sourceId)),
    ticket, transportValid: selected.transportValid };
}
export function publicationSources(evidence: AskEvidenceContract) {
  return derivePublicationAuthority(evidence)?.sources || eligibleAnswerSources(evidence);
}
export function bindPublicationObligations(evidence: AskEvidenceContract, existing: readonly HistoryObligation[]) {
  const authority = derivePublicationAuthority(evidence);
  if (!authority) return { obligations: [...existing], bindings: new Map<number, PublicationObligationAuthority>() };
  const bindings = new Map<number, PublicationObligationAuthority>();
  const obligations = [...existing];
  bindings.set(0, { obligationId: "obligation_0", authority: "composite", certificateType: null,
    status: "requires_components", authorizedSourceIds: authority.authorizedSourceIds,
    certifiedRecordIds: unique(authority.obligations.flatMap(o => o.certifiedRecordIds)) });
  for (const component of authority.obligations) {
    const clause = component.clauseId === undefined ? null : authority.ticket.selection!.union[component.clauseId];
    const text = component.certificateType === "selection"
      ? JSON.stringify({ requirement: "Report the requested selected source records for this subject and clause",
        subjectId: component.subjectId, predicates: authority.ticket.predicates, temporal: authority.ticket.temporal,
        selection: clause, status: component.status, authorizedSourceIds: component.authorizedSourceIds })
      : component.needId ? JSON.stringify({ requirement: "Answer this independent evidence need under existing coverage policy",
        need: evidence.interpretation?.request?.evidenceNeeds?.find(n => n.id === component.needId), subjectId: component.subjectId,
        authorizedSourceIds: component.authorizedSourceIds })
      : JSON.stringify({ requirement: "Report this requested stored profile field", subjectId: component.subjectId,
        field: component.profileField, authorizedSourceIds: component.authorizedSourceIds });
    const index = obligations.length;
    obligations.push({ index, text, petId: component.subjectId });
    bindings.set(index, component);
  }
  return { obligations, bindings };
}
export const PUBLICATION_AUTHORITY_POLICY =
  "publicationAuthority binds each factual obligation to its own permitted source IDs. A source available for another obligation cannot satisfy this one. Certified selection claims must use the selected historical sources, never current profile substitutes. Preserve their exact values, dates and subjects. Separate independent obligations into separately cited chunks/rows; do not combine sources from different obligations into one claim. Coverage certificates authorize only their bounded selection, never exhaustive history, absence, counts or new calculations. Uncertified obligations remain under existing evidence/coverage rules.";
export function publicationGenerationContext(evidence: AskEvidenceContract, original: object): object {
  const authority = derivePublicationAuthority(evidence);
  if (!authority) return original;
  // Rebuild the factual payload rather than retaining hidden alternatives in
  // profile snapshots, record inventories, old dialogue or duplicate contexts.
  return { question: evidence.scope.requestText, request: evidence.interpretation?.request,
    pets: authority.ticket.subjects.petIds.map(id => ({ id, name: evidence.petNames?.[id] })),
    publicationAuthority: authority.obligations, readTicket: authority.ticket,
    contextRecords: authority.sources.map(s => ({ id: s.sourceId, sourceId: s.sourceId, sourceType: s.sourceType,
      petId: s.petId, value: s.text, text: s.text, occurredAt: s.occurredAt || null })),
    coverage: { status: evidence.history?.ticketCoverage?.status, reasons: evidence.history?.ticketCoverage?.reasons },
    execution: { readOnly: evidence.scope.readOnlyRecall, mutationAuthority: false } };
}
export function publicationClaimFailures(evidence: AskEvidenceContract, claims: readonly PublicationAuthorityClaim[]) {
  const authority = derivePublicationAuthority(evidence);
  if (!authority) return [];
  const failures: string[] = [];
  for (const claim of claims) {
    const binding = authority.obligations.find(o => o.obligationId === claim.obligationId);
    if (!binding) { failures.push("publication_obligation_unknown"); continue; }
    if (claim.sourceIds.some(id => !binding.authorizedSourceIds.includes(id))) {
      failures.push("publication_source_outside_obligation:" + binding.obligationId); continue;
    }
    if (binding.authority !== "certified") continue;
    const cited = authority.sources.filter(s => claim.sourceIds.includes(s.sourceId));
    if (binding.status === "unavailable" || cited.length !== unique(claim.sourceIds).length
      || !claim.sourceIds.length && binding.status !== "complete_empty") {
      failures.push("publication_certified_source_unavailable:" + binding.obligationId); continue;
    }
    // Explicit owned subject labels are identity metadata, not semantic routing.
    // A same-valued record for another pet cannot authorize this attribution.
    const tokens = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) || [];
    const words = tokens(claim.text), ownName = tokens(evidence.petNames?.[binding.subjectId || ""] || "").join(" ");
    if (Object.entries(evidence.petNames || {}).some(([id, name]) => {
      const label = tokens(name);
      return id !== binding.subjectId && label.length && label.join(" ") !== ownName
        && words.some((_, index) => label.every((word, offset) => words[index + offset] === word));
    })) failures.push("publication_certified_subject_drift:" + binding.obligationId);
    // Question dates/premises are not certified record facts.
    if (!historyNarrativeAnchorsSupported(claim.text, cited, "", [], false,
      [], undefined, false, [], evidence.timeZone)) failures.push("publication_certified_fact_drift:" + binding.obligationId);
  }
  return unique(failures);
}
export function checkPublicationAuthority(evidence: AskEvidenceContract, bindings: ReadonlyMap<number, PublicationObligationAuthority>,
  sentences: HistoryNarrative["sentences"], completion: readonly ObligationCompletion[]) {
  const authority = derivePublicationAuthority(evidence);
  if (!authority) return { failures: [] as string[], claims: [] as PublicationAuthorityClaim[] };
  const failures: string[] = [], claims: PublicationAuthorityClaim[] = [];
  for (const [index, binding] of bindings) {
    if (index === 0) continue;
    const fulfilled = completion.find(c => c.index === index);
    if (!fulfilled) { failures.push("publication_obligation_unreviewed:" + binding.obligationId); continue; }
    const support = fulfilled.sentenceIndexes.flatMap(i => sentences[i] ? [sentences[i]] : []);
    if (binding.authority === "certified" && fulfilled.status === "answered"
      && binding.authorizedSourceIds.some(id => !support.some(s => s.sourceIds.includes(id))))
      failures.push("publication_selected_record_omitted:" + binding.obligationId);
    for (const sentence of support) {
      if (binding.authority === "certified" && sentence.calculations?.length)
        failures.push("publication_selection_does_not_certify_calculation:" + binding.obligationId);
      claims.push({ obligationId: binding.obligationId, text: sentence.text, sourceIds: [...sentence.sourceIds] });
    }
  }
  for (let index = 0; index < sentences.length; index++) {
    if (!completion.some(c => c.index !== 0 && bindings.has(c.index) && c.sentenceIndexes.includes(index)))
      failures.push("publication_claim_obligation_unbound:" + index);
  }
  failures.push(...publicationClaimFailures(evidence, claims));
  return { failures: unique(failures), claims };
}
