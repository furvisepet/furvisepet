import { SEMANTIC_FRAME_SCHEMA_VERSION } from "./types.ts";

const nullableString = (maxLength: number) => ({ anyOf: [{ type: "string", maxLength }, { type: "null" }] });
const confidence = { type: "number", minimum: 0, maximum: 1 } as const;
const localId = { type: "string", pattern: "^[a-z][a-z0-9_]{0,39}$" } as const;
const literal = { anyOf: [{ type: "string", maxLength: 300 }, { type: "number" }, { type: "boolean" }, { type: "null" }] } as const;
const evidence = {
  type: "array", maxItems: 4, items: {
    type: "object", additionalProperties: false, required: ["start", "end", "quote"],
    properties: { start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 0 }, quote: { type: "string", minLength: 1, maxLength: 240 } },
  },
} as const;
const concept = {
  type: "object", additionalProperties: false, required: ["label", "definition"],
  properties: { label: { type: "string", minLength: 2, maxLength: 100 }, definition: nullableString(240) },
} as const;
const temporal = {
  type: "object", additionalProperties: false,
  required: ["occurredAt", "validFrom", "validTo", "surfaceText", "precision"],
  properties: {
    occurredAt: nullableString(40), validFrom: nullableString(40), validTo: nullableString(40), surfaceText: nullableString(120),
    precision: { type: "string", enum: ["exact", "day", "approximate", "recurring", "unknown"] },
  },
} as const;
const uncertainty = {
  type: "object", additionalProperties: false, required: ["confidence", "reasons"],
  properties: { confidence, reasons: { type: "array", maxItems: 4, items: { type: "string", maxLength: 100 } } },
} as const;
const commonProperties = {
  localId,
  subjectRef: { anyOf: [localId, { type: "null" }] },
  predicate: concept,
  polarity: { type: "string", enum: ["affirmed", "negated"] },
  modality: { type: "string", enum: ["asserted", "reported", "suspected", "hypothetical"] },
  temporal,
  uncertainty,
  evidence,
  persistenceHint: { type: "string", enum: ["history", "current_state", "pet_memory", "owner_memory", "profile", "relationship", "none"] },
} as const;
const commonRequired = ["localId", "kind", "subjectRef", "predicate", "polarity", "modality", "temporal", "uncertainty", "evidence", "persistenceHint"] as const;

const assertionClaim = {
  type: "object", additionalProperties: false, required: [...commonRequired, "value", "unit", "durability"],
  properties: {
    ...commonProperties, kind: { type: "string", enum: ["assertion"] },
    value: { anyOf: [literal, { type: "array", maxItems: 12, items: literal }] }, unit: nullableString(40),
    durability: { type: "string", enum: ["temporary", "ongoing", "durable", "unknown"] },
  },
} as const;
const eventClaim = {
  type: "object", additionalProperties: false, required: [...commonRequired, "participants", "lifecycle"],
  properties: {
    ...commonProperties, kind: { type: "string", enum: ["event"] },
    participants: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["role", "entityRef"], properties: { role: { type: "string", maxLength: 60 }, entityRef: localId } } },
    lifecycle: { type: "object", additionalProperties: false, required: ["phase", "boundedInMessage", "resultingState"], properties: {
      phase: { type: "string", enum: ["observed", "started", "continued", "completed", "resolved", "unknown"] },
      boundedInMessage: { type: "boolean" }, resultingState: { type: "string", enum: ["active", "monitoring", "resolved", "historical", "unknown"] },
    } },
  },
} as const;
const transitionClaim = {
  type: "object", additionalProperties: false, required: [...commonRequired, "transition", "fromState", "toState", "targetConcept"],
  properties: {
    ...commonProperties, kind: { type: "string", enum: ["state_transition"] },
    transition: { type: "string", enum: ["started", "continued", "changed", "improved", "worsened", "resolved", "recurred", "unknown"] },
    fromState: nullableString(80), toState: { type: "string", maxLength: 80 }, targetConcept: concept,
  },
} as const;
const preferenceClaim = {
  type: "object", additionalProperties: false, required: [...commonRequired, "preference", "object", "constraints"],
  properties: {
    ...commonProperties, kind: { type: "string", enum: ["preference"] },
    preference: { type: "string", enum: ["prefer", "avoid", "require", "limit"] },
    object: { type: "object", additionalProperties: false, required: ["concept", "value"], properties: { concept, value: literal } },
    constraints: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["dimension", "operator", "value", "unit", "period"], properties: {
      dimension: { type: "string", maxLength: 80 }, operator: { type: "string", enum: ["eq", "neq", "lt", "lte", "gt", "gte", "contains"] }, value: literal, unit: nullableString(40), period: nullableString(80),
    } } },
  },
} as const;
const relationshipClaim = {
  type: "object", additionalProperties: false, required: [...commonRequired, "objectRef", "qualifiers"],
  properties: {
    ...commonProperties, kind: { type: "string", enum: ["relationship"] }, objectRef: localId,
    qualifiers: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["key", "value"], properties: { key: { type: "string", maxLength: 80 }, value: literal } } },
  },
} as const;
const correctionClaim = {
  type: "object", additionalProperties: false, required: [...commonRequired, "operation", "target", "replacementClaimRef"],
  properties: {
    ...commonProperties, kind: { type: "string", enum: ["correction"] },
    operation: { type: "string", enum: ["replace", "retract", "negate", "forget", "confirm"] },
    target: { type: "object", additionalProperties: false, required: ["claimRef", "subjectRef", "predicate", "value"], properties: {
      claimRef: { anyOf: [localId, { type: "null" }] }, subjectRef: { anyOf: [localId, { type: "null" }] }, predicate: { anyOf: [concept, { type: "null" }] }, value: literal,
    } },
    replacementClaimRef: { anyOf: [localId, { type: "null" }] },
  },
} as const;

export const proposedSemanticFrameJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "frameLocalId", "discourseActs", "mentions", "references", "claims", "uncertainty"],
  properties: {
    schemaVersion: { type: "string", enum: [SEMANTIC_FRAME_SCHEMA_VERSION] }, frameLocalId: localId,
    discourseActs: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["kind", "confidence"], properties: { kind: { type: "string", enum: ["statement", "question", "request", "acknowledgement", "correction", "retraction"] }, confidence } } },
    mentions: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, required: ["localId", "surface", "coarseType", "attributes", "evidence", "confidence"], properties: {
      localId, surface: { type: "string", minLength: 1, maxLength: 120 }, coarseType: { type: "string", enum: ["animal", "person", "organization", "product", "place", "unknown"] },
      attributes: { type: "object", additionalProperties: false, required: ["species", "lifeStage", "ownership"], properties: { species: nullableString(40), lifeStage: nullableString(40), ownership: { type: "string", enum: ["owner", "household", "other", "unknown"] } } },
      evidence, confidence,
    } } },
    references: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, required: ["localId", "surface", "kind", "mentionRef", "antecedentRefs", "confidence"], properties: {
      localId, surface: { type: "string", maxLength: 120 }, kind: { type: "string", enum: ["name", "pronoun", "description", "ellipsis", "prior_topic"] }, mentionRef: localId,
      antecedentRefs: { type: "array", maxItems: 6, items: localId }, confidence,
    } } },
    claims: { type: "array", maxItems: 12, items: { anyOf: [assertionClaim, eventClaim, transitionClaim, preferenceClaim, relationshipClaim, correctionClaim] } },
    uncertainty: { type: "object", additionalProperties: false, required: ["needsClarification", "clarificationQuestion", "reasons"], properties: {
      needsClarification: { type: "boolean" }, clarificationQuestion: nullableString(240), reasons: { type: "array", maxItems: 6, items: { type: "string", maxLength: 100 } },
    } },
  },
} as const;
