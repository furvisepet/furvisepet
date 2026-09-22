import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";
import { labsPresentation, type LabsPresentation } from "./labs-presentation.ts";
import { PROFILE_FIELD_DEFINITIONS, profileFieldProjection, profileFieldSentence, profileFieldValue,
  carryProfileFieldProjection, type ProfileFieldProjection } from "./profile-field-authority.ts";
export type ProfileFieldLabs = { projection: ProfileFieldProjection; presentation: LabsPresentation };
const inline = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replace(/[\\`*_{}\[\]()#+|~]/g, "\\$&").replace(/\r?\n/g, " ");
export function buildProfileFieldLabs(e: AskEvidenceContract | undefined): ProfileFieldLabs | null {
  const projection = profileFieldProjection(e);
  return projection ? { projection, presentation: labsPresentation(e?.interpretation?.request?.outputFormat) } : null;
}
export function profileFieldSourceIds(labs: ProfileFieldLabs): string[] {
  return labs.projection.fields.filter(f => f.state !== "unavailable").map(f => f.sourceId);
}
export function serializeProfileFieldLabs(labs: ProfileFieldLabs): string {
  const p = labs.projection;
  if (labs.presentation === "table") return ["| Pet | Saved profile field | Saved value |", "| --- | --- | --- |",
    ...p.fields.map(f => `| ${inline(p.petNames[f.subjectId])} | ${inline(PROFILE_FIELD_DEFINITIONS[f.fieldSelector].label)} | ${inline(profileFieldValue(f))} |`)].join("\n");
  return p.fields.map(f => (labs.presentation === "list" ? "- " : "")
    + inline(profileFieldSentence(f, p.petNames[f.subjectId]))).join(labs.presentation === "prose" ? "\n\n" : "\n");
}
export function profileFieldLabsReviewFailure(result: AskReasoningResult): string | null {
  const labs = result.profileFieldLabs, e = result.evidenceContract;
  if (!labs || !e) return "profile_labs_missing";
  let projection: ProfileFieldProjection | null;
  try { projection = profileFieldProjection(e); } catch { return "profile_labs_snapshot_changed"; }
  if (!projection || labs.projection !== projection
    || labs.presentation !== labsPresentation(e.interpretation?.request?.outputFormat)) return "profile_labs_snapshot_changed";
  if (result.applicationActions.length || result.careActions.length || result.semanticEvents.length || result.learnings.length
    || result.proposedHistoryUpdate.shouldOffer) return "profile_labs_has_write";
  if (result.safetyLevel === "urgent" || result.responseMode === "grief_support") return "profile_labs_safety_path";
  if (result.answer.title !== "Furvise" || result.answer.summary !== serializeProfileFieldLabs(labs)
    || result.answer.sections.length || result.answer.safetyNote || result.suggestedFollowUps.length
    || JSON.stringify(result.relevantContextIds) !== JSON.stringify(profileFieldSourceIds(labs))
    || result.historyNarrative || result.historicalResult) return "profile_labs_changed";
  return null;
}
export function carryProfileFieldLabs(source: AskReasoningResult, target: AskReasoningResult) {
  if (profileFieldLabsReviewFailure(source) || !source.evidenceContract || !target.evidenceContract)
    throw Error("ASK_PROFILE_LABS_CLONE_CHANGED");
  carryProfileFieldProjection(source.evidenceContract, target.evidenceContract);
  if (profileFieldLabsReviewFailure(target)) throw Error("ASK_PROFILE_LABS_CLONE_CHANGED");
}
