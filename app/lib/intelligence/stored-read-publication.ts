import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import { verifiedStoredReadResult, carryStoredReadResult, type StoredReadResult } from "../furvise-brain/stored-read-organ.ts";
export const STORED_READ_LABS = "server-stored-read-labs";
export const STORED_READ_UNAVAILABLE = "server-stored-read-unavailable";
export const STORED_READ_LIMITATION = "The requested stored information is unavailable for certified publication.";
export const STORED_READ_FORMAT_LIMITATION = "The requested stored-information output format is not supported by certified publication yet.";
export function isStoredRead(e: AskEvidenceContract | undefined) {
  return e?.interpretation?.request?.evidenceBasis === "stored" || !!e?.interpretation?.request?.storedRead;
}
export function storedReadResult(e: AskEvidenceContract | undefined) {
  const request=e?.interpretation?.request;
  return isStoredRead(e) && request?.mode==="read" && request.evidenceBasis==="stored"
    && !request.readTicket && !request.writeJob && !request.appendJob && !request.removeJob && !request.fieldMutationJob
    && !request.stateTransitionJob && !request.lifecyclePlan && !request.task && !request.mutationIntent
    && !request.profileFields?.length && !request.evidenceNeeds?.length && !request.projection
    && e?.scope.readOnlyRecall && e.scope.status === "resolved"
    && JSON.stringify(e.scope.authorizedPetIds)===JSON.stringify(request.storedRead?.subjectIds)
    ? verifiedStoredReadResult(e.storedReadResult, e.interpretation?.request?.storedRead) : null;
}
export function storedReadPresentationSupported(e: AskEvidenceContract | undefined) {
  return [undefined,null,"prose"].includes(e?.interpretation?.request?.outputFormat);
}
export function storedReadPublishedResult(e: AskEvidenceContract | undefined) {
  const r=storedReadResult(e);
  return r && storedReadPresentationSupported(e) && ["complete","complete_empty"].includes(r.status) ? r : null;
}
export function storedReadText(e: AskEvidenceContract | undefined) {
  if(!storedReadPresentationSupported(e))return STORED_READ_FORMAT_LIMITATION;
  const r=storedReadPublishedResult(e);
  if(!r)return STORED_READ_LIMITATION;
  return r.records.length ? r.records.map(row=>row.text).join("\n\n")
    : "No eligible saved memories were returned for the requested owned scope.";
}
export function storedReadSourceIds(e: AskEvidenceContract | undefined) {
  return storedReadPublishedResult(e)?.records.map(row=>row.sourceId) || [];
}
export function bindStoredReadEvidence(e: AskEvidenceContract, result: StoredReadResult) {
  if(!verifiedStoredReadResult(result,e.interpretation?.request?.storedRead))throw Error("STORED_READ_BINDING");
  e.storedReadResult=result;
}
export function carryStoredReadEvidence(source: AskEvidenceContract, target: AskEvidenceContract) {
  if(!storedReadResult(source) || JSON.stringify(source.interpretation?.request)!==JSON.stringify(target.interpretation?.request)
    || JSON.stringify(source.scope)!==JSON.stringify(target.scope))throw Error("STORED_READ_BINDING_CHANGED");
  carryStoredReadResult(source.storedReadResult,target.storedReadResult,target.interpretation?.request?.storedRead);
}
export function storedReadPublicationFailure(result: AskReasoningResult): string | null {
  const e=result.evidenceContract;
  if(!isStoredRead(e) || !storedReadResult(e))return "stored_read_authority_missing";
  const published=storedReadPublishedResult(e), ids=storedReadSourceIds(e);
  if(result.model!==(published?STORED_READ_LABS:STORED_READ_UNAVAILABLE)
    || result.answer.title!=="Furvise" || result.answer.summary!==storedReadText(e)
    || result.answer.sections.length || result.answer.safetyNote || result.suggestedFollowUps.length
    || JSON.stringify(result.relevantContextIds)!==JSON.stringify(ids)
    || result.referencedRecords?.length || result.labsList || result.profileFieldLabs || result.historyNarrative || result.historicalResult
    || result.applicationActions.length || result.careActions.length || result.semanticEvents.length || result.learnings.length
    || Object.entries(result.proposedHistoryUpdate).some(([k,v])=>k==="shouldOffer"?v!==false:v!==null)
    || e?.answerSourceIds?.some(id=>!ids.includes(id))
    || e?.answerContent?.some(text=>!published?.records.some(row=>row.text===text)))return "stored_read_publication_changed";
  return null;
}
