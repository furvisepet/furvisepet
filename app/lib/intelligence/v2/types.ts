import type {
  GroundedSemanticEvidence,
  ProposedSemanticClaim as SemanticFrameClaim,
  ProposedSemanticFrame,
  SemanticClaimKind,
  SemanticPersistenceHint,
} from "../semantic-frame/types.ts";

export type ProposedSemanticClaim = SemanticFrameClaim;

export type CanonicalSubjectType = "owner" | "pet" | "person" | "organization" | "product" | "place" | "unknown";
export type ResolvedSubject = {
  type: CanonicalSubjectType;
  id: string | null;
  sourceMentionId: string | null;
  resolution: "owned" | "external";
  confidence: number;
};

export type ResolvedEntity = {
  entityType: "owner" | "pet";
  entityId: string;
  sourceMentionId: string;
  confidence: number;
};

export type NormalizedTemporalSemantics = {
  occurredAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  precision: "exact" | "day" | "approximate" | "recurring" | "unknown";
};

export type ResolvedSemanticClaim = {
  sourceLocalClaimKey: string;
  proposed: ProposedSemanticClaim;
  subject: ResolvedSubject;
  resolvedEntities: ResolvedEntity[];
  groundedEvidence: GroundedSemanticEvidence[];
  temporal: NormalizedTemporalSemantics;
  extractionConfidence: number;
};

export type LifecycleRole =
  | "opening"
  | "continuation"
  | "worsening"
  | "improvement"
  | "resolution"
  | "recurrence"
  | "correction"
  | "dismissal"
  | "unknown";

export type LifecycleTransition =
  | "started"
  | "continued"
  | "changed"
  | "improved"
  | "worsened"
  | "resolved"
  | "recurred"
  | "dismissed"
  | "unknown";

export type ClaimOperation = "assert" | "retract" | "correct" | "supersede" | "confirm" | "forget" | "dismiss_lifecycle";
export type ClaimRelationType = "retracts" | "corrects" | "supersedes" | "confirms" | "derived_from" | "dismisses_lifecycle";
export type ConceptResolutionStatus = "provisional" | "canonical";
export type ConceptAuthority = "provisional_normalizer" | "governed_registry";

export type GovernedClaimRelation = {
  sourceLocalRelationKey: string;
  fromLocalClaimKey: string;
  toLocalClaimKey: string | null;
  toClaimId: string | null;
  relationType: ClaimRelationType;
  metadata: Record<string, unknown>;
};

export type GovernedSemanticClaim = ResolvedSemanticClaim & {
  conceptKey: string;
  canonicalConceptKey: string | null;
  conceptVersion: string;
  conceptResolutionStatus: ConceptResolutionStatus;
  conceptAuthority: ConceptAuthority;
  claimKind: SemanticClaimKind;
  operationType: ClaimOperation;
  structuredValue: unknown;
  unit: string | null;
  durability: "temporary" | "ongoing" | "durable" | "unknown";
  lifecycleRole: LifecycleRole | null;
  lifecycleTransition: LifecycleTransition | null;
  serverEpisodeId: string | null;
  governedConfidence: number;
  persistenceDestination: SemanticPersistenceHint;
  persistenceEligible: boolean;
  proposedPersistenceHint: SemanticPersistenceHint;
  persistencePolicyReasons: string[];
  persistencePermission: "shadow_only";
  provenanceClassification: "ask_v2_shadow";
  governanceMetadata: Record<string, unknown>;
  safetyFloorMetadata: SafetyFloorMetadata;
};

export type V2RejectionReason =
  | "FRAME_INVALID"
  | "CLAIM_KIND_INCONSISTENT"
  | "EVIDENCE_EMPTY_SURFACE"
  | "EVIDENCE_NOT_FOUND"
  | "EVIDENCE_AMBIGUOUS"
  | "ENTITY_AMBIGUOUS"
  | "ENTITY_UNRESOLVED"
  | "ENTITY_NOT_OWNED"
  | "REFERENCE_AMBIGUOUS"
  | "REFERENCE_UNRESOLVED"
  | "CONCEPT_INVALID"
  | "CLAIM_LOW_CONFIDENCE"
  | "TEMPORAL_INVALID"
  | "LIFECYCLE_INCOMPATIBLE"
  | "CORRECTION_TARGET_UNRESOLVED"
  | "PERSISTENCE_NOT_ALLOWED";

export type RejectedSemanticClaim = {
  sourceLocalClaimKey: string;
  proposed: ProposedSemanticClaim;
  reason: V2RejectionReason;
  stage: "evidence" | "entity" | "concept" | "confidence" | "temporal" | "lifecycle" | "permission";
  retryable: boolean;
};

export type SafetyFloorMetadata = {
  level: "routine" | "caution" | "urgent";
  reasonCodes: string[];
  policyVersion: string;
};

export type GovernedSemanticTurn = {
  frame: ProposedSemanticFrame;
  sourceMessageId: string;
  frameSchemaVersion: string;
  governancePolicyVersion: string;
  acceptedClaims: GovernedSemanticClaim[];
  rejectedClaims: RejectedSemanticClaim[];
  relations: GovernedClaimRelation[];
  needsClarification: boolean;
  safetyFloor: SafetyFloorMetadata;
  mode: "shadow_only";
};

/**
 * The model is allowed to produce only ProposedSemanticFrame/ProposedSemanticClaim.
 * Every field below is added by trusted deterministic application code.
 */
export type ServerOwnedClaimAuthority = {
  authenticatedUserId: string;
  ownedEntityIds: ReadonlySet<string>;
  canonicalConceptKey: string | null;
  conceptResolutionStatus: ConceptResolutionStatus;
  persistencePermission: "shadow_only";
  serverEpisodeId: string | null;
};

export type GovernedConceptIdentity = {
  key: string;
  version: string;
  conceptKind?: "symptom" | "safety" | "nutrition" | "medication" | "preference" | "profile" | "relationship" | "care_fact";
  lifecycleCapable?: boolean;
};

export type GovernedEpisodeConceptIdentity = GovernedConceptIdentity & {
  episodeId: string;
  status: "canonical";
};

export type PreviousClaimTarget = {
  claimId: string;
  subjectId: string | null;
  conceptKey: string;
};
