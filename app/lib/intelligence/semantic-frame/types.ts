export const SEMANTIC_FRAME_SCHEMA_VERSION = "furvise.semantic-frame.proposed.v1" as const;

export type SemanticDiscourseAct = "statement" | "question" | "request" | "acknowledgement" | "correction" | "retraction";
export type SemanticClaimKind = "assertion" | "event" | "state_transition" | "preference" | "relationship" | "correction";
export type SemanticEntityType = "animal" | "person" | "organization" | "product" | "place" | "unknown";
export type SemanticPersistenceHint = "history" | "current_state" | "pet_memory" | "owner_memory" | "profile" | "relationship" | "none";
export type SemanticLiteral = string | number | boolean | null;

export type SemanticEvidenceSpan = {
  start: number;
  end: number;
  quote: string;
};

export type SemanticTemporalContext = {
  occurredAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  surfaceText: string | null;
  precision: "exact" | "day" | "approximate" | "recurring" | "unknown";
};

export type SemanticUncertainty = {
  confidence: number;
  reasons: string[];
};

export type ProposedEntityMention = {
  localId: string;
  surface: string;
  coarseType: SemanticEntityType;
  attributes: {
    species: string | null;
    lifeStage: string | null;
    ownership: "owner" | "household" | "other" | "unknown";
  };
  evidence: SemanticEvidenceSpan[];
  confidence: number;
};

export type ProposedReference = {
  localId: string;
  surface: string;
  kind: "name" | "pronoun" | "description" | "ellipsis" | "prior_topic";
  mentionRef: string;
  antecedentRefs: string[];
  confidence: number;
};

export type ProposedConcept = {
  label: string;
  definition: string | null;
};

type ProposedClaimBase = {
  localId: string;
  kind: SemanticClaimKind;
  subjectRef: string | null;
  predicate: ProposedConcept;
  polarity: "affirmed" | "negated";
  modality: "asserted" | "reported" | "suspected" | "hypothetical";
  temporal: SemanticTemporalContext;
  uncertainty: SemanticUncertainty;
  evidence: SemanticEvidenceSpan[];
  persistenceHint: SemanticPersistenceHint;
};

export type ProposedAssertionClaim = ProposedClaimBase & {
  kind: "assertion";
  value: SemanticLiteral | SemanticLiteral[];
  unit: string | null;
  durability: "temporary" | "ongoing" | "durable" | "unknown";
};

export type ProposedEventClaim = ProposedClaimBase & {
  kind: "event";
  participants: Array<{ role: string; entityRef: string }>;
  lifecycle: {
    phase: "observed" | "started" | "continued" | "completed" | "resolved" | "unknown";
    boundedInMessage: boolean;
    resultingState: "active" | "monitoring" | "resolved" | "historical" | "unknown";
  };
};

export type ProposedStateTransitionClaim = ProposedClaimBase & {
  kind: "state_transition";
  transition: "started" | "continued" | "changed" | "improved" | "worsened" | "resolved" | "recurred" | "unknown";
  fromState: string | null;
  toState: string;
  targetConcept: ProposedConcept;
};

export type ProposedPreferenceClaim = ProposedClaimBase & {
  kind: "preference";
  preference: "prefer" | "avoid" | "require" | "limit";
  object: { concept: ProposedConcept; value: SemanticLiteral };
  constraints: Array<{ dimension: string; operator: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "contains"; value: SemanticLiteral; unit: string | null; period: string | null }>;
};

export type ProposedRelationshipClaim = ProposedClaimBase & {
  kind: "relationship";
  objectRef: string;
  qualifiers: Array<{ key: string; value: SemanticLiteral }>;
};

export type ProposedCorrectionClaim = ProposedClaimBase & {
  kind: "correction";
  operation: "replace" | "retract" | "negate" | "forget" | "confirm";
  target: {
    claimRef: string | null;
    subjectRef: string | null;
    predicate: ProposedConcept | null;
    value: SemanticLiteral | null;
  };
  replacementClaimRef: string | null;
};

export type ProposedSemanticClaim =
  | ProposedAssertionClaim
  | ProposedEventClaim
  | ProposedStateTransitionClaim
  | ProposedPreferenceClaim
  | ProposedRelationshipClaim
  | ProposedCorrectionClaim;

export type ProposedSemanticFrame = {
  schemaVersion: typeof SEMANTIC_FRAME_SCHEMA_VERSION;
  frameLocalId: string;
  discourseActs: Array<{ kind: SemanticDiscourseAct; confidence: number }>;
  mentions: ProposedEntityMention[];
  references: ProposedReference[];
  claims: ProposedSemanticClaim[];
  uncertainty: {
    needsClarification: boolean;
    clarificationQuestion: string | null;
    reasons: string[];
  };
};
