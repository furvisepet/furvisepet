import { SEMANTIC_FRAME_SCHEMA_VERSION, type ProposedSemanticFrame } from "./types.ts";

const localIdPattern = /^[a-z][a-z0-9_]{0,39}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractProposedSemanticFrame(value: unknown): ProposedSemanticFrame | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const frame = value as ProposedSemanticFrame;
  if (frame.schemaVersion !== SEMANTIC_FRAME_SCHEMA_VERSION || !isLocalId(frame.frameLocalId)) return null;
  if (!Array.isArray(frame.discourseActs) || !Array.isArray(frame.mentions) || !Array.isArray(frame.references) || !Array.isArray(frame.claims)) return null;
  if (!frame.uncertainty || typeof frame.uncertainty.needsClarification !== "boolean") return null;
  if (frame.mentions.length > 12 || frame.references.length > 12 || frame.claims.length > 12) return null;

  const mentionIds = new Set<string>();
  for (const mention of frame.mentions) {
    if (!isLocalId(mention.localId) || mentionIds.has(mention.localId) || !boundedConfidence(mention.confidence)) return null;
    if (typeof mention.surface !== "string" || !mention.surface.trim() || mention.surface.length > 120 || !Array.isArray(mention.evidence)) return null;
    mentionIds.add(mention.localId);
  }
  const claimIds = new Set<string>();
  for (const claim of frame.claims) {
    if (!isLocalId(claim.localId) || claimIds.has(claim.localId) || (claim.subjectRef !== null && !mentionIds.has(claim.subjectRef))) return null;
    if (!claim.predicate || typeof claim.predicate.label !== "string" || !claim.predicate.label.trim() || !boundedConfidence(claim.uncertainty?.confidence)) return null;
    if (!Array.isArray(claim.evidence)) return null;
    if (claim.kind === "event" && claim.participants.some((participant) => !mentionIds.has(participant.entityRef))) return null;
    if (claim.kind === "relationship" && !mentionIds.has(claim.objectRef)) return null;
    claimIds.add(claim.localId);
  }
  for (const claim of frame.claims) {
    if (claim.kind !== "correction") continue;
    if (claim.target.claimRef && !claimIds.has(claim.target.claimRef)) return null;
    if (claim.target.subjectRef && !mentionIds.has(claim.target.subjectRef)) return null;
    if (claim.replacementClaimRef && !claimIds.has(claim.replacementClaimRef)) return null;
  }
  const referenceIds = new Set<string>();
  for (const reference of frame.references) {
    if (!isLocalId(reference.localId) || referenceIds.has(reference.localId) || !mentionIds.has(reference.mentionRef) || !boundedConfidence(reference.confidence)) return null;
    if (!reference.antecedentRefs.every((id) => mentionIds.has(id))) return null;
    referenceIds.add(reference.localId);
  }
  return frame;
}

export function emptyProposedSemanticFrame(): ProposedSemanticFrame {
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION,
    frameLocalId: "frame_1",
    discourseActs: [], mentions: [], references: [], claims: [],
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}

function isLocalId(value: unknown) {
  return typeof value === "string" && localIdPattern.test(value) && !uuidPattern.test(value);
}

function boundedConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
