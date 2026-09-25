import type { UserSourceSpan } from "./append-job.ts";
import { bindTransitionAuthorization } from "./governed-transition.ts";
import type { FurviseLiveContext } from "../intelligence/types.ts";
import type { FurviseApplicationAction } from "../application-actions/types.ts";
import { getFurviseActionPolicy } from "../application-actions/policy.ts";

export type LifecycleState = "active" | "deceased" | "archived";
export type LifecycleActionState = { ownerId: string; complete: boolean; actions: FurviseApplicationAction[] };
type Context = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "currentMessage" | "currentTurn" | "lifecycleActionState">;
export type BoundLifecyclePlan = Readonly<{
  authorization: UserSourceSpan;
  pendingDisposition: "keep" | "cancel";
  pendingAction: Readonly<FurviseApplicationAction> | null;
  transition: Readonly<{ petId: string; petName: string; fromState: LifecycleState; toState: LifecycleState }> | null;
  requiredSubjectState: "active" | null;
  subjects: ReadonlyArray<Readonly<{ petId: string; petName: string; state: LifecycleState }>>;
}>;
export const lifecyclePlanSchema = { anyOf: [{ type: "null" }, {
  type: "object", additionalProperties: false,
  required: ["pendingDisposition", "transition", "requiredSubjectState", "authorizationQuote"],
  properties: {
    pendingDisposition: { type: "string", enum: ["keep", "cancel"] },
    transition: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
      required: ["targetPetName", "toState"], properties: {
        targetPetName: { type: "string", minLength: 1, maxLength: 100 },
        toState: { type: "string", enum: ["active", "deceased", "archived"] },
      } }] },
    requiredSubjectState: { type: ["string", "null"], enum: ["active", null] },
    authorizationQuote: { type: "string", minLength: 1, maxLength: 1200 },
  },
}] };
const fail = (field: string): never => { throw new Error("ASK_REQUEST_INVALID:lifecycle_plan", { cause: { field } }); };
const lifecycleKinds = new Set(["pet.mark_deceased", "pet.mark_active", "pet.archive"]);
export function currentLifecycleActions(context: Context): FurviseApplicationAction[] {
  const state = context.lifecycleActionState;
  if (!state || !state.complete || state.ownerId !== context.owner.userId) return fail("pending_state");
  const owned = new Set(context.eligiblePets.filter(p => p.user_id === context.owner.userId).map(p => p.id));
  const actions = new Map<string, FurviseApplicationAction>();
  for (const action of state.actions) {
    if (!lifecycleKinds.has(action.kind)) continue;
    if (!owned.has(action.petId)) return fail("pending_owner");
    const previous = actions.get(action.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(action)) return fail("pending_snapshot");
    actions.set(action.id, action);
  }
  return [...actions.values()].filter(a => a.status === "proposed" || a.status === "confirmation_required");
}
export function bindLifecyclePlan(value: unknown, context: Context, requiredPetIds: readonly string[] = []): BoundLifecyclePlan | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return fail("shape");
  const p = value as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== "authorizationQuote,pendingDisposition,requiredSubjectState,transition"
    || !["keep", "cancel"].includes(String(p.pendingDisposition))
    || p.requiredSubjectState !== null && p.requiredSubjectState !== "active") return fail("shape");
  const source = context.currentTurn;
  if (!source || source.role !== "user" || source.text !== context.currentMessage || source.recoveredReceiptReference) return fail("current_user");
  const authorization = bindTransitionAuthorization(source, p.authorizationQuote);
  const owned = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId);
  const subject = (id: string) => {
    const pet = owned.find(pet => pet.id === id);
    if (!pet) return fail("subject");
    const state = pet.lifecycle_status ?? "active";
    if (!["active", "deceased", "archived"].includes(state)) return fail("saved_state");
    return Object.freeze({ petId: pet.id, petName: pet.name || "your pet", state: state as LifecycleState });
  };
  let pendingAction: BoundLifecyclePlan["pendingAction"] = null;
  if (p.pendingDisposition === "cancel") {
    const pending = currentLifecycleActions(context);
    if (pending.length !== 1) return fail("unique_pending_action");
    const action = pending[0], policy = getFurviseActionPolicy(action.kind);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(action.id)
      || action.confirmationPolicy !== policy.confirmationPolicy || action.safetyClass !== policy.safetyClass
      || action.authorizationScope !== policy.authorizationScope || action.mutationClass !== policy.mutationClass) return fail("pending_capability");
    pendingAction = Object.freeze(structuredClone(action));
  }
  let transition: BoundLifecyclePlan["transition"] = null;
  if (p.transition !== null) {
    if (!p.transition || typeof p.transition !== "object" || Array.isArray(p.transition)) return fail("transition");
    const t = p.transition as Record<string, unknown>;
    if (Object.keys(t).sort().join() !== "targetPetName,toState" || typeof t.targetPetName !== "string"
      || !["active", "deceased", "archived"].includes(String(t.toState))) return fail("transition");
    const pets = owned.filter(pet => pet.name === t.targetPetName);
    if (pets.length !== 1) return fail("target_owner");
    const target = subject(pets[0].id);
    transition = Object.freeze({ petId: target.petId, petName: target.petName, fromState: target.state, toState: t.toState as LifecycleState });
  }
  const subjects = p.requiredSubjectState === "active" ? [...new Set(requiredPetIds)].map(subject) : [];
  if (p.requiredSubjectState && !subjects.length) return fail("required_subject");
  if (p.requiredSubjectState && (transition || pendingAction)) return fail("mixed_state_requirement");
  if (!transition && !pendingAction && !p.requiredSubjectState) return fail("empty");
  return Object.freeze({ authorization, pendingDisposition: p.pendingDisposition as "keep" | "cancel",
    pendingAction, transition, requiredSubjectState: p.requiredSubjectState as "active" | null, subjects: Object.freeze(subjects) });
}
