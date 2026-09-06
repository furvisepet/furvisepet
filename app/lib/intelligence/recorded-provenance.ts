import { createHash } from "node:crypto";
import { analyzeOwnerAssertions, isOwnerCertainEvidence } from "../ai/owner-assertion.ts";
import { isPetObservationEvidence } from "../ai/recovery-subject.ts";
import { concernAliases } from "../ai/concern-symptoms.ts";
import type { CanonicalEvent } from "./types.ts";
import type { EpisodeSource, Membership } from "./episode-membership.ts";

export const recordedHash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
export type RecordedWriterEvidence = {
  version: "ask-governed-source.v1";
  sourceHash: string; noteHash: string; petId: string; topic: string;
  inventoryTopic: string;
  transition: string; priorEpisodeId: string | null;
};

/** Called only after current semantic-event governance. The source assertion
 * checks are deliberately conservative; unrecognized discourse remains unknown.
 * This records a governed writer decision, never a claim of language completeness. */
export function recordedWriterEvidence(event: CanonicalEvent, message: string, petName: string | null): RecordedWriterEvidence | undefined {
  const analysis = analyzeOwnerAssertions(message);
  // Reuse the existing topic evidence vocabulary, never the generated title.
  // Multiple recognized topics cannot certify an outside-scope exclusion.
  const topics = concernAliases.filter(([, evidence]) => evidence.test(event.sourceExcerpt));
  if (event.subject.type !== "pet" || !event.subject.id || !petName
    || event.domain !== "health" || topics.length !== 1 || !topics[0][0].test(event.normalizedTopic)
    || event.state === "unknown" || analysis.hasExplicitCorrection
    || !isOwnerCertainEvidence(message, event.sourceExcerpt)
    || !isPetObservationEvidence(message, event.sourceExcerpt, petName)
    || analysis.clauseSpans.some(s => s.isNegated || s.isUncertain || s.isConditional || s.isAttributed || s.isQuestion)
    || !["started", "continued", "observed", "confirmed"].includes(event.transition)) return;
  // A model's 'started' label or the first persisted membership is insufficient.
  // Require the explicit transition verb to introduce the recognized symptom,
  // not another activity ("started eating after vomiting"). Surrounding prose
  // is unrestricted by any whole-note template.
  // Other expressions remain unknown; this is not a universal language parser.
  if (["started", "continued"].includes(event.transition)) {
    const verb = new RegExp(`\\b${event.transition}\\b\\s+`, "i").exec(event.sourceExcerpt);
    if (!verb || topics[0][1].exec(event.sourceExcerpt.slice(verb.index + verb[0].length))?.index !== 0) return;
  }
  return { version: "ask-governed-source.v1", sourceHash: recordedHash(message),
    noteHash: recordedHash(event.sourceExcerpt), petId: event.subject.id,
    inventoryTopic: ["vomiting", "soft_stool", "breathing"].find(topic => topics[0][0].test(topic)) || "outside_supported_topics",
    topic: event.normalizedTopic, transition: event.transition, priorEpisodeId: event.references.episodeId };
}

export type RecordedSourceProvenance = RecordedWriterEvidence & {
  ownerId: string; careId: string; episodeId: string; membershipId: string;
  role: "opening" | "continuation" | "unknown";
};

/** SQL supplies this only when the message, care row and membership still match
 * their writer snapshots. Do not infer it from metadata or an imported role. */
export function governedRecordedRole(source: EpisodeSource, topic: string, members: Membership[]) {
  const m = members.find(m => !source.claim && m.care_entry_id === source.id);
  const p = m?.recorded_provenance;
  if (!m || !p || m.source_issue !== null || source.claim || source.deleted_at
    || p.version !== "ask-governed-source.v1" || p.ownerId !== source.user_id
    || p.petId !== source.pet_profile_id || p.careId !== source.id || p.episodeId !== source.episode_id
    || p.membershipId !== m.id || p.noteHash !== recordedHash(source.note)
    || !/^[a-f0-9]{64}$/.test(p.sourceHash) || p.inventoryTopic !== topic.replaceAll(" ", "_")
    || !concernAliases.some(([target]) => target.test(p.topic) && target.test(p.inventoryTopic))
    || p.role !== m.event_role) return null;
  if (p.role === "opening" && p.transition === "started" && p.priorEpisodeId === null) return "opening";
  if (p.role === "continuation" && p.transition === "continued" && p.priorEpisodeId === source.episode_id) return "continuation";
  return null;
}
