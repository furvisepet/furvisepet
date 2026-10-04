import { ownedPetIdentityKey, explicitlyNamedOwnedPets } from "../intelligence/entities/resolve-turn-subject.ts";
import type { UserSourceSpan } from "./append-job.ts";
import { bindTransitionAuthorization } from "./governed-transition.ts";
import type { FurviseLiveContext } from "../intelligence/types.ts";
import type { FurviseApplicationAction } from "../application-actions/types.ts";
import { getFurviseActionPolicy } from "../application-actions/policy.ts";

export type LifecycleState = "active" | "deceased" | "archived";
export type LifecycleActionState = { ownerId: string; complete: boolean; actions: FurviseApplicationAction[];
  provenance?: { conversationId: string; sourceTurnId: string; cutoff: string;
    assistantMessageIds: string[]; capabilityIds: string[]; scope: "current_conversation" };
};
type Context = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "currentMessage" | "currentTurn" | "lifecycleActionState"> & Partial<Pick<FurviseLiveContext, "conversationId">>;
export type BoundLifecyclePlan = Readonly<{
  authorization: UserSourceSpan;
  pendingDisposition: "keep" | "cancel";
  cancellation: CancellationSelector | null;
  pendingAction: Readonly<FurviseApplicationAction> | null;
  /** Null means an unqualified current-conversation referent; IDs freeze an explicit restriction. */
  pendingSubjectIds: readonly string[] | null;
  transition: Readonly<{ petId: string; petName: string; fromState: LifecycleState; toState: LifecycleState }> | null;
  requiredSubjectState: "active" | null;
  subjects: ReadonlyArray<Readonly<{ petId: string; petName: string; state: LifecycleState }>>;
}>;
const keepPlanSchema = {
  type: "object", additionalProperties: false,
  required: ["pendingDisposition", "transition", "requiredSubjectState", "authorizationQuote"],
  properties: {
    pendingDisposition: { type: "string", enum: ["keep"] },
    transition: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
      required: ["targetPetName", "toState"], properties: {
        targetPetName: { type: "string", minLength: 1, maxLength: 100 },
        toState: { type: "string", enum: ["active", "deceased", "archived"] },
      } }] },
    requiredSubjectState: { type: ["string", "null"], enum: ["active", null] },
    authorizationQuote: { type: "string", minLength: 1, maxLength: 1200 },
  },
};
export type CancellationSelector = Readonly<{ petNames: readonly string[] | null; quote: string }>;
const cancellationSchema = { type: "object", additionalProperties: false, required: ["petNames", "quote"], properties: {
  petNames: { anyOf: [{ type: "null" }, { type: "array", minItems: 1, maxItems: 20,
    items: { type: "string", minLength: 1, maxLength: 100 } }] },
  quote: { type: "string", minLength: 1, maxLength: 1200 },
} };
export const lifecycleRequirementSchema = { anyOf: [{ type: "null" }, { ...keepPlanSchema, properties: {
  ...keepPlanSchema.properties, transition: { type: "null" }, requiredSubjectState: { type: "string", enum: ["active"] },
} }] };
export const lifecyclePlanSchema = { anyOf: [{ type: "null" }, { ...keepPlanSchema, properties: {
  ...keepPlanSchema.properties, pendingDisposition: { anyOf: [{ type: "string", enum: ["keep"] }, cancellationSchema] },
} }] };
const fail = (field: string): never => { throw new Error("ASK_REQUEST_INVALID:lifecycle_plan", { cause: { field } }); };

/** Source provenance and identity binding only: the one Brain assigns semantic roles. */
export function bindCancellationSelector(value: unknown, context: Context, groundedSubjectIds: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("cancellation_selector");
  const p = value as Record<string, unknown>, source = context.currentTurn;
  if (Object.keys(p).sort().join() !== "petNames,quote" || !source || source.role !== "user"
    || source.recoveredReceiptReference || source.text !== context.currentMessage
    || p.petNames !== null && (!Array.isArray(p.petNames) || !p.petNames.length || p.petNames.length > 20
      || p.petNames.some(name => typeof name !== "string" || !name || name.length > 100))) return fail("cancellation_selector");
  bindTransitionAuthorization(source, p.quote);
  const owned = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId);
  const ids = (p.petNames as string[] | null)?.map(name => {
    const pets = owned.filter(pet => ownedPetIdentityKey(pet.name || "") === ownedPetIdentityKey(name));
    if (pets.length !== 1 || !groundedSubjectIds.includes(pets[0].id)) return fail("cancellation_subject");
    return pets[0].id;
  }) ?? [];
  if (new Set(ids).size !== ids.length) return fail("cancellation_scope");
  const quotedIds = new Set(explicitlyNamedOwnedPets(String(p.quote), owned).map(pet => pet.id));
  if (quotedIds.size && (quotedIds.size !== ids.length || ids.some(id => !quotedIds.has(id))))
    return fail("cancellation_quote_scope");
  const selector = Object.freeze({ petNames: p.petNames === null ? null : Object.freeze([...(p.petNames as string[])]), quote: p.quote }) as CancellationSelector;
  return Object.freeze({ selector, subjectIds: p.petNames === null ? null : Object.freeze(ids) });
}
type CancellationAuthority = ReturnType<typeof bindCancellationSelector>;
const originatingCancellation = new WeakMap<LifecycleActionState, { authority: CancellationAuthority;
  source: string; snapshot: string; expiresAt: number }>();
const cancellationSource = (context: Context) => JSON.stringify({ owner: context.owner.userId,
  conversation: context.conversationId, currentTurn: context.currentTurn, currentMessage: context.currentMessage });
/** Called only after server permit verification and complete pending-set hydration. Not serialized authority. */
export function retainCancellationAuthority(context: Context, authority: CancellationAuthority, expiresAt: number): void {
  const state = context.lifecycleActionState;
  if (!state || originatingCancellation.has(state)) return fail("originating_authority");
  originatingCancellation.set(state, { authority, source: cancellationSource(context), snapshot: JSON.stringify(state), expiresAt });
}
function cancellationAuthority(value: unknown, context: Context): CancellationAuthority {
  const state = context.lifecycleActionState, origin = state && originatingCancellation.get(state);
  if (!origin || Date.now() >= origin.expiresAt || origin.source !== cancellationSource(context)
    || origin.snapshot !== JSON.stringify(state)) return fail("originating_authority");
  const rebound = bindCancellationSelector(value, context, context.eligiblePets.filter(pet => pet.user_id === context.owner.userId).map(pet => pet.id));
  if (JSON.stringify(rebound) !== JSON.stringify(origin.authority)) return fail("originating_selector");
  return origin.authority;
}

const lifecycleKinds = new Set(["pet.mark_deceased", "pet.mark_active", "pet.archive"]);
export function currentLifecycleActions(context: Context): FurviseApplicationAction[] {
  const state = context.lifecycleActionState;
  if (!state || !state.complete || state.ownerId !== context.owner.userId) return fail("pending_state");
  const proof = state.provenance;
  if (!proof || proof.scope !== "current_conversation" || !context.conversationId
    || proof.conversationId !== context.conversationId || proof.sourceTurnId !== context.currentTurn?.id
    || proof.cutoff !== context.currentTurn.createdAt || !Array.isArray(proof.assistantMessageIds)
    || !Array.isArray(proof.capabilityIds) || new Set(proof.assistantMessageIds).size !== proof.assistantMessageIds.length
    || new Set(proof.capabilityIds).size !== proof.capabilityIds.length
    || proof.capabilityIds.length !== state.actions.length
    || state.actions.some(action => !proof.capabilityIds.includes(action.id))) return fail("pending_provenance");
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
    || p.pendingDisposition !== "keep" && (!p.pendingDisposition || typeof p.pendingDisposition !== "object" || Array.isArray(p.pendingDisposition))
    || p.requiredSubjectState !== null && p.requiredSubjectState !== "active") return fail("shape");
  const source = context.currentTurn;
  if (!source || source.role !== "user" || source.text !== context.currentMessage || source.recoveredReceiptReference) return fail("current_user");
  const authorization = bindTransitionAuthorization(source, p.authorizationQuote);
  const owned = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId);
  const subject = (id: string) => {
    const pet = owned.find(pet => pet.id === id);
    if (!pet) return fail("subject");
    const state = pet.lifecycle_status;
    if (!["active", "deceased", "archived"].includes(state || "")) return fail("saved_state");
    return Object.freeze({ petId: pet.id, petName: pet.name || "your pet", state: state as LifecycleState });
  };
  let cancellation: CancellationSelector | null = null;
  let pendingSubjectIds: readonly string[] | null = null;
  let pendingAction: BoundLifecyclePlan["pendingAction"] = null;
  if (p.pendingDisposition !== "keep") {
    const origin = cancellationAuthority(p.pendingDisposition, context);
    cancellation = origin.selector; pendingSubjectIds = origin.subjectIds;
    const pending = currentLifecycleActions(context);
    if (pending.length !== 1) return fail("unique_pending_action");
    // Conversation completeness and uniqueness must be established before subject membership.
    if (pendingSubjectIds !== null && (!Array.isArray(pendingSubjectIds) || !pendingSubjectIds.length
      || new Set(pendingSubjectIds).size !== pendingSubjectIds.length
      || pendingSubjectIds.some(id => !owned.some(pet => pet.id === id))
      || !pendingSubjectIds.includes(pending[0].petId))) return fail("pending_subject");
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
  return Object.freeze({ authorization, pendingDisposition: p.pendingDisposition === "keep" ? "keep" : "cancel",
    cancellation, pendingAction, pendingSubjectIds: pendingAction && pendingSubjectIds !== null ? Object.freeze([...pendingSubjectIds]) : null,
    transition, requiredSubjectState: p.requiredSubjectState as "active" | null, subjects: Object.freeze(subjects) });
}
