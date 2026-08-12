import { groundSemanticFrameEvidence } from "../../semantic-frame/ground-evidence.ts";
import type { GroundedSemanticEvidence, ProposedSemanticFrame } from "../../semantic-frame/types.ts";
import type { V2RejectionReason } from "../types.ts";

export type V2EvidenceResult = {
  frame: ProposedSemanticFrame;
  groundedByClaim: Map<string, GroundedSemanticEvidence[]>;
  rejectedByClaim: Map<string, V2RejectionReason>;
};

export function groundV2Evidence(frame: ProposedSemanticFrame, sourceMessage: string): V2EvidenceResult {
  const result = groundSemanticFrameEvidence(frame, sourceMessage);
  const rejectedByClaim = new Map<string, V2RejectionReason>();
  for (const failure of result.failures) {
    if (failure.ownerType !== "claim") continue;
    rejectedByClaim.set(failure.ownerId, failure.reason);
  }
  const groundedByClaim = new Map(result.frame.claims.map((claim) => [
    claim.localId,
    claim.evidence.filter((item): item is GroundedSemanticEvidence =>
      "start" in item && "end" in item && "quote" in item && "alignment" in item),
  ]));
  for (const claim of result.frame.claims) {
    if (!claim.evidence.length) rejectedByClaim.set(claim.localId, "EVIDENCE_EMPTY_SURFACE");
    else if (groundedByClaim.get(claim.localId)?.length !== claim.evidence.length && !rejectedByClaim.has(claim.localId)) {
      rejectedByClaim.set(claim.localId, "EVIDENCE_NOT_FOUND");
    }
  }
  return { frame: result.frame, groundedByClaim, rejectedByClaim };
}

/** SQL persistence uses zero-based Unicode scalar offsets, not JavaScript UTF-16 offsets. */
export function evidenceForPersistence(sourceMessage: string, evidence: GroundedSemanticEvidence[]) {
  return evidence.map((item) => ({
    start: Array.from(sourceMessage.slice(0, item.start)).length,
    end: Array.from(sourceMessage.slice(0, item.end)).length,
    excerpt: item.quote,
    alignment: item.alignment,
  }));
}

