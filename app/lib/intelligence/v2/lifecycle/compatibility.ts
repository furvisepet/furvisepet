import type { ProposedSemanticClaim } from "../types.ts";
import type { GovernedEpisodeConceptIdentity, LifecycleRole, LifecycleTransition } from "../types.ts";
import type { V2ConceptNormalization } from "../concepts/normalize.ts";

export type V2LifecycleDecision = {
  compatible: boolean;
  role: LifecycleRole | null;
  transition: LifecycleTransition | null;
  serverEpisodeId: string | null;
  reason: string;
};

export function evaluateLifecycleCompatibilityV2(input: {
  claim: ProposedSemanticClaim;
  concept: V2ConceptNormalization;
  subjectId: string | null;
  activeEpisodes: Array<{ id: string; pet_profile_id: string; status: string }>;
  episodeConcepts: readonly GovernedEpisodeConceptIdentity[];
}): V2LifecycleDecision {
  if (input.claim.kind !== "event" && input.claim.kind !== "state_transition") {
    return { compatible: true, role: null, transition: null, serverEpisodeId: null, reason: "not_lifecycle" };
  }
  const transition = claimTransition(input.claim);
  const role = lifecycleRole(input.claim, transition);
  const candidates = input.concept.status === "canonical" ? input.activeEpisodes.filter((episode) => {
    const identity = input.episodeConcepts.find((candidate) => candidate.episodeId === episode.id);
    return episode.pet_profile_id === input.subjectId
      && (episode.status === "active" || episode.status === "monitoring")
      && identity?.status === "canonical"
      && identity.key === input.concept.canonicalKey;
  }) : [];
  const requiresActiveEpisode = role === "resolution" || ["continuation", "improvement", "worsening"].includes(role);
  if (requiresActiveEpisode && input.concept.status !== "canonical") {
    return { compatible: false, role, transition, serverEpisodeId: null, reason: "provisional_concept_cannot_bind_lifecycle" };
  }
  if (role === "resolution" && candidates.length !== 1) {
    return { compatible: false, role, transition, serverEpisodeId: null, reason: "terminal_requires_unique_active_episode" };
  }
  if (["continuation", "improvement", "worsening"].includes(role) && candidates.length !== 1) {
    return { compatible: false, role, transition, serverEpisodeId: null, reason: "transition_requires_unique_active_episode" };
  }
  return {
    compatible: true,
    role,
    transition,
    serverEpisodeId: candidates.length === 1 ? candidates[0].id : null,
    reason: candidates.length === 1 ? "matched_active_episode" : "new_or_historical_lifecycle",
  };
}

function claimTransition(claim: ProposedSemanticClaim): LifecycleTransition {
  if (claim.kind === "state_transition") return claim.transition;
  if (claim.kind !== "event") return "unknown";
  if (claim.lifecycle.phase === "started") return "started";
  if (claim.lifecycle.phase === "continued") return "continued";
  if (claim.lifecycle.phase === "resolved") return "resolved";
  return "unknown";
}

function lifecycleRole(claim: ProposedSemanticClaim, transition: LifecycleTransition): LifecycleRole {
  if (transition === "started") return "opening";
  if (transition === "continued") return "continuation";
  if (transition === "improved") return "improvement";
  if (transition === "worsened") return "worsening";
  if (transition === "resolved") return "resolution";
  if (transition === "recurred") return "recurrence";
  if (claim.kind === "event" && claim.lifecycle.resultingState === "active") return "opening";
  return "unknown";
}
