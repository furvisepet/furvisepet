import type { ProposedSemanticFrame } from "../semantic-frame/types.ts";
import { groundSemanticFrameEvidence } from "../semantic-frame/ground-evidence.ts";
import { validateSemanticFrameEvidence } from "../semantic-frame/validate-evidence.ts";
import { buildRecentPetIds, type EligibleSemanticPet } from "./candidate-retrieval.ts";
import { resolveShadowEntities, type ShadowEntityBinding } from "./resolve-entities.ts";
import { resolveShadowReferences } from "./resolve-references.ts";
import type { SemanticReasonCode } from "./policy.ts";

export type AuthoritativeTurnSubjectResolution = {
  status: "resolved" | "contextual" | "ambiguous" | "unresolved";
  petId: string | null;
  reasonCode: SemanticReasonCode | null;
  requiresClarification: boolean;
  explicitSubject: boolean;
  confidence: number;
};

export function resolveAuthoritativeTurnSubject({
  frame,
  message,
  ownerId,
  pets,
  recentConversation,
  selectedPetId,
}: {
  frame: ProposedSemanticFrame;
  message: string;
  ownerId: string;
  pets: EligibleSemanticPet[];
  recentConversation: Array<{ role?: string; text: string }>;
  selectedPetId: string;
}): AuthoritativeTurnSubjectResolution {
  const grounded = groundSemanticFrameEvidence(frame, message).frame;
  const evidence = validateSemanticFrameEvidence(grounded, message);
  const recentPetIds = buildRecentPetIds(pets, recentConversation);
  const bindings = resolveShadowEntities({ frame: grounded, ownerId, pets, recentPetIds, selectedPetId });
  const references = resolveShadowReferences(grounded, bindings);
  const effective = effectiveBindings(bindings, references);
  const animalMentionIds = new Set(grounded.mentions.filter((mention) => mention.coarseType === "animal").map((mention) => mention.localId));
  const subjectRefs = [...new Set(grounded.claims
    .filter((claim) => claim.uncertainty.confidence >= 0.8 && !evidence.invalidClaimIds.includes(claim.localId))
    .map((claim) => claim.subjectRef)
    .filter((ref): ref is string => typeof ref === "string" && animalMentionIds.has(ref)))];

  if (!subjectRefs.length) return contextual(selectedPetId);

  const petIds = new Set<string>();
  const bindingConfidences: number[] = [];
  let failure: ShadowEntityBinding | null = null;
  for (const ref of subjectRefs) {
    if (evidence.invalidMentionIds.includes(ref)) return failed("unresolved", "EVIDENCE_UNSUPPORTED");
    const binding = effective.get(ref);
    if (!binding || binding.status !== "resolved" || binding.entityType !== "pet" || !binding.entityId) {
      failure ||= binding || null;
      continue;
    }
    petIds.add(binding.entityId);
    bindingConfidences.push(binding.confidence);
  }
  if (petIds.size > 1) return failed("ambiguous", "ENTITY_AMBIGUOUS");
  if (petIds.size === 1 && !failure) {
    return {
      status: "resolved", petId: [...petIds][0], reasonCode: null, requiresClarification: false, explicitSubject: true,
      confidence: Math.min(...bindingConfidences),
    };
  }
  if (failure?.status === "ambiguous") return failed("ambiguous", failure.reasonCode || "ENTITY_AMBIGUOUS");
  return failed("unresolved", failure?.reasonCode || "ENTITY_NO_MATCH");
}

function effectiveBindings(bindings: ShadowEntityBinding[], references: ReturnType<typeof resolveShadowReferences>) {
  const result = new Map(bindings.map((binding) => [binding.mentionId, binding]));
  for (const reference of references) {
    if (reference.status !== "resolved") continue;
    result.set(reference.mentionId, {
      mentionId: reference.mentionId, status: "resolved", entityId: reference.entityId,
      entityType: reference.entityType, confidence: reference.confidence, reasonCode: null, candidates: [],
    });
  }
  return result;
}

function contextual(selectedPetId: string): AuthoritativeTurnSubjectResolution {
  return { status: "contextual", petId: selectedPetId, reasonCode: null, requiresClarification: false, explicitSubject: false, confidence: 0.84 };
}

function failed(status: "ambiguous" | "unresolved", reasonCode: SemanticReasonCode): AuthoritativeTurnSubjectResolution {
  return { status, petId: null, reasonCode, requiresClarification: true, explicitSubject: true, confidence: 0 };
}
