import type { ProposedEntityMention, ProposedSemanticFrame } from "../../semantic-frame/types.ts";
import type { EligibleSemanticPet } from "../../entities/candidate-retrieval.ts";
import { resolveShadowEntities } from "../../entities/resolve-entities.ts";
import { resolveShadowReferences } from "../../entities/resolve-references.ts";
import type { CanonicalSubjectType, ResolvedEntity, ResolvedSubject, V2RejectionReason } from "../types.ts";

export type V2EntityResolution = {
  subjectsByMention: Map<string, ResolvedSubject>;
  resolvedEntitiesByMention: Map<string, ResolvedEntity>;
  failuresByMention: Map<string, V2RejectionReason>;
};

export function resolveV2Entities(input: {
  frame: ProposedSemanticFrame;
  ownerId: string;
  pets: EligibleSemanticPet[];
  recentPetIds: string[];
}): V2EntityResolution {
  // Selection is retrieval scope, never v2 claim identity.
  const bindings = resolveShadowEntities({ ...input, selectedPetId: null });
  const references = resolveShadowReferences(input.frame, bindings);
  const subjectsByMention = new Map<string, ResolvedSubject>();
  const resolvedEntitiesByMention = new Map<string, ResolvedEntity>();
  const failuresByMention = new Map<string, V2RejectionReason>();

  for (const mention of input.frame.mentions) {
    const binding = bindings.find((item) => item.mentionId === mention.localId);
    if (binding?.status === "resolved" && binding.entityId && binding.entityType) {
      const subject: ResolvedSubject = {
        type: binding.entityType,
        id: binding.entityId,
        sourceMentionId: mention.localId,
        resolution: "owned",
        confidence: binding.confidence,
      };
      subjectsByMention.set(mention.localId, subject);
      resolvedEntitiesByMention.set(mention.localId, {
        entityType: binding.entityType,
        entityId: binding.entityId,
        sourceMentionId: mention.localId,
        confidence: binding.confidence,
      });
      continue;
    }
    if (externalMentionAllowed(mention)) {
      subjectsByMention.set(mention.localId, {
        type: canonicalExternalType(mention), id: null, sourceMentionId: mention.localId,
        resolution: "external", confidence: mention.confidence,
      });
      continue;
    }
    failuresByMention.set(mention.localId, binding?.status === "ambiguous" ? "ENTITY_AMBIGUOUS" : "ENTITY_UNRESOLVED");
  }

  for (const reference of references) {
    if (reference.status === "resolved" && reference.entityId && reference.entityType) {
      const subject: ResolvedSubject = {
        type: reference.entityType, id: reference.entityId, sourceMentionId: reference.mentionId,
        resolution: "owned", confidence: reference.confidence,
      };
      subjectsByMention.set(reference.mentionId, subject);
      resolvedEntitiesByMention.set(reference.mentionId, {
        entityType: reference.entityType, entityId: reference.entityId,
        sourceMentionId: reference.mentionId, confidence: reference.confidence,
      });
    } else if (!subjectsByMention.has(reference.mentionId)) {
      failuresByMention.set(reference.mentionId, reference.status === "ambiguous" ? "REFERENCE_AMBIGUOUS" : "REFERENCE_UNRESOLVED");
    }
  }
  return { subjectsByMention, resolvedEntitiesByMention, failuresByMention };
}

function externalMentionAllowed(mention: ProposedEntityMention) {
  return mention.coarseType !== "animal" && !(mention.coarseType === "person" && mention.attributes.ownership === "owner");
}

function canonicalExternalType(mention: ProposedEntityMention): CanonicalSubjectType {
  return mention.coarseType === "animal" ? "unknown" : mention.coarseType;
}
