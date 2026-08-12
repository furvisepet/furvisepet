import type { SemanticPersistenceHint } from "../../semantic-frame/types.ts";
import type { ClaimOperation, CanonicalSubjectType, LifecycleRole, NormalizedTemporalSemantics, SafetyFloorMetadata } from "../types.ts";

export type V2PersistenceDecision = {
  eligible: boolean;
  destination: SemanticPersistenceHint;
  reasons: string[];
};

/** Model persistenceHint is intentionally absent: this policy is wholly server-owned. */
export function decidePersistenceV2(input: {
  subjectType: CanonicalSubjectType;
  claimKind: "assertion" | "event" | "state_transition" | "preference" | "relationship" | "correction";
  operation: ClaimOperation;
  durability: "temporary" | "ongoing" | "durable" | "unknown";
  temporal: NormalizedTemporalSemantics;
  lifecycleRole: LifecycleRole | null;
  governedConfidence: number;
  modality: "asserted" | "reported" | "suspected" | "hypothetical";
  correctionTargetResolved: boolean;
  safetyFloor: SafetyFloorMetadata;
}): V2PersistenceDecision {
  if (input.governedConfidence < 0.8) return denied("below_governed_confidence_floor");
  if (input.modality === "hypothetical" || input.modality === "suspected") return denied("non_assertive_modality");
  if (input.subjectType === "unknown" || input.subjectType === "organization" || input.subjectType === "product" || input.subjectType === "place") {
    return denied("unsupported_subject_type");
  }
  if (input.claimKind === "correction") {
    if (!input.correctionTargetResolved) return denied("correction_target_unresolved");
    return allowed(input.subjectType === "owner" ? "owner_memory" : "pet_memory", "governed_operation");
  }
  if (input.claimKind === "event" || input.claimKind === "state_transition") {
    if (input.subjectType !== "pet") return denied("lifecycle_requires_owned_pet");
    return allowed("history", input.lifecycleRole ? "governed_lifecycle_event" : "governed_event");
  }
  if (input.safetyFloor.level === "urgent") return denied("urgent_safety_restricts_nonclinical_persistence");
  if (input.claimKind === "relationship") return allowed("relationship", "owned_entity_relationship");
  if (input.claimKind === "preference") {
    return allowed(input.subjectType === "owner" ? "owner_memory" : "pet_memory", "durable_preference_semantics");
  }
  if (input.claimKind === "assertion" && (input.durability === "ongoing" || input.durability === "durable")) {
    return allowed(input.subjectType === "owner" ? "owner_memory" : "pet_memory", "durable_assertion");
  }
  if (input.claimKind === "assertion" && input.subjectType === "pet" && input.durability === "temporary"
    && !input.temporal.validTo) return allowed("current_state", "temporary_current_pet_state");
  return denied("semantics_do_not_authorize_persistence");
}

function allowed(destination: Exclude<SemanticPersistenceHint, "none">, reason: string): V2PersistenceDecision {
  return { eligible: true, destination, reasons: [reason] };
}
function denied(reason: string): V2PersistenceDecision {
  return { eligible: false, destination: "none", reasons: [reason] };
}
