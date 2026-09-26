import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";

/** Typed dependency, never an interpretation of the user's words. */
export function dependsOnStoredState(e: AskEvidenceContract | undefined): boolean {
  const r = e?.interpretation?.request;
  if (r) {
    const suppliedPremiseCalculation = r.evidenceBasis === "supplied_context" && !!r.calculatePlan
      && !r.readTicket && !r.storedRead && !r.profileFields?.length && !r.evidenceNeeds?.length;
    if (suppliedPremiseCalculation) return false;
    return ["saved_history", "saved_profile", "stored"].includes(r.evidenceBasis || "")
      || !!r.calculatePlan || !!r.readTicket || !!r.storedRead || !!r.profileFields?.length || !!r.evidenceNeeds?.length;
  }
  return !!(e?.history || e?.historyFallback || e?.episodes || e?.recordInventory?.length);
}
export const FACTUAL_UNAVAILABLE = "server-factual-unavailable";
export const FACTUAL_LIMITATION = "The requested saved-information result is not available through certified publication. This does not establish that the information is absent.";
export function factualLimitationFailure(result: AskReasoningResult): string | null {
  const e = result.evidenceContract;
  if (!dependsOnStoredState(e) || result.model !== FACTUAL_UNAVAILABLE
    || result.answer.title !== "Furvise" || result.answer.summary !== FACTUAL_LIMITATION
    || result.answer.sections.length || result.answer.safetyNote || result.suggestedFollowUps.length
    || result.calculationLabs || result.profileFieldLabs || result.labsList || result.historyNarrative || result.historicalResult
    || result.historySynthesis?.length || result.relevantContextIds.length || result.referencedRecords?.length
    || result.applicationActions.length || result.careActions.length || result.semanticEvents.length || result.learnings.length
    || Object.entries(result.proposedHistoryUpdate).some(([key,value]) => key === "shouldOffer" ? value !== false : value !== null)
    || e?.answerSourceIds?.length || e?.answerContent?.length) return "factual_limitation_changed";
  return null;
}

/** Server evidence for general language contains USER premises, never stored facts.
 * Canonical request metadata stays server-side for governance; provider transport
 * uses the smaller whitelist below. */
export function languageOnlyEvidence(e: AskEvidenceContract): AskEvidenceContract {
  if (dependsOnStoredState(e)) throw Error("STORED_STATE_CANNOT_ENTER_LANGUAGE_GENERATION");
  return { version:e.version, scope:{...e.scope}, interpretation:e.interpretation,
    ...(e.timeZone ? {timeZone:e.timeZone} : {}), ...(e.petNames ? {petNames:{...e.petNames}} : {}),
    ...(e.completedOwnerNote ? {completedOwnerNote:e.completedOwnerNote} : {}),
    sources:[],represented:[],losses:[],verifiedFacts:[],representation:"complete",
    completeness:{retrieval:"unknown",corrections:"unknown",extraction:"unknown",grouping:"unknown"} };
}
export function languageProviderContext(original: object) {
  const p = original as {evidenceContract?: AskEvidenceContract; currentMessage?:string; currentTimestamp?:string;
    locale?:string;timeZone?:string;minimumSafetyLevel?:string;answerEconomy?:unknown;productFacts?:unknown;
    pets?:Array<{id:string;name:string|null}>;dialogueContext?:{turns?:Array<{role:string;text:string}>};
    repairInstruction?:string;eventEvidenceRepairInstruction?:string;recoveryRepairInstruction?:string;
    rejectedEventEvidence?:unknown;rejectedRecoveryEvidence?:unknown;discourseFocus?:unknown};
  if(dependsOnStoredState(p.evidenceContract))throw Error("STORED_STATE_CANNOT_ENTER_LANGUAGE_GENERATION");
  const r=p.evidenceContract?.interpretation?.request;
  return {currentMessage:p.currentMessage || p.evidenceContract?.scope.requestText,
    currentTimestamp:p.currentTimestamp,locale:p.locale,timeZone:p.timeZone,
    minimumSafetyLevel:p.minimumSafetyLevel,answerEconomy:p.answerEconomy,productFacts:p.productFacts,
    pets:p.pets?.map(({id,name})=>({id,name})),discourseFocus:p.discourseFocus,
    userPremises:p.dialogueContext?.turns?.filter(t=>t.role==="user").map(t=>({text:t.text})) || [],
    request:r ? {mode:r.mode,evidenceBasis:r.evidenceBasis,outputFormat:r.outputFormat,requirements:r.requirements}:undefined,
    repairInstruction:p.repairInstruction,eventEvidenceRepairInstruction:p.eventEvidenceRepairInstruction,
    recoveryRepairInstruction:p.recoveryRepairInstruction,rejectedEventEvidence:p.rejectedEventEvidence,
    rejectedRecoveryEvidence:p.rejectedRecoveryEvidence,
    authority:"Current USER assertions and supplied premises only. No saved-state evidence or write-success authority."};
}
