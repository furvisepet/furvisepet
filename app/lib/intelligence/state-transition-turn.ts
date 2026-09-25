import { resolveSafetyState } from "./safety-state.ts";
import { isDeepStrictEqual } from "node:util";
import { bindStateTransitionJob, stateTransitionProposal, type StateTransitionJob } from "../furvise-brain/state-transition-job.ts";
import { prepareBoundStateTransitionAction } from "../application-actions/planner.ts";
import type { FurviseLiveContext } from "./types.ts";

export function prepareStateTransitionTurn(job: StateTransitionJob,
  context: FurviseLiveContext, requestId: string) {
  const pet = context.eligiblePets.find(p => p.id === job.petId && p.user_id === context.owner.userId);
  if (!pet || context.currentTurn?.text !== context.currentMessage) throw Error("TRANSITION_SOURCE_CHANGED");
  const rebound = bindStateTransitionJob(stateTransitionProposal(job, pet.name || ""), { source: context.currentTurn,
    ownerId: context.owner.userId, pets: context.eligiblePets, references: context.concernReferences || [] });
  if (!isDeepStrictEqual(rebound, job)) throw Error("TRANSITION_SOURCE_CHANGED");
  // Safety affects presentation only; it cannot change the bound target or transition.
  const safety = resolveSafetyState({ ...context, pet,
    activeConcerns: context.activeConcerns.filter(c => c.pet_profile_id === pet.id),
    recentlyResolvedConcerns: context.recentlyResolvedConcerns.filter(c => c.pet_profile_id === pet.id) });
  const safetyLevel = safety.level === "urgent" || safety.level === "emergency" ? "urgent" as const
    : safety.level === "monitor" || safety.level === "recently_resolved" ? "monitor" as const : "normal" as const;
  return { action: prepareBoundStateTransitionAction(rebound, requestId), orchestration: {
    aiResult: null, handledWithoutAi: true, intent: "status_update" as const,
    safetyLevel, concern: null, suggestion: null,
    answer: { title: "Concern transition prepared", summary: "The requested concern transition is prepared. Execution has not been verified yet.",
      sections: [], safetyNote: null },
  } };
}
