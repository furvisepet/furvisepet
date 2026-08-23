import { getFurviseActionPolicy } from "./policy.ts";
import type { FurviseApplicationAction, FurviseActionKind, ModelApplicationAction } from "./types.ts";
import { normalizeSingletonPreferenceKey } from "./memory-scopes.ts";
import { classifyCurrentPetLoss } from "../ai/pet-loss.ts";

const supportedProfileFields = new Set(["name", "weight", "current_food", "routine_note", "sex", "breed"]);
const supportedUserPreferences = new Set(["preferred_language", "preferred_units", "communication_style"]);
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
  const replacementPreferences = new Set(input.proposals.filter((proposal) => proposal.kind === "memory.set_preference" && proposal.input.field)
    .map((proposal) => normalizeSingletonPreferenceKey(proposal.input.field!)));
  return input.proposals.flatMap((proposal, index) => {
    if (proposal.kind === "memory.forget_preference" && proposal.input.field && replacementPreferences.has(normalizeSingletonPreferenceKey(proposal.input.field))) return [];
    if (!validProposalInput(proposal, input.lifecycleStatus)) return [];
    const policy = getFurviseActionPolicy(proposal.kind);
    const presentation = actionPresentation(proposal.kind, input.petId, input.petName, proposal.input);
    // The model's explicitIntent value is proposal metadata only. This field is
    // overwritten with server-derived authority before an action can become a
    // capability or reach the auto-execution policy.
    const explicitIntent = hasDeterministicUserMutationIntent({
      action: proposal,
      petName: input.petName,
      sourceMessage: input.sourceMessage,
    });
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

/**
 * Authorizes only a narrow command for the exact proposed mutation and input.
 * Model evidence and model intent classification are deliberately not inputs.
 */
export function hasDeterministicUserMutationIntent(input: {
  action: Pick<ModelApplicationAction, "kind" | "input">;
  petName: string;
  sourceMessage: string;
}) {
  const command = normalizedCommand(input.sourceMessage);
  if (!command) return false;
  const value = normalizeIntentPhrase(input.action.input.value);
  switch (input.action.kind) {
    case "pet.update_profile":
      return Boolean(value && exactProfileUpdateCommand(command, input.action.input.field, value, input.petName));
    case "memory.set_preference":
      return Boolean(value && exactPreferenceSetCommand(command, input.action.input.field, value));
    case "memory.forget_preference":
      return exactPreferenceForgetCommand(command, input.action.input.field);
    case "care_history.add":
      return exactCareHistoryAddCommand(command, input.action.input.detail);
    case "care_state.resolve":
      return /^(?:mark|record|set) (?:it|this concern|that concern|the concern) (?:as )?resolved$/.test(command)
        || /^(?:resolve|close) (?:it|this concern|that concern|the concern)$/.test(command);
    case "care_state.reopen":
      return /^(?:mark|record|set) (?:it|this concern|that concern|the concern) (?:as )?reopened$/.test(command)
        || /^reopen (?:it|this concern|that concern|the concern)$/.test(command);
    default:
      return false;
  }
}

/**
 * Turns model-selected, server-supplied context references into exact record
 * bindings. Missing or ambiguous references deliberately produce no binding;
 * capability creation then fails closed instead of choosing a recent row.
 */
export function resolveFurviseActionTargetBindings(input: {
  actions: FurviseApplicationAction[];
  referencedRecords: ActionTargetContextRecord[];
}) {
  const bindings: Record<string, string> = {};
  for (const action of input.actions) {
    const expected = targetReferenceType(action.kind);
    if (!expected) continue;
    const candidates = new Set(input.referencedRecords.flatMap((record) => {
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

function exactProfileUpdateCommand(command: string, field: string | null, value: string, petName: string) {
  const normalizedField = normalizeKey(field);
  const aliases: Record<string, string[]> = {
    name: ["name"],
    weight: ["weight"],
    current_food: ["current food", "food"],
    routine_note: ["routine note", "routine"],
    sex: ["sex"],
    breed: ["breed"],
  };
  const fields = aliases[normalizedField];
  if (!fields) return false;
  const pet = normalizeIntentPhrase(petName);
  const targets = ["my pet s", "the pet s", "my", "his", "her", "their", "its"];
  if (pet) targets.unshift(`${pet} s`);
  const target = `(?:(?:${targets.map(escapeRegExp).join("|")}) )?`;
  const profile = "(?:profile )?";
  const fieldPattern = `(?:${fields.map((item) => escapeRegExp(normalizeIntentPhrase(item))).join("|")})`;
  return new RegExp(`^(?:change|correct|edit|set|update) ${target}${profile}${fieldPattern} (?:to|as) ${escapeRegExp(value)}$`).test(command);
}

function exactPreferenceSetCommand(command: string, field: string | null, value: string) {
  const preference = normalizeSingletonPreferenceKey(field || "");
  const escapedValue = escapeRegExp(value);
  if (preference === "preferred_language") {
    return new RegExp(`^(?:answer|reply|respond|speak)(?: to me)? in ${escapedValue}$`).test(command)
      || new RegExp(`^(?:change|set|switch|use) (?:my |the )?(?:answer )?language (?:to|as) ${escapedValue}$`).test(command)
      || new RegExp(`^switch to ${escapedValue}$`).test(command);
  }
  if (preference === "preferred_units") {
    return new RegExp(`^(?:change|set|switch) (?:my |the )?units (?:to|as) ${escapedValue}$`).test(command)
      || new RegExp(`^use ${escapedValue} units$`).test(command);
  }
  if (preference === "communication_style") {
    return new RegExp(`^(?:change|set|switch|use) (?:my |the )?(?:answer |communication )?style (?:to|as) ${escapedValue}$`).test(command)
      || new RegExp(`^(?:answer|reply|respond) in (?:a )?${escapedValue} style$`).test(command);
  }
  return false;
}

function exactPreferenceForgetCommand(command: string, field: string | null) {
  const preference = normalizeSingletonPreferenceKey(field || "");
  const labels: Record<string, string> = {
    preferred_language: "(?:answer )?language",
    preferred_units: "units",
    communication_style: "(?:answer |communication )?style",
  };
  const label = labels[preference];
  return Boolean(label && new RegExp(`^(?:delete|forget|remove|stop using) (?:my |the )?${label}(?: preference)?$`).test(command));
}

function exactCareHistoryAddCommand(command: string, detail: string | null) {
  const normalizedDetail = normalizeIntentPhrase(detail);
  if (!normalizedDetail || normalizedDetail.length < 12) return false;
  const exactDetail = escapeRegExp(normalizedDetail);
  const destination = "(?:care history|care log|health history|health log)";
  return new RegExp(`^(?:add|log|record|save) (?:this |that )?${exactDetail}(?: (?:in|to) (?:my |the )?${destination})?$`).test(command)
    || new RegExp(`^(?:add|log|record|save) (?:this |that |it )?(?:in|to) (?:my |the )?${destination} ${exactDetail}$`).test(command);
}

function normalizedCommand(value: string) {
  let normalized = normalizeIntentPhrase(value);
  if (!normalized) return "";
  normalized = normalized.replace(/^(?:furvise )/, "");
  normalized = normalized.replace(/^(?:please )/, "");
  normalized = normalized.replace(/^(?:(?:can|could|would|will) you |i (?:want|need|would like) (?:you|furvise) to )/, "");
  normalized = normalized.replace(/ please$/, "");
  return normalized;
}

function normalizeIntentPhrase(value: string | null) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase()
    .replace(/[’']s\b/g, " s ")
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

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
