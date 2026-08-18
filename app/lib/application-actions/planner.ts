import { getFurviseActionPolicy } from "./policy.ts";
import type { FurviseApplicationAction, FurviseActionKind, ModelApplicationAction } from "./types.ts";
import { normalizeSingletonPreferenceKey } from "./memory-scopes.ts";
import { classifyCurrentPetLoss } from "../ai/pet-loss.ts";

const supportedProfileFields = new Set(["name", "weight", "current_food", "routine_note", "sex", "breed"]);
const supportedUserPreferences = new Set(["preferred_language", "preferred_units", "communication_style"]);

export function prepareFurviseApplicationActions(input: {
  proposals: ModelApplicationAction[];
  petId: string;
  petName: string;
  requestId: string;
}): FurviseApplicationAction[] {
  const replacementPreferences = new Set(input.proposals.filter((proposal) => proposal.kind === "memory.set_preference" && proposal.input.field)
    .map((proposal) => normalizeSingletonPreferenceKey(proposal.input.field!)));
  return input.proposals.flatMap((proposal, index) => {
    if (proposal.kind === "memory.forget_preference" && proposal.input.field && replacementPreferences.has(normalizeSingletonPreferenceKey(proposal.input.field))) return [];
    if (!validProposalInput(proposal)) return [];
    const policy = getFurviseActionPolicy(proposal.kind);
    const presentation = actionPresentation(proposal.kind, input.petId, input.petName, proposal.input);
    const explicitIntent = proposal.explicitIntent && hasServerVerifiedExplicitIntent(proposal);
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

function hasServerVerifiedExplicitIntent(proposal: ModelApplicationAction) {
  const evidence = proposal.evidence.toLowerCase();
  if (proposal.kind === "pet.update_profile") return /\b(?:change|correct|edit|set|update)\b/.test(evidence);
  if (proposal.kind === "memory.set_preference") return /\b(?:answer|change|keep|prefer|reply|respond|set|speak|switch|use)\b/.test(evidence);
  if (proposal.kind === "memory.forget_preference") return /\b(?:delete|forget|remove|stop using)\b/.test(evidence);
  if (proposal.kind === "care_history.add") return /\b(?:add|log|record|save)\b/.test(evidence);
  if (proposal.kind === "care_state.resolve") return /\b(?:mark|record|resolve|resolved|close)\b/.test(evidence);
  if (proposal.kind === "care_state.reopen") return /\b(?:mark|record|reopen|reopened)\b/.test(evidence);
  return proposal.explicitIntent;
}

function validProposalInput(proposal: ModelApplicationAction) {
  if (["pet.delete_permanently", "pet.mark_active", "pet.archive", "care_history.remove"].includes(proposal.kind) && !proposal.explicitIntent) return false;
  if (["care_history.edit", "care_history.remove"].includes(proposal.kind) && proposal.input.target !== "last") return false;
  if (proposal.kind === "pet.mark_deceased" && classifyCurrentPetLoss(proposal.evidence) !== "confirmed_current") return false;
  if (proposal.kind === "pet.update_profile") return Boolean(proposal.input.field && proposal.input.value && supportedProfileFields.has(normalizeKey(proposal.input.field)));
  if (proposal.kind === "memory.set_preference") return Boolean(proposal.input.field && proposal.input.value && supportedUserPreferences.has(normalizeSingletonPreferenceKey(proposal.input.field)));
  if (proposal.kind === "memory.forget_preference") return Boolean(proposal.input.field && supportedUserPreferences.has(normalizeSingletonPreferenceKey(proposal.input.field)));
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
    case "navigation.open_care_history": return view(`Open ${petName}'s care history`, `/care-log?pet=${encoded}`);
    case "care_history.query": return view(`Review ${petName}'s care history`, `/care-log?pet=${encoded}`);
    case "navigation.open_vet_brief": return view("Open Vet Briefs", `/vet-briefs?pet=${encoded}`);
    case "vet_brief.prepare": return view("Prepare a care summary", `/vet-brief?pet=${encoded}&source=ask`);
    case "pet.update_profile": return mutation(`Update ${formatField(actionInput.field)}`, `Change ${petName}'s ${formatField(actionInput.field)} to ${actionInput.value || "the requested value"}.`);
    case "pet.mark_deceased": return mutation(`Mark ${petName} as passed away`, `Keep ${petName}'s history while stopping future-care experiences.`);
    case "pet.mark_active": return mutation(`Mark ${petName} as active`, `Correct the lifecycle state and restore active-care experiences.`);
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
