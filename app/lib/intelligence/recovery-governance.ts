import type { CareEpisode } from "./episodes/types.ts";
import { alignEvidenceFragments } from "./semantic-frame/ground-evidence.ts";
import type { CanonicalEventProposal } from "./types.ts";

export const EFFECTIVE_RECOVERY_RESOLUTION_THRESHOLD = 0.92;

export type RecoveryGovernanceReason =
  | "RECOVERY_PROMOTED"
  | "RECOVERY_NOT_CANDIDATE"
  | "RECOVERY_SUBJECT_UNRESOLVED"
  | "RECOVERY_EVIDENCE_UNGROUNDED"
  | "RECOVERY_TERMINAL_SEMANTICS_MISSING"
  | "RECOVERY_EPISODE_MISSING"
  | "RECOVERY_EPISODE_AMBIGUOUS"
  | "RECOVERY_LIFECYCLE_MATCH_WEAK"
  | "RECOVERY_CURRENT_SAFETY_BLOCKED"
  | "RECOVERY_CONTRADICTED"
  | "RECOVERY_EXTRACTION_CONFIDENCE_LOW"
  | "RECOVERY_EFFECTIVE_CONFIDENCE_LOW";

export type EffectiveRecoveryAssessment = {
  candidate: boolean;
  promoted: boolean;
  effectiveConfidence: number;
  threshold: number;
  reasons: RecoveryGovernanceReason[];
  model: { status: "none" | "partial" | "terminal" | "uncertain"; confidence: number; terminalSupport: number };
  evidence: { grounded: boolean; score: number };
  subject: { authoritative: boolean; score: number };
  lifecycle: { compatibleCandidateCount: number; unique: boolean; matchScore: number };
  terminalSemantics: {
    grounded: boolean;
    score: number;
    source: "recovery_evidence" | "semantic_event" | "none";
    outcome: "return_to_baseline" | "symptom_absent" | "problem_ended" | "partial_improvement" | "uncertain" | "none";
    targetMatched: boolean;
  };
  contradiction: { absent: boolean };
  safety: { allowed: boolean };
};

export function deriveEffectiveRecoveryAssessment(input: {
  proposal: CanonicalEventProposal;
  proposals: CanonicalEventProposal[];
  message: string;
  modelRecovery?: {
    status: "none" | "partial" | "terminal" | "uncertain";
    confidence: number;
    evidence?: {
      outcome: "return_to_baseline" | "symptom_absent" | "problem_ended" | "partial_improvement" | "uncertain" | "none";
      surfaceText: string | null;
      targetConcept: string | null;
      confidence: number;
    };
  };
  subjectConfidence: number;
  compatibleEpisodes: Array<{ episode: CareEpisode; score: number }>;
  safetyAllowsResolution: boolean;
}): EffectiveRecoveryAssessment {
  const candidate = input.proposal.transition === "improved" && input.proposal.state === "monitoring"
    || input.proposal.transition === "improved" && input.proposal.state === "resolved"
    || input.proposal.transition === "resolved" && input.proposal.state === "resolved";
  const model = input.modelRecovery || { status: "none" as const, confidence: 0 };
  const authoritativeSubject = input.subjectConfidence >= 0.84;
  const modelTerminalSupport = model.status === "terminal" ? model.confidence : 0;
  const evidenceGrounded = uniquelyGrounded(input.proposal.sourceExcerpt, input.message);
  const lifecycle = {
    compatibleCandidateCount: input.compatibleEpisodes.length,
    unique: input.compatibleEpisodes.length === 1,
    matchScore: input.compatibleEpisodes.length === 1 ? input.compatibleEpisodes[0].score : 0,
  };
  const recoveryEvidenceGrounded = Boolean(model.evidence?.surfaceText && uniquelyGrounded(model.evidence.surfaceText, input.message));
  const recoveryEvidenceTerminal = ["return_to_baseline", "symptom_absent", "problem_ended"].includes(model.evidence?.outcome || "none");
  const recoveryTargetMatched = sameConceptIdentity(model.evidence?.targetConcept, input.proposal.topic);
  const recoveryEvidenceScore = recoveryEvidenceGrounded && recoveryEvidenceTerminal && recoveryTargetMatched ? model.evidence?.confidence || 0 : 0;
  const eventTerminalScore = !input.modelRecovery && input.proposal.transition === "resolved" && input.proposal.state === "resolved" && evidenceGrounded
    ? input.proposal.confidence : 0;
  const terminalSemanticsScore = Math.max(recoveryEvidenceScore, eventTerminalScore);
  const terminalSemanticsSource = recoveryEvidenceScore >= eventTerminalScore && recoveryEvidenceScore > 0
    ? "recovery_evidence" as const
    : eventTerminalScore > 0 ? "semantic_event" as const : "none" as const;
  const contradictionAbsent = !hasContradictoryLifecycleProposal(input.proposal, input.proposals);
  const effectiveConfidence = roundConfidence(
    0.15 * input.proposal.confidence
    + 0.20 * Number(evidenceGrounded)
    + 0.15 * input.subjectConfidence
    + 0.20 * lifecycle.matchScore
    + 0.25 * terminalSemanticsScore
    + 0.05 * modelTerminalSupport,
  );
  const reasons: RecoveryGovernanceReason[] = [];
  if (!candidate) reasons.push("RECOVERY_NOT_CANDIDATE");
  if (!authoritativeSubject) reasons.push("RECOVERY_SUBJECT_UNRESOLVED");
  if (!evidenceGrounded) reasons.push("RECOVERY_EVIDENCE_UNGROUNDED");
  if (terminalSemanticsScore < 0.9) reasons.push("RECOVERY_TERMINAL_SEMANTICS_MISSING");
  if (lifecycle.compatibleCandidateCount === 0) reasons.push("RECOVERY_EPISODE_MISSING");
  else if (!lifecycle.unique) reasons.push("RECOVERY_EPISODE_AMBIGUOUS");
  if (lifecycle.unique && lifecycle.matchScore < 0.92) reasons.push("RECOVERY_LIFECYCLE_MATCH_WEAK");
  if (!input.safetyAllowsResolution) reasons.push("RECOVERY_CURRENT_SAFETY_BLOCKED");
  if (!contradictionAbsent) reasons.push("RECOVERY_CONTRADICTED");
  if (input.proposal.confidence < 0.8) reasons.push("RECOVERY_EXTRACTION_CONFIDENCE_LOW");
  if (effectiveConfidence < EFFECTIVE_RECOVERY_RESOLUTION_THRESHOLD) reasons.push("RECOVERY_EFFECTIVE_CONFIDENCE_LOW");
  const promoted = reasons.length === 0;
  return {
    candidate,
    promoted,
    effectiveConfidence,
    threshold: EFFECTIVE_RECOVERY_RESOLUTION_THRESHOLD,
    reasons: promoted ? ["RECOVERY_PROMOTED"] : reasons,
    model: { ...model, terminalSupport: modelTerminalSupport },
    evidence: { grounded: evidenceGrounded, score: Number(evidenceGrounded) },
    subject: { authoritative: authoritativeSubject, score: roundConfidence(input.subjectConfidence) },
    lifecycle,
    terminalSemantics: {
      grounded: terminalSemanticsScore > 0,
      score: roundConfidence(terminalSemanticsScore),
      source: terminalSemanticsSource,
      outcome: model.evidence?.outcome || "none",
      targetMatched: recoveryTargetMatched,
    },
    contradiction: { absent: contradictionAbsent },
    safety: { allowed: input.safetyAllowsResolution },
  };
}

function hasContradictoryLifecycleProposal(candidate: CanonicalEventProposal, proposals: CanonicalEventProposal[]) {
  return proposals.some((proposal) => proposal !== candidate
    && proposal.subject.type === candidate.subject.type
    && proposal.domain === candidate.domain
    && normalized(proposal.topic) === normalized(candidate.topic)
    && (proposal.transition === "worsened" || proposal.transition === "continued" || proposal.state === "active"));
}

function uniquelyGrounded(surfaceText: string, message: string) {
  const result = alignEvidenceFragments([{ surfaceText }], message);
  return Boolean(result.grounded[0]) && result.failures.length === 0;
}

function normalized(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

function sameConceptIdentity(left: string | null | undefined, right: string) {
  if (!left) return false;
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  if (normalizedLeft === normalizedRight) return true;
  return lexicalSignature(normalizedLeft) === lexicalSignature(normalizedRight);
}

function lexicalSignature(value: string) {
  return [...new Set(value.split("_").filter(Boolean))].sort().join("|");
}

function roundConfidence(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}
