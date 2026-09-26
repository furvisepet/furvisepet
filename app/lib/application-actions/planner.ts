import {readBoundRemoveJob, removeJobActionMatches, type RemoveJob} from "../furvise-brain/remove-job.ts";
import { readBoundReplaceJob, replaceJobActionMatches, type ReplaceJob } from "../furvise-brain/replace-job.ts";
import { stateTransitionActionKind, readBoundStateTransitionJob, type StateTransitionJob } from "../furvise-brain/state-transition-job.ts";
import { fieldMutationActionKind, fieldMutationActionValue, readBoundFieldMutationJob, type FieldMutationJob } from "../furvise-brain/field-mutation-job.ts";
import type { BoundLifecyclePlan } from "../furvise-brain/lifecycle-plan.ts";
import { getFurviseActionPolicy } from "./policy.ts";
import type { FurviseApplicationAction, FurviseActionKind, ModelApplicationAction } from "./types.ts";
import { classifyCurrentPetLoss } from "../ai/pet-loss.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ActionTargetContextRecord = {
  id: string;
  petId: string;
  sourceType: string;
};

export function prepareFurviseApplicationActions(input: {
  proposals: ModelApplicationAction[];
  petId: string;
  petName: string;
  requestId: string;
  sourceMessage: string;
  lifecycleStatus?: "active" | "deceased" | "archived";
}): FurviseApplicationAction[] {
  return input.proposals.flatMap((proposal, index) => {
    if (["pet.delete_permanently", "care_history.remove", "care_history.edit", "pet.update_profile", "memory.set_preference", "memory.forget_preference", "care_state.resolve", "care_state.reopen"].includes(proposal.kind)) return [];
    if (!validProposalInput(proposal, input.lifecycleStatus)) return [];
    const policy = getFurviseActionPolicy(proposal.kind);
    const presentation = actionPresentation(proposal.kind, input.petId, input.petName, proposal.input);
    // A model-shaped action never supplies execution consent. Bound jobs use
    // their dedicated preparation path and the existing confirmation policy.
    const explicitIntent = false;
    return [{
      ...proposal,
      explicitIntent,
      ...policy,
      id: `${input.requestId}:${index + 1}`,
      petId: input.petId,
      status: policy.confirmationPolicy === "always" ? "confirmation_required" : "proposed",
      ...presentation,
      resultMessage: null,
      errorMessage: null,
    }];
  });
}

export function prepareBoundRemoveAction(job:RemoveJob,requestId:string):FurviseApplicationAction {
 if(!readBoundRemoveJob(job))throw Error("REMOVE_JOB_INVALID");
 const profile=job.domain==="pet_profile",kind=profile?"pet.delete_permanently":"care_history.remove",policy=getFurviseActionPolicy(kind);
 return {kind,removeJob:job,...policy,id:requestId+":remove",petId:job.petId,sourceMessageId:job.sourceMessageId,
  ...(profile?{}:{targetSourceId:"care:"+job.resolvedTarget.recordId}),explicitIntent:false,status:"confirmation_required",
  input:{field:null,value:null,title:null,detail:null,category:null,target:profile?"selected":"specified"},evidence:job.instruction.text.slice(0,240),
  label:profile?"Permanently delete this pet":"Remove the history update",description:profile?"Confirm permanent deletion of this pet profile and its linked data.":"Confirm removal of the bound care-history record.",href:null,resultMessage:null,errorMessage:null};
}

/** The canonical selector has already resolved the one owned record. */
export function prepareBoundReplaceAction(job: ReplaceJob, target: { id: string; petId: string; sourceType: string },
  petName: string, requestId: string): FurviseApplicationAction {
  if (!readBoundReplaceJob(job) || target.petId !== job.petId || target.sourceType !== "care_update"
    || (typeof job.target !== "string" && target.id !== "care:" + job.target.recordId)
    || !target.id.startsWith("care:") || !UUID.test(target.id.slice(5))) throw Error("REPLACE_ACTION_INVALID");
  const kind = "care_history.edit", policy = getFurviseActionPolicy(kind);
  const input = { field: null, value: null, title: null, detail: job.body.text, category: null, target: "specified" as const };
  return { kind, replaceJob: job, targetSourceId: target.id, input, ...policy, id: requestId + ":replace",
    petId: job.petId, sourceMessageId: job.sourceMessageId, evidence: job.body.text.slice(0, 240), explicitIntent: true,
    status: "proposed", ...actionPresentation(kind, job.petId, petName, input), resultMessage: null, errorMessage: null };
}

/** The bound job fixes the exact transition; capability policy still owns execution. */
export function prepareBoundStateTransitionAction(job: StateTransitionJob, requestId: string): FurviseApplicationAction {
  if (!readBoundStateTransitionJob(job)) throw Error("STATE_TRANSITION_JOB_INVALID");
  const kind = stateTransitionActionKind(job), policy = getFurviseActionPolicy(kind);
  return { kind, stateTransitionJob: job, ...policy, id: requestId + ":transition", petId: job.petId,
    sourceMessageId: job.sourceMessageId, explicitIntent: true, status: "proposed",
    input: { field: null, value: null, title: null, detail: null, category: null, target: "specified" },
    evidence: job.authorization.text, label: job.toState === "resolved" ? "Resolve the concern" : "Reopen the concern",
    description: "Apply the requested transition to the bound concern.", href: null, resultMessage: null, errorMessage: null };
}

/** Canonical field semantics prepare the existing capability; a proposal never grants execution. */
export function prepareBoundFieldMutationAction(job: FieldMutationJob, petName: string, requestId: string, ownerScopePetId?: string): FurviseApplicationAction {
  if (!readBoundFieldMutationJob(job)) throw Error("PROFILE_MUTATION_JOB_INVALID");
  const kind = fieldMutationActionKind(job), policy = getFurviseActionPolicy(kind);
  const petId = job.domain === "pet_profile" ? job.petId : ownerScopePetId;
  if (!petId) throw Error("FIELD_MUTATION_CAPABILITY_SCOPE_REQUIRED");
  const input = { field: job.field, value: fieldMutationActionValue(job),
    title: null, detail: null, category: null, target: "specified" as const };
  return { kind, input, fieldMutationJob: job, evidence: job.instruction.text.slice(0, 240),
    explicitIntent: false, ...policy, id: requestId + ":field", petId,
    sourceMessageId: job.sourceMessageId, status: "proposed",
    ...actionPresentation(kind, petId, petName, input), resultMessage: null, errorMessage: null };
}

/** Canonical lifecycle intent prepares a capability candidate; confirmation still owns execution. */
export function prepareBoundLifecycleAction(plan: BoundLifecyclePlan, requestId: string): FurviseApplicationAction | null {
  const transition = plan.transition;
  if (!transition || transition.fromState === transition.toState) return null;
  const kind = transition.toState === "deceased" ? "pet.mark_deceased"
    : transition.toState === "active" ? "pet.mark_active" : "pet.archive";
  const policy = getFurviseActionPolicy(kind);
  if (policy.confirmationPolicy !== "always" || policy.mutationClass !== "mutation") throw Error("LIFECYCLE_POLICY_DRIFT");
  const input = { field: null, value: null, title: null, detail: null, category: null, target: "specified" as const };
  return { kind, input, evidence: plan.authorization.text, explicitIntent: false, ...policy,
    id: requestId + ":lifecycle", petId: transition.petId, sourceMessageId: plan.authorization.sourceMessageId,
    status: "confirmation_required", ...actionPresentation(kind, transition.petId, transition.petName, input),
    resultMessage: null, errorMessage: null };
}

/**
 * Turns model-selected, server-supplied context references into exact record
 * bindings. Missing or ambiguous references deliberately produce no binding;
 * capability creation then fails closed instead of choosing a recent row.
 */
export function resolveFurviseActionTargetBindings(input: {
  actions: FurviseApplicationAction[];
  referencedRecords: ActionTargetContextRecord[];
  /** Owned, effective, server-supplied records; independent of answer citations. */
  targetRecords?: ActionTargetContextRecord[];
}) {
  const bindings: Record<string, string> = {};
  for (const action of input.actions) {
    if (action.kind === "care_history.edit" && (!action.replaceJob || !replaceJobActionMatches(action.replaceJob, action))) continue;
    if (action.kind === "care_history.remove" && (!action.removeJob || !removeJobActionMatches(action.removeJob, action))) continue;
    const expected = targetReferenceType(action.kind);
    if (!expected) continue;
    const records = action.targetSourceId
      ? (input.targetRecords || input.referencedRecords).filter(record => record.id === action.targetSourceId)
      : input.referencedRecords;
    const candidates = new Set(records.flatMap((record) => {
      if (record.petId !== action.petId || record.sourceType !== expected.sourceType) return [];
      const prefix = `${expected.prefix}:`;
      if (!record.id.startsWith(prefix)) return [];
      const targetId = record.id.slice(prefix.length);
      return UUID.test(targetId) ? [targetId] : [];
    }));
    if (candidates.size === 1) bindings[action.id] = [...candidates][0];
  }
  return bindings;
}

function validProposalInput(proposal: ModelApplicationAction, lifecycleStatus?: "active" | "deceased" | "archived") {
  if (["pet.delete_permanently", "pet.mark_active", "pet.archive", "care_history.remove"].includes(proposal.kind) && !proposal.explicitIntent) return false;
  if (["care_history.edit", "care_history.remove", "care_state.resolve", "care_state.reopen"].includes(proposal.kind) && proposal.input.target !== "specified") return false;
  if (proposal.kind === "pet.mark_deceased" && classifyCurrentPetLoss(proposal.evidence) !== "confirmed_current") return false;
  if (proposal.kind === "pet.mark_active" && lifecycleStatus === "active") return false;
  if (proposal.kind === "care_history.add" || proposal.kind === "care_history.edit") return standaloneHistoryDetail(proposal.input.detail);
  return true;
}

function standaloneHistoryDetail(value: string | null) {
  const detail = String(value || "").trim();
  return detail.length >= 16 && !/^(?:this|that|it|the last (?:one|update|entry))\.?$/i.test(detail);
}

function actionPresentation(kind: FurviseActionKind, petId: string, petName: string, actionInput: ModelApplicationAction["input"]) {
  const encoded = encodeURIComponent(petId);
  switch (kind) {
    case "pet.read": return view(`Open ${petName}'s profile`, `/pets/${encoded}`);
    case "navigation.open_pet_profile": return view(`Open ${petName}'s profile`, `/pets/${encoded}`);
    case "navigation.open_memories": return view("Open remembered details", `/dogs/${encoded}/memories`);
    case "memory.list": return view("Show remembered details", `/dogs/${encoded}/memories`);
    case "memory.edit_detail": return view("Edit remembered details", `/dogs/${encoded}/memories`);
    case "navigation.open_care_history": return view(`Open ${petName}'s history`, `/history?pet=${encoded}`);
    case "care_history.query": return view(`Review ${petName}'s history`, `/history?pet=${encoded}`);
    case "navigation.open_vet_brief": return view("Open Vet Brief", `/vet-brief?pet=${encoded}`);
    case "vet_brief.prepare": return view("Prepare a care summary", `/vet-brief?pet=${encoded}&source=ask`);
    case "pet.update_profile": return mutation(`Update ${formatField(actionInput.field)}`, `Change ${petName}'s ${formatField(actionInput.field)} to ${actionInput.value || "the requested value"}.`);
    case "pet.mark_deceased": return mutation(`Mark ${petName} as passed away`, `Keep ${petName}'s history while removing ${petName} from active care.`);
    case "pet.mark_active": return mutation(`Mark ${petName} as active`, `Return ${petName} to active care while preserving earlier history.`);
    case "pet.archive": return mutation(`Archive ${petName}`, `Hide ${petName} from active care while preserving the profile and history.`);
    case "pet.delete_permanently": return mutation(`Permanently delete ${petName}`, `Delete the profile and linked Furvise data. This cannot be undone.`);
    case "memory.set_preference": return mutation(`Use ${actionInput.value || "this preference"}`, `Replace the current ${formatField(actionInput.field)} preference.`);
    case "memory.forget_preference": return mutation(`Forget ${formatField(actionInput.field)}`, `Stop using the remembered ${formatField(actionInput.field)} preference.`);
    case "care_history.add": return mutation("Add to care history", actionInput.title || actionInput.detail || "Add the requested update.");
    case "care_history.edit": return mutation("Edit the history update", actionInput.detail || "Review and edit the referenced care-history entry.");
    case "care_history.remove": return mutation("Remove the history update", "Remove the referenced update from care history while preserving an audit-safe tombstone.");
    case "care_state.resolve": return mutation("Mark the concern resolved", "Record that the tracked concern has resolved.");
    case "care_state.reopen": return mutation("Reopen the concern", "Record that the tracked concern has returned.");
  }
}

function view(label: string, href: string) { return { label, description: "Open this Furvise page.", href }; }
function mutation(label: string, description: string) { return { label, description, href: null }; }
function normalizeKey(value: string | null) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function formatField(value: string | null) { return normalizeKey(value).replace(/_/g, " ") || "profile"; }

function targetReferenceType(kind: FurviseActionKind) {
  if (kind === "care_history.edit" || kind === "care_history.remove") return { prefix: "care", sourceType: "care_update" };
  if (kind === "care_state.resolve" || kind === "care_state.reopen") return { prefix: "concern", sourceType: "active_concern" };
  return null;
}
