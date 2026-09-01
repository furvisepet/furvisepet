import type { CareEntryRow, DogProfileWithMemories } from "./supabase";
import { formatPetDisplayName, formatSpecies } from "./petwise";
import { isKnownConversationalCareNoise } from "./intelligence/care-history-policy.ts";

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

export const TODAY_EVERYTHING_NORMAL_ACTION = {
  category: "general",
  id: "everything_normal",
  label: "Everything seems normal",
  note: "Everything seemed normal today.",
  title: "Normal check-in",
} as const;

export const TODAY_QUICK_ACTIONS = TODAY_EVENT_ACTIONS;

export type TodayQuickActionId = (typeof TODAY_QUICK_ACTIONS)[number]["id"];
export type TodayFocus = {
  actionHref?: string;
  actionLabel: string;
  body: string;
  kind: "default" | "food_change" | "missing_profile" | "no_activity" | "repeated_concern" | "upcoming_vet";
  title: string;
};

type TodayFocusInput = {
  entries: CareEntryRow[];
  now?: Date;
  profile: DogProfileWithMemories;
};

const REPEATED_CONCERNS = [
  { label: "Paw licking", pattern: /\b(?:paw(?:s)?\s+lick(?:ing|ed)|lick(?:ing|ed)\s+(?:the\s+)?paw(?:s)?)\b/i },
  { label: "Itching", pattern: /\bitch(?:ing|y)?\b/i },
  { label: "Scratching", pattern: /\bscratch(?:ing|ed)?\b/i },
  { label: "Soft stool", pattern: /\bsoft(?:er)?\s+stool\b/i },
  { label: "Vomiting", pattern: /\bvomit(?:ing|ed)?\b/i },
  { label: "Low energy", pattern: /\b(?:low|less)\s+energy\b/i },
  { label: "Reduced appetite", pattern: /\b(?:reduced|low|less)\s+appetite\b/i },
] as const;

export function getLocalGreeting(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return SERVER_SAFE_GREETING;
}

export function toggleTodayQuickAction(current: TodayQuickActionId | null, id: TodayQuickActionId) {
  return current === id ? null : id;
}

export function buildTodayCareNote(_selected: TodayQuickActionId | null, typedText: string) {
  return typedText.trim();
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

export function formatTodayTimelineDate(value: string, now = new Date()) {
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

export function buildTodayFocus({ entries, now = new Date(), profile }: TodayFocusInput): TodayFocus {
  const petName = formatPetDisplayName(profile.name);
  const upcomingVisit = findUpcomingVetVisit(entries, now);
  if (upcomingVisit) {
    return {
      actionHref: `/vet-brief?pet=${encodeURIComponent(profile.id)}&source=dashboard`,
      actionLabel: "Prepare for the visit",
      body: "Keep track of appetite, energy, symptoms, medications, and anything that has changed.",
      kind: "upcoming_vet",
      title: `${petName}\u2019s vet visit is ${formatVisitTiming(upcomingVisit.occurred_at, now)}.`,
    };
  }

  if (hasRecentFoodChange(profile, entries, now)) {
    return {
      actionLabel: "Add an observation",
      body: "Watch for appetite, stool, itching, or energy changes over the next several days.",
      kind: "food_change",
      title: `${petName} recently changed food.`,
    };
  }

  const repeatedConcern = findRepeatedConcern(entries, now);
  if (repeatedConcern) {
    return {
      actionLabel: "Track it today",
      body: "It may help to note when it happens and whether anything seems to trigger it.",
      kind: "repeated_concern",
      title: `${repeatedConcern} has been mentioned several times recently.`,
    };
  }

  if (hasMeaningfulMissingProfileContext(profile)) {
    return {
      actionHref: `/pets/${profile.id}/edit`,
      actionLabel: `Complete ${petName}\u2019s profile`,
      body: "Add current food, weight, breed, or ingredients to avoid.",
      kind: "missing_profile",
      title: `A few more details would make ${petName}\u2019s guidance more specific.`,
    };
  }

  if (!hasRecentMeaningfulActivity(entries, now)) {
    return {
      actionLabel: "Add today\u2019s note",
      body: "Even a small note can make future patterns easier to notice.",
      kind: "no_activity",
      title: `Nothing has been recorded for ${petName} recently.`,
    };
  }

  return buildDefaultTodayFocus();
}

export function buildDefaultTodayFocus(): TodayFocus {
  return {
    actionLabel: "Add an update",
    body: "Add anything you may want to remember later, even if it seems small.",
    kind: "default",
    title: "Keep today simple.",
  };
}

export function buildFallbackTodayFocus(): TodayFocus {
  return {
    ...buildDefaultTodayFocus(),
    body: "Add anything you may want to remember later.",
  };
}

function findUpcomingVetVisit(entries: CareEntryRow[], now: Date) {
  const cutoff = now.getTime() + 14 * 24 * 60 * 60 * 1000;
  return entries
    .filter((entry) => entry.category === "vet_visit")
    .filter((entry) => {
      const timestamp = new Date(entry.occurred_at).getTime();
      return Number.isFinite(timestamp) && timestamp >= now.getTime() && timestamp <= cutoff;
    })
    .sort((left, right) => new Date(left.occurred_at).getTime() - new Date(right.occurred_at).getTime())[0] || null;
}

function hasRecentFoodChange(profile: DogProfileWithMemories, entries: CareEntryRow[], now: Date) {
  const changePattern = /\b(?:changed|changing|switched|switching|transition(?:ed|ing)?|new)\b[\s\S]{0,32}\b(?:food|diet|kibble|meal)\b|\b(?:food|diet|kibble)\b[\s\S]{0,24}\b(?:changed|switched|transitioned|new)\b/i;
  const entryMatch = entries.some((entry) =>
    isPastWithinDays(entry.occurred_at, now, 14) && changePattern.test(`${entry.title || ""} ${entry.note}`),
  );
  if (entryMatch) return true;
  return profile.dog_memories.some((memory) =>
    isPastWithinDays(memory.created_at, now, 14) && changePattern.test(memory.text),
  );
}

function findRepeatedConcern(entries: CareEntryRow[], now: Date) {
  const recentText = entries
    .filter((entry) => isPastWithinDays(entry.occurred_at, now, 30))
    .map((entry) => `${entry.title || ""} ${entry.note}`);
  for (const concern of REPEATED_CONCERNS) {
    if (recentText.filter((text) => concern.pattern.test(text)).length >= 2) return concern.label;
  }
  return null;
}

function hasMeaningfulMissingProfileContext(profile: DogProfileWithMemories) {
  return !profile.breed?.trim()
    || profile.weight_value === null
    || !profile.current_food?.trim()
    || !profile.avoid_ingredients?.some((ingredient) => ingredient.trim());
}

function hasRecentMeaningfulActivity(entries: CareEntryRow[], now: Date) {
  return entries.some((entry) => entry.note.trim() && isPastWithinDays(entry.occurred_at, now, 7));
}

function isPastWithinDays(value: string, now: Date, days: number) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp > now.getTime()) return false;
  return now.getTime() - timestamp <= days * 24 * 60 * 60 * 1000;
}

function formatVisitTiming(value: string, now: Date) {
  const visit = new Date(value);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startVisit = new Date(visit.getFullYear(), visit.getMonth(), visit.getDate()).getTime();
  const calendarDays = Math.round((startVisit - startToday) / (24 * 60 * 60 * 1000));
  if (calendarDays === 0) return "later today";
  if (calendarDays === 1) return "tomorrow";
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(visit);
  if (calendarDays <= 7) return `next ${weekday}`;
  return `on ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", weekday: "long" }).format(visit)}`;
}
