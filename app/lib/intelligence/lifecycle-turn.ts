import { bindLifecyclePlan, type BoundLifecyclePlan } from "../furvise-brain/lifecycle-plan.ts";
import { prepareBoundLifecycleAction } from "../application-actions/planner.ts";
import type { FurviseApplicationAction } from "../application-actions/types.ts";
import type { FurviseLiveContext } from "./types.ts";

type Context = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "currentMessage" | "currentTurn" | "lifecycleActionState">;
export type LifecyclePlanOutcome = {
  kind: "transition" | "already_current" | "cancelled" | "cancellation_unavailable" | "state_conflict";
  plan: BoundLifecyclePlan;
  actions: FurviseApplicationAction[];
};
/** Rebind a serialized server plan without interpreting wording or changing its meaning. */
export function rebindLifecyclePlan(plan: BoundLifecyclePlan, context: Context): BoundLifecyclePlan {
  const rebound = bindLifecyclePlan({ pendingDisposition: plan.pendingDisposition,
    transition: plan.transition ? { targetPetName: plan.transition.petName, toState: plan.transition.toState } : null,
    requiredSubjectState: plan.requiredSubjectState, authorizationQuote: plan.authorization.text },
    context, plan.subjects.map(subject => subject.petId));
  if (!rebound || JSON.stringify(rebound) !== JSON.stringify(plan)) throw Error("LIFECYCLE_PLAN_SNAPSHOT_CHANGED");
  return rebound;
}
/** Only the existing cancellation capability executes here; transitions remain unconfirmed candidates. */
export async function continueLifecyclePlan(input: {
  plan: BoundLifecyclePlan | null | undefined;
  context: Context;
  requestId: string;
  cancel: (input: { capabilityId: string; userId: string; correctionSourceMessageId: string }) =>
    Promise<{ action: FurviseApplicationAction } | null>;
}): Promise<LifecyclePlanOutcome | null> {
  if (!input.plan) return null;
  const plan = rebindLifecyclePlan(input.plan, input.context);
  if (plan.requiredSubjectState) return plan.subjects.some(subject => subject.state !== plan.requiredSubjectState)
    ? { kind: "state_conflict", plan, actions: [] } : null;
  const actions: FurviseApplicationAction[] = [];
  if (plan.pendingAction) {
    const result = await input.cancel({ capabilityId: plan.pendingAction.id, userId: input.context.owner.userId,
      correctionSourceMessageId: plan.authorization.sourceMessageId });
    if (result && (result.action.id !== plan.pendingAction.id || result.action.petId !== plan.pendingAction.petId
      || result.action.kind !== plan.pendingAction.kind)) throw Error("LIFECYCLE_CANCELLATION_RECEIPT_MISMATCH");
    if (!result || result.action.status !== "cancelled") return { kind: "cancellation_unavailable", plan,
      actions: result ? [result.action] : [] };
    actions.push(result.action);
  }
  const action = prepareBoundLifecycleAction(plan, input.requestId);
  if (action) actions.push(action);
  return { kind: action ? "transition" : plan.transition ? "already_current" : "cancelled", plan, actions };
}
/** Presentation consumes the bound outcome and actual cancellation receipt only. */
export function lifecyclePlanOrchestration(outcome: LifecyclePlanOutcome) {
  const { plan } = outcome;
  const petName = plan.transition?.petName || plan.subjects.find(s => s.state !== "active")?.petName || "the pet";
  let title: string, summary: string;
  if (outcome.kind === "state_conflict") {
    title = "Let's clarify before continuing";
    summary = "The requested work requires an active pet, but the saved lifecycle state for " + petName
      + " is not active. Nothing was changed. Please clarify the subject or request a profile correction.";
  } else if (outcome.kind === "cancellation_unavailable") {
    title = "Earlier action could not be cancelled";
    summary = "The earlier lifecycle action was unavailable or already completed. No new lifecycle transition was prepared.";
  } else if (outcome.kind === "cancelled") {
    title = "Correction noted";
    summary = "The pending lifecycle action was cancelled. This cancellation did not change the saved profile.";
  } else if (outcome.kind === "already_current") {
    title = "Lifecycle state unchanged";
    summary = petName + " is already in the requested saved lifecycle state. No new profile change was prepared.";
  } else {
    title = plan.transition?.toState === "deceased" ? "I'm sorry for your loss" : "Review the profile change";
    summary = (plan.pendingAction ? "The earlier pending action was cancelled. " : "")
      + "A separate confirmation is ready for " + petName + ". The profile has not been changed by this proposal.";
  }
  return { aiResult: null, answer: { title, summary, sections: [], safetyNote: null }, concern: null,
    handledWithoutAi: true, intent: "status_update" as const, safetyLevel: "normal" as const, suggestion: null };
}
