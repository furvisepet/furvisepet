import { isDeepStrictEqual } from "node:util";
import { bindFieldMutationJob, fieldMutationJobProposal, type FieldMutationJob } from "../furvise-brain/field-mutation-job.ts";
import { prepareBoundFieldMutationAction } from "../application-actions/planner.ts";
import type { FurviseLiveContext } from "./types.ts";

type Context = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "currentTurn" | "currentMessage" | "pet">;
/** Source grounding on re-entry cannot reinterpret field, value or subject. */
export function prepareFieldMutationTurn(job: FieldMutationJob, context: Context, requestId: string) {
  const petId = job.domain === "pet_profile" ? job.petId : context.pet.id;
  const pet = context.eligiblePets.find(p => p.id === petId && p.user_id === context.owner.userId);
  if (!pet || context.currentTurn?.text !== context.currentMessage) throw Error("PROFILE_MUTATION_SOURCE_CHANGED");
  const rebound = bindFieldMutationJob(fieldMutationJobProposal(job, pet.name || ""), context.currentTurn,
    context.eligiblePets, context.owner.userId);
  if (!isDeepStrictEqual(rebound, job)) throw Error("PROFILE_MUTATION_SOURCE_CHANGED");
  const action = prepareBoundFieldMutationAction(rebound, pet.name || "your pet", requestId, pet.id);
  return { action, orchestration: {
    aiResult: null, handledWithoutAi: true, intent: "status_update" as const,
    safetyLevel: "normal" as const, concern: null, suggestion: null,
    answer: { title: job.domain === "pet_profile" ? "Review the profile change" : "Review the preference change",
      summary: job.domain === "pet_profile"
        ? "A profile field change is ready for confirmation. No profile change has been made."
        : "An owner preference change is ready for confirmation. No preference change has been made.",
      sections: [], safetyNote: null },
  } };
}
