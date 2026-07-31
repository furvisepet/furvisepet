import type { IntelligenceCareAction, IntelligenceLearning } from "../types.ts";
export type ProfileChangeProposal = { field: string; value: unknown; confidence: number; sourceExcerpt: string };
export type StateEffectProposal = { domain: string; value: string; confidence: number; sourceExcerpt: string };
export type GovernanceReason = "unsupported_evidence" | "low_confidence" | "wrong_pet" | "unsupported_diagnosis" | "protected_field" | "duplicate" | "invalid_transition";
export type GovernanceDecision<T> = { proposal: T; decision: "accepted" | "rejected" | "deferred"; reason: GovernanceReason | null };
export type GovernanceResult = { careActions: GovernanceDecision<IntelligenceCareAction>[]; memories: GovernanceDecision<IntelligenceLearning>[]; stateEffects: GovernanceDecision<StateEffectProposal>[]; profileChanges: GovernanceDecision<ProfileChangeProposal>[] };
