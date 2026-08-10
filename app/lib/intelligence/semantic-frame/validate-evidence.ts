import type { ProposedSemanticFrame, SemanticEvidenceSpan } from "./types.ts";

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

function validSpan(span: SemanticEvidenceSpan, source: string) {
  if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > source.length) return false;
  return normalize(source.slice(span.start, span.end)) === normalize(span.quote);
}

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}
