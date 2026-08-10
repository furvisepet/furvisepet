import type { ProposedSemanticFrame } from "../semantic-frame/types.ts";
import type { SemanticReasonCode } from "./policy.ts";
import type { ShadowEntityBinding } from "./resolve-entities.ts";

export type ShadowReferenceResolution = {
  referenceId: string;
  mentionId: string;
  status: "resolved" | "ambiguous" | "unresolved";
  entityId: string | null;
  entityType: "pet" | "owner" | null;
  confidence: number;
  reasonCode: SemanticReasonCode | null;
};

export function resolveShadowReferences(frame: ProposedSemanticFrame, bindings: ShadowEntityBinding[]): ShadowReferenceResolution[] {
  const byMention = new Map(bindings.map((binding) => [binding.mentionId, binding]));
  return frame.references.map((reference) => {
    const direct = byMention.get(reference.mentionRef);
    if (direct?.status === "resolved") return resolved(reference.localId, reference.mentionRef, direct, reference.confidence);
    const antecedents = reference.antecedentRefs.map((id) => byMention.get(id)).filter((item): item is ShadowEntityBinding => item?.status === "resolved");
    const entityKeys = new Set(antecedents.map((item) => `${item.entityType}:${item.entityId}`));
    if (entityKeys.size === 1 && antecedents[0]) return resolved(reference.localId, reference.mentionRef, antecedents[0], Math.min(reference.confidence, antecedents[0].confidence));
    if (entityKeys.size > 1 || direct?.status === "ambiguous") return failed(reference.localId, reference.mentionRef, "ambiguous", "REFERENCE_AMBIGUOUS");
    return failed(reference.localId, reference.mentionRef, "unresolved", "REFERENCE_NO_MATCH");
  });
}

function resolved(referenceId: string, mentionId: string, binding: ShadowEntityBinding, confidence: number): ShadowReferenceResolution {
  return { referenceId, mentionId, status: "resolved", entityId: binding.entityId, entityType: binding.entityType, confidence, reasonCode: null };
}

function failed(referenceId: string, mentionId: string, status: "ambiguous" | "unresolved", reasonCode: SemanticReasonCode): ShadowReferenceResolution {
  return { referenceId, mentionId, status, entityId: null, entityType: null, confidence: 0, reasonCode };
}
