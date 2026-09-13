import type { GroundedSemanticEvidence, ProposedSemanticFrame, SemanticEvidence } from "./types.ts";

export type SemanticEvidenceValidation = {
  valid: boolean;
  invalidClaimIds: string[];
  invalidMentionIds: string[];
};

export function validateSemanticFrameEvidence(frame: ProposedSemanticFrame, sourceMessage: string): SemanticEvidenceValidation {
  const invalidMentionIds = frame.mentions.filter((mention) => !mention.evidence.length || !mention.evidence.every((span) => validSpan(span, sourceMessage))).map((mention) => mention.localId);
  const invalidClaimIds = frame.claims.filter((claim) => !claim.evidence.length || !claim.evidence.every((span) => validSpan(span, sourceMessage))).map((claim) => claim.localId);
  return { valid: invalidMentionIds.length === 0 && invalidClaimIds.length === 0, invalidClaimIds, invalidMentionIds };
}

function validSpan(span: SemanticEvidence, source: string): span is GroundedSemanticEvidence {
  if (!("start" in span) || !("end" in span) || !("quote" in span) || !("alignment" in span)) return false;
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > source.length) return false;
  return source.slice(span.start, span.end) === span.quote && Boolean(span.surfaceText.trim());
}
