import { isStoredRead, storedReadResult } from "./stored-read-publication.ts";
import { isTypedProfileRead, profileFieldProjection, profileFieldSentence, type AuthorizedProfileField } from "./profile-field-authority.ts";
import { careEvidenceId, eligibleAnswerSources, type AskEvidenceContract } from "./ask-evidence.ts";
import { selectionPublication } from "./selection-publication.ts";
import { resultSetSnapshotMatches } from "./result-set-publication.ts";
import { labsPresentation } from "./labs-presentation.ts";
import { buildEvidenceNeedCoverage } from "./evidence-need-coverage.ts";
import { historyNarrativeAnchorsSupported } from "./history-narrative-facts.ts";
import type { HistoryObligation, ObligationCompletion } from "./history-obligations.ts";
import type { HistoryNarrative } from "./history-narrative.ts";

export type PublicationObligationAuthority = {
  obligationId: string; authority: "certified" | "existing_policy" | "composite" | "unavailable";
  authorizedSourceIds: string[]; certifiedRecordIds: string[];
  certificateType: "selection" | "result_set" | null; status: string;
  fieldProjection?: AuthorizedProfileField; sourceDomain?: "saved_profile" | "memory" | "current_state" | "operation_receipt";
  subjectId?: string; clauseId?: number; profileField?: string; needId?: string;
};
export type PublicationAuthorityClaim = { obligationId: string; text: string; sourceIds: string[] };
const unique = (ids: string[]) => [...new Set(ids)];
/** The domain boundary is typed; unsupported operations must not escape it. */
export function requiresHistoryPublicationAuthority(evidence: AskEvidenceContract | undefined): boolean {
  return isOrdinarySavedHistoryRequest(evidence?.interpretation?.request);
}
export function isOrdinarySavedHistoryRequest(request: { mode?: string | null; evidenceBasis?: string | null } | undefined): boolean {
  return request?.mode === "read" && request.evidenceBasis === "saved_history";
}
export function supportedHistoryPublication(evidence: AskEvidenceContract): boolean {
  const request = evidence.interpretation?.request, ticket = request?.readTicket;
  const presentation = labsPresentation(request?.outputFormat);
  return !!ticket && evidence.scope.readOnlyRecall && evidence.scope.status === "resolved"
    && !request?.writeJob && !request?.appendJob && !request?.mutationIntent && !request?.task
    && !request?.projection && !request?.profileFields?.length && !request?.evidenceNeeds?.length && !request?.requirements?.length
    && presentation !== null && (!!ticket.selection || presentation === "prose")
    && !ticket.needs?.length && !ticket.episode && !ticket.temporal.calendar && ticket.outputs.strategy == null
    && ["read", "read_since_event"].includes(ticket.operation)
    && ["records", "measurement"].includes(request?.quantity || "")
    && [undefined, "recall"].includes(evidence.interpretation?.readOperation ?? evidence.interpretation?.operation)
    && ticket.subjects.petIds.length > 0
    && ticket.subjects.petIds.every(id => evidence.scope.authorizedPetIds.includes(id));
}
// A publication transport is distinct from prompt representation. Its rows
// acquire authority only by matching existing organ receipts; Labs callers also
// verify the existing immutable snapshot before accepting this derived view.
export type PublicationRecordTransport = { id: string; sourceId: string; petId: string; body: string; event_at: string };
function deriveOrdinaryHistoryAuthority(evidence: AskEvidenceContract, transport?: readonly PublicationRecordTransport[]) {
  const ticket = evidence.interpretation?.request?.readTicket, coverage = evidence.history?.ticketCoverage;
  const sources = transport === undefined
    ? eligibleAnswerSources(evidence).filter(s => s.sourceType === "care_update")
    : transport.map(row => ({ sourceId: row.sourceId, petId: row.petId, sourceType: "care_update",
      field: "value" as const, text: row.body, start: 0, end: row.body.length, occurredAt: row.event_at }));
  const subjectIds = ticket?.subjects.petIds || evidence.scope.authorizedPetIds;
  const unavailable = (status: string) => ({
    obligations: subjectIds.map<PublicationObligationAuthority>(subjectId => ({ obligationId: `history:${subjectId}`,
      authority: "unavailable" as const, certificateType: null, subjectId, status,
      authorizedSourceIds: [] as string[], certifiedRecordIds: [] as string[] })),
    authorizedSourceIds: [] as string[], sources: [] as typeof sources,
    ticket, subjectIds, transportValid: false,
  });
  if (!supportedHistoryPublication(evidence)) return unavailable("unsupported");
  if (!coverage) return unavailable("unavailable");
  if (transport && (new Set(transport.map(row => row.id)).size !== transport.length
    || transport.some(row => !subjectIds.includes(row.petId)
      || row.sourceId !== careEvidenceId(row.id, evidence.history))))
    return unavailable("unavailable");
  const represented = (id: string, petId: string) =>
    sources.some(s => s.sourceId === careEvidenceId(id, evidence.history) && s.petId === petId);
  let obligations: PublicationObligationAuthority[], transportValid: boolean;
  if (ticket!.selection) {
    const records = transport || coverage.groups?.flatMap(g => g.selectedIds.filter(id => represented(id, g.petId))
      .map(id => ({ id, petId: g.petId }))) || [];
    const selected = selectionPublication(ticket!, coverage, records)!;
    transportValid = selected.transportValid;
    obligations = selected.certificates.map(c => ({
      obligationId: `selection:${c.subjectId}:${c.clauseId}`, subjectId: c.subjectId, clauseId: c.clauseId,
      authority: c.certified ? "certified" : "unavailable", certificateType: "selection", status: c.status,
      authorizedSourceIds: c.certified ? c.selectedEventIds.map(id => careEvidenceId(id, evidence.history)) : [],
      certifiedRecordIds: c.certified ? [...c.selectedEventIds] : [],
    }));
  } else {
    const proof = coverage.resultSet;
    if (!proof) return unavailable("unavailable");
    const records = transport || proof.retainedIds.flatMap(id => proof.subjects.filter(s => s.retainedIds.includes(id))
      .filter(s => represented(id, s.petId)).map(s => ({ id, petId: s.petId })));
    transportValid = resultSetSnapshotMatches(ticket!, coverage, records);
    if (!transportValid || !proof.certified) return unavailable(coverage.status === "unavailable" ? "unavailable" : "partial");
    obligations = proof.subjects.map(s => ({
      obligationId: `result_set:${s.petId}`, subjectId: s.petId, authority: "certified",
      certificateType: "result_set", status: s.retainedIds.length ? "complete" : "complete_empty",
      authorizedSourceIds: s.retainedIds.map(id => careEvidenceId(id, evidence.history)),
      certifiedRecordIds: [...s.retainedIds],
    }));
  }
  if (!obligations.length) return unavailable("unavailable");
  const authorizedSourceIds = unique(obligations.flatMap(o => o.authorizedSourceIds));
  return { obligations, authorizedSourceIds, sources: sources.filter(s => authorizedSourceIds.includes(s.sourceId)),
    ticket, subjectIds, transportValid };
}
// Recomputed from the existing ticket/organ receipts and represented source
// versions. Never persisted as a new factual or certification store.
export function derivePublicationAuthority(evidence: AskEvidenceContract | undefined, transport?: readonly PublicationRecordTransport[]) {
  if(evidence && isStoredRead(evidence)) {
    const result=storedReadResult(evidence), request=evidence.interpretation?.request?.storedRead;
    const certified=!!result && ["complete","complete_empty"].includes(result.status);
    const records=certified?result!.records:[];
    const sources=records.map(row=>({sourceId:row.sourceId,petId:row.subjectId,sourceType:row.provenance.domain,
      field:"value" as const,text:row.text,start:0,end:row.text.length,occurredAt:null}));
    const subjects=request?.scope==="owner"?[request.ownerId]:request?.subjectIds||[];
    const obligations:PublicationObligationAuthority[]=subjects.map(subjectId=>({obligationId:"stored:"+request!.domain+":"+subjectId,
      authority:certified?"certified":"unavailable",certificateType:null,sourceDomain:request!.domain,subjectId,
      status:result?.status||"unavailable",authorizedSourceIds:records.filter(r=>request!.scope==="owner"||r.subjectId===subjectId).map(r=>r.sourceId),
      certifiedRecordIds:records.filter(r=>request!.scope==="owner"||r.subjectId===subjectId).map(r=>r.id)}));
    return {obligations,authorizedSourceIds:sources.map(s=>s.sourceId),sources,ticket:undefined,subjectIds:subjects,transportValid:certified};
  }
  if (evidence && requiresHistoryPublicationAuthority(evidence)) return deriveOrdinaryHistoryAuthority(evidence, transport);
  const ticket = evidence?.interpretation?.request?.readTicket, coverage = evidence?.history?.ticketCoverage;
  if (evidence && isTypedProfileRead(evidence)) {
    const projection = profileFieldProjection(evidence);
    const sources = eligibleAnswerSources(evidence);
    const obligations: PublicationObligationAuthority[] = evidence.scope.authorizedPetIds.flatMap(subjectId =>
      [...new Set(evidence.interpretation!.request!.profileFields!)].map(profileField => {
        const field = projection?.fields.find(f => f.subjectId === subjectId && f.fieldSelector === profileField);
        return { obligationId: `profile:${subjectId}:${profileField}`, authority: "certified" as const,
          certificateType: null, sourceDomain: "saved_profile" as const, subjectId, profileField,
          status: !field || field.state === "unavailable" ? "unavailable" : field.state === "empty" ? "complete_empty" : "complete",
          authorizedSourceIds: field && field.state !== "unavailable" ? [field.sourceId] : [],
          certifiedRecordIds: [], ...(field ? { fieldProjection: field } : {}) };
      }));
    const authorizedSourceIds = unique(obligations.flatMap(o => o.authorizedSourceIds));
    return { obligations, authorizedSourceIds, sources: sources.filter(s => authorizedSourceIds.includes(s.sourceId)),
      ticket: undefined, subjectIds: evidence.scope.authorizedPetIds, transportValid: !!projection && obligations.every(o => o.status !== "unavailable") };
  }
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
    ticket, subjectIds: ticket.subjects.petIds, transportValid: selected.transportValid };
}
export function publicationSources(evidence: AskEvidenceContract) {
  const authority = derivePublicationAuthority(evidence);
  return authority?.sources || (requiresHistoryPublicationAuthority(evidence) ? [] : eligibleAnswerSources(evidence));
}
export function bindPublicationObligations(evidence: AskEvidenceContract, existing: readonly HistoryObligation[]) {
  const authority = derivePublicationAuthority(evidence);
  if (!authority) return { obligations: [...existing], bindings: new Map<number, PublicationObligationAuthority>() };
  const bindings = new Map<number, PublicationObligationAuthority>();
  const obligations: HistoryObligation[] = requiresHistoryPublicationAuthority(evidence)
    ? [{ index: 0, text: JSON.stringify({ requirement: "Present only bound historical results", readTicket: authority.ticket }) }]
    : [...existing];
  bindings.set(0, { obligationId: "obligation_0", authority: "composite", certificateType: null,
    status: "requires_components", authorizedSourceIds: authority.authorizedSourceIds,
    certifiedRecordIds: unique(authority.obligations.flatMap(o => o.certifiedRecordIds)) });
  for (const component of authority.obligations) {
    const clause = component.clauseId === undefined ? null : authority.ticket?.selection?.union[component.clauseId];
    const text = component.certificateType === "selection"
      ? JSON.stringify({ requirement: "Report the requested selected source records for this subject and clause",
        subjectId: component.subjectId, predicates: authority.ticket?.predicates, temporal: authority.ticket?.temporal,
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
  "publicationAuthority binds each factual obligation to its own permitted source IDs. A source available for another obligation cannot satisfy this one. Certified selection claims must use the selected historical sources, never current profile substitutes. Preserve their exact values, dates and subjects. Separate independent obligations into separately cited chunks/rows; do not combine sources from different obligations into one claim. Coverage certificates authorize only their bounded selection, never exhaustive history, absence, counts or new calculations. Uncertified ordinary saved-history obligations authorize no factual claims. Other domains retain their existing evidence rules.";
export function publicationGenerationContext(evidence: AskEvidenceContract, original: object): object {
  const authority = derivePublicationAuthority(evidence);
  if (!authority) return original;
  // Rebuild the factual payload rather than retaining hidden alternatives in
  // profile snapshots, record inventories, old dialogue or duplicate contexts.
  return { ...(requiresHistoryPublicationAuthority(evidence) ? {} : { question: evidence.scope.requestText, request: evidence.interpretation?.request }),
    pets: authority.subjectIds.map(id => ({ id, name: evidence.petNames?.[id] })),
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
    if (binding.sourceDomain && binding.sourceDomain !== "saved_profile") {
      const records=storedReadResult(evidence)?.records||[];
      const exact=records.find(row=>row.provenance.domain===binding.sourceDomain && row.text===claim.text
        && JSON.stringify(claim.sourceIds)===JSON.stringify([row.sourceId]));
      if(binding.authority!=="certified" || !exact)failures.push("publication_stored_source_drift:"+binding.obligationId);
      continue;
    }
    if (binding.sourceDomain === "saved_profile") {
      const field = binding.fieldProjection;
      const projection = profileFieldProjection(evidence);
      if (!field || !projection || claim.text !== profileFieldSentence(field, projection.petNames[field.subjectId])
        || JSON.stringify(claim.sourceIds) !== JSON.stringify(binding.authorizedSourceIds))
        failures.push("publication_profile_field_drift:" + binding.obligationId);
      continue;
    }
    if (binding.authority !== "certified") {
      if (requiresHistoryPublicationAuthority(evidence)) failures.push("publication_obligation_not_certified:" + binding.obligationId);
      continue;
    }
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
