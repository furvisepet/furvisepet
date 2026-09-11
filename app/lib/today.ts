import type { CareEntryRow, DogProfileWithMemories } from "./supabase";
import { formatPetDisplayName, formatSpecies } from "./petwise";
import { isKnownConversationalCareNoise } from "./intelligence/care-history-policy.ts";
import { explicitCareEntryDate, formatHistoryTimestamp } from "./history-archive.ts";

export const SERVER_SAFE_GREETING = "Welcome back";
export const TODAY_REMEMBER_EXAMPLES = [
  "Skipped breakfast but ate dinner normally.",
  "Started licking the left paw again.",
  "The new food seems to be sitting better.",
  "Threw up once after breakfast.",
  "Started the new medication tonight.",
  "Energy was lower than usual this morning.",
  "Vet visit went well. Weight was 24 lb.",
  "Slept through the night without coughing.",
  "Stool was softer than usual after dinner.",
  "Seemed nervous during the car ride.",
] as const;

export type TodayRecentState = {
  entries: CareEntryRow[];
  error: string;
  hasResolved: boolean;
  petId: string;
  requestId: number;
  status: "idle" | "loading" | "refreshing" | "ready" | "error";
};

export function createTodayRecentState(): TodayRecentState {
  return {
    entries: [],
    error: "",
    hasResolved: false,
    petId: "",
    requestId: 0,
    status: "idle",
  };
}

export function selectTodayRecentPet(state: TodayRecentState, petId: string): TodayRecentState {
  if (state.petId === petId) return state;
  return {
    entries: [],
    error: "",
    hasResolved: false,
    petId,
    requestId: state.requestId,
    status: petId ? "loading" : "idle",
  };
}

export function startTodayRecentRequest(state: TodayRecentState, petId: string, requestId: number): TodayRecentState {
  const selected = selectTodayRecentPet(state, petId);
  return {
    ...selected,
    error: "",
    requestId,
    status: selected.hasResolved ? "refreshing" : "loading",
  };
}

export function resolveTodayRecentRequest(
  state: TodayRecentState,
  petId: string,
  requestId: number,
  entries: CareEntryRow[],
): TodayRecentState {
  if (state.petId !== petId || state.requestId !== requestId) return state;
  return {
    ...state,
    entries: buildTodayRecentEntries(entries, petId),
    error: "",
    hasResolved: true,
    status: "ready",
  };
}

export function failTodayRecentRequest(state: TodayRecentState, petId: string, requestId: number, error: string): TodayRecentState {
  if (state.petId !== petId || state.requestId !== requestId) return state;
  return {
    ...state,
    error,
    status: "error",
  };
}

export function prependConfirmedTodayEntry(state: TodayRecentState, petId: string, entry: CareEntryRow): TodayRecentState {
  if (state.petId !== petId) return state;
  return {
    ...state,
    entries: buildTodayRecentEntries([entry, ...state.entries], petId),
    error: "",
    hasResolved: true,
    status: "ready",
  };
}

export function getTodayVisibleRecentEntries(state: TodayRecentState, petId: string) {
  return state.petId === petId ? state.entries : [];
}
export const TODAY_EVENT_ACTIONS = [
  { category: "food", id: "food_changed", label: "Food changed", title: "Food change" },
  { category: "symptom", id: "new_symptom", label: "New symptom", title: "Symptom" },
  { category: "medication", id: "medication_or_treatment", label: "Medication or treatment", title: "Treatment" },
  { category: "vet_visit", id: "vet_visit", label: "Vet visit", title: "Vet visit" },
  { category: "behavior", id: "behavior_changed", label: "Behavior changed", title: "Behavior change" },
  { category: "activity", id: "routine_changed", label: "Routine changed", title: "Routine change" },
  { category: "general", id: "add_photo", label: "Add photo", title: "Photo note" },
] as const;

export const TODAY_QUICK_ACTIONS = TODAY_EVENT_ACTIONS;

export type TodayQuickActionId = (typeof TODAY_QUICK_ACTIONS)[number]["id"];

export function getLocalGreeting(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return SERVER_SAFE_GREETING;
}

export function buildTodayEntryDraft(selected: TodayQuickActionId | null, typedText: string, hasPhoto = false) {
  const note = typedText.trim();
  const action = TODAY_EVENT_ACTIONS.find((item) => item.id === selected);
  if (!note && !action) return null;
  if (!note && action?.id === "add_photo" && !hasPhoto) return null;
  return {
    category: action?.category ?? "general",
    note: note || (action?.id === "add_photo" ? "Photo added." : `${action?.label}.`),
    title: action?.title ?? "Note",
  };
}

export function buildTodayRecentEntries<T extends CareEntryRow>(entries: T[], profileId: string) {
  return entries
    .filter((entry) => entry.pet_profile_id === profileId)
    .filter((entry) => !entry.intelligence_source_message_id || !isKnownConversationalCareNoise(`${entry.title || ""} ${entry.note}`))
    .sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime())
    .slice(0, 10);
}

export function formatTodayPetContext(profile: Pick<DogProfileWithMemories, "age_unit" | "age_value" | "name" | "sex" | "species">) {
  const age = profile.age_value === null
    ? ""
    : `${formatNumber(profile.age_value)} ${formatAgeUnit(profile.age_value, profile.age_unit)}`;
  const sex = profile.sex === "female" ? "Female" : profile.sex === "male" ? "Male" : "";
  return [formatPetDisplayName(profile.name), profile.species ? formatSpecies(profile.species) : "", sex, age]
    .filter(Boolean)
    .join(" · ");
}

export function formatTodayTimelineDate(value: string, now = new Date(), metadata?: Record<string, unknown> | null) {
  if (explicitCareEntryDate(value, metadata)) return formatHistoryTimestamp(value, undefined, metadata);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recently";
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const difference = Math.round((today - day) / 86_400_000);
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  if (difference === 0) return `Today, ${time}`;
  if (difference === 1) return `Yesterday, ${time}`;
  const calendarDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
  return `${calendarDate}, ${time}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function formatAgeUnit(value: number, unit: string | null) {
  const normalized = unit === "months" ? "month" : "year";
  return value === 1 ? normalized : `${normalized}s`;
}
