import type { PetWiseAnalysis } from "./ai-analysis";
import {
  formatCareEntryCategory,
  formatCareNotePreview,
  isSevereSymptomCareEntry,
} from "./care-log.mjs";
import {
  buildProfileCompleteness,
  getProfileActionFields,
  type ProfileCompleteness,
} from "./profile-completeness";
import { formatPetDisplayName, formatSpecies } from "./petwise";
import type { CareEntryRow, DogMemoryRow, DogProfileWithMemories } from "./supabase";

export { buildProfileCompleteness };

export type PetProfileNextStepKind =
  | "urgent_veterinary_caution"
  | "unresolved_severe_symptom"
  | "meaningful_symptom_follow_up"
  | "missing_profile_information"
  | "recent_care_follow_up"
  | "review_latest_guidance"
  | "no_action_needed";

export type PetProfileNextStep = {
  actionHref: string;
  actionLabel: string;
  description: string;
  kind: PetProfileNextStepKind;
  title: string;
};

export type PetProfileOverviewModel = {
  avoidancesLabel: string;
  completeness: ProfileCompleteness;
  currentFoodLabel: string;
  currentFocus: {
    activeCaution: string;
    importantNote: string;
    latestRelevantChange: string;
    mainConcern: string;
  };
  furviseSays: {
    confidenceLabel: string;
    safetyStatus: string;
    summary: string;
    updatedAtLabel: string;
  } | null;
  headerSummary: string;
  latestUpdateAt: string;
  nextStep: PetProfileNextStep;
  recentEntries: CareEntryRow[];
  recentSevereSymptom: CareEntryRow | null;
  savedDetails: DogMemoryRow[];
  showProductLink: boolean;
  productLinkLabel: string;
};

const RECENT_SEVERE_DAYS = 14;
const RECENT_FOLLOW_UP_DAYS = 7;

export function buildPetProfileOverviewModel({
  entries,
  guidance,
  guidanceUpdatedAt,
  now = new Date(),
  profile,
}: {
  entries: CareEntryRow[];
  guidance: PetWiseAnalysis | null;
  guidanceUpdatedAt?: string | null;
  now?: Date;
  profile: DogProfileWithMemories;
}): PetProfileOverviewModel {
  const recentEntries = getRecentEntries(entries);
  const recentSevereSymptom = findRecentSevereSymptom(recentEntries, now);
  const completeness = buildProfileCompleteness(profile);
  const nextStep = buildPetProfileNextStep({
    completeness,
    entries: recentEntries,
    guidance,
    now,
    profile,
    recentSevereSymptom,
  });
  const furviseSays = guidance
    ? {
        confidenceLabel: formatGuidanceConfidenceLabel(guidance.confidence, completeness.status),
        safetyStatus: formatSafetyStatus(guidance),
        summary: guidance.summary.trim(),
        updatedAtLabel: guidanceUpdatedAt ? `Updated ${formatShortDate(guidanceUpdatedAt)}` : "",
      }
    : null;

  return {
    avoidancesLabel: formatAvoidances(profile),
    completeness,
    currentFoodLabel: formatCurrentFood(profile),
    currentFocus: buildCurrentFocus(profile, recentEntries, recentSevereSymptom, guidance),
    furviseSays,
    headerSummary: buildProfileHeaderSummary(profile),
    latestUpdateAt: getLatestUpdateAt(profile, recentEntries),
    nextStep,
    recentEntries: recentEntries.slice(0, 5),
    recentSevereSymptom,
    savedDetails: getSavedDetails(profile.dog_memories),
    showProductLink: canShowProductLink(guidance, recentSevereSymptom),
    productLinkLabel: formatProductLinkLabel(completeness, guidance, recentSevereSymptom),
  };
}

export function buildPetProfileNextStep({
  completeness,
  entries,
  guidance,
  now = new Date(),
  profile,
  recentSevereSymptom,
}: {
  completeness: ProfileCompleteness;
  entries: CareEntryRow[];
  guidance: PetWiseAnalysis | null;
  now?: Date;
  profile: DogProfileWithMemories;
  recentSevereSymptom: CareEntryRow | null;
}): PetProfileNextStep {
  const name = formatPetDisplayName(profile.name);

  if (guidance?.vetAttention.needed && guidance.vetAttention.urgency === "urgent") {
    return {
      actionHref: `/care-log?pet=${profile.id}`,
      actionLabel: "Open care history",
      description:
        guidance.vetAttention.reason ||
        "Furvise guidance says veterinary attention should come before routine care or shopping.",
      kind: "urgent_veterinary_caution",
      title: "Contact a veterinarian because urgent warning signs were recorded",
    };
  }

  if (recentSevereSymptom) {
    return {
      actionHref: `/care-log?pet=${profile.id}&entry=${recentSevereSymptom.id}`,
      actionLabel: "View severe update",
      description:
        "Furvise does not diagnose. Severe symptoms should be reviewed with a veterinarian, especially if they continue or worsen.",
      kind: "unresolved_severe_symptom",
      title: "Contact a veterinarian because severe symptoms were recorded",
    };
  }

  const speciesMissing = completeness.missingFields.includes("species");
  if (speciesMissing) {
    return {
      actionHref: `/dogs/${profile.id}/edit#species`,
      actionLabel: "Add species",
      description: "Species helps Furvise separate dog and cat care and product suitability.",
      kind: "missing_profile_information",
      title: `Add ${name}'s species`,
    };
  }

  const missingMainConcern = completeness.missingFields.includes("main concern");
  if (missingMainConcern) {
    return {
      actionHref: `/dogs/${profile.id}/edit#main-concern`,
      actionLabel: "Add concern",
      description: "A specific concern helps Furvise make more useful care suggestions.",
      kind: "missing_profile_information",
      title: `Add ${name}'s main concern`,
    };
  }

  const profileActionFields = getProfileActionFields(completeness);
  const prioritizedActionField = getPrioritizedActionField(profileActionFields);
  if (prioritizedActionField) {
    return buildProfileActionNextStep(profile, name, prioritizedActionField);
  }

  const symptomFollowUp = findMeaningfulSymptomFollowUp(entries, now);
  if (symptomFollowUp) {
    return {
      actionHref: `/care-log?pet=${profile.id}&entry=${symptomFollowUp.id}`,
      actionLabel: "View symptom update",
      description: `${formatCareEntryCategory(symptomFollowUp.category)} was recorded recently: ${formatCareNotePreview(symptomFollowUp.note, 80)}`,
      kind: "meaningful_symptom_follow_up",
      title: `Follow up on ${formatRecentCareTitle(symptomFollowUp)}`,
    };
  }

  const routineFollowUp = findRoutineCareFollowUp(entries, now);
  if (routineFollowUp) {
    return {
      actionHref: `/care-log?pet=${profile.id}&entry=${routineFollowUp.id}`,
      actionLabel: "View update",
      description: `${formatCareEntryCategory(routineFollowUp.category)} was recorded recently: ${formatCareNotePreview(routineFollowUp.note, 80)}`,
      kind: "recent_care_follow_up",
      title: `Follow up on ${formatRecentCareTitle(routineFollowUp)}`,
    };
  }

  if (guidance) {
    return {
      actionHref: "/results",
      actionLabel: "View guidance",
      description: guidance.summary,
      kind: "review_latest_guidance",
      title: "Review latest Furvise guidance",
    };
  }

  return {
    actionHref: `/care-log?pet=${profile.id}`,
    actionLabel: "Open care history",
    description: "No urgent care context or missing required profile details are recorded.",
    kind: "no_action_needed",
    title: "No action needed today",
  };
}

export function findRecentSevereSymptom(
  entries: CareEntryRow[],
  now = new Date(),
): CareEntryRow | null {
  return (
    entries.find((entry) => isSevereSymptomCareEntry(entry) && isWithinDays(entry.occurred_at, now, RECENT_SEVERE_DAYS)) ||
    null
  );
}

export function canOpenPetProfile(
  profile: Pick<DogProfileWithMemories, "user_id"> | null,
  userId: string,
) {
  return Boolean(profile && profile.user_id === userId);
}

export function formatAge(profile: DogProfileWithMemories) {
  if (profile.age_value === null) return "Age unknown";
  return `${formatNumericValue(profile.age_value)} ${profile.age_unit || "years"}`;
}

export function formatWeight(profile: DogProfileWithMemories) {
  if (profile.weight_value === null) return "Weight unknown";
  return `${formatNumericValue(profile.weight_value)} ${profile.weight_unit || "lb"}`;
}

export function formatCurrentFood(profile: DogProfileWithMemories) {
  return profile.current_food?.trim() || "Current food unknown";
}

export function formatBudget(profile: DogProfileWithMemories) {
  if (profile.monthly_budget === null || !Number.isFinite(Number(profile.monthly_budget))) {
    return "Not provided";
  }
  return `$${formatNumericValue(profile.monthly_budget)}/month`;
}

export function formatAvoidances(profile: DogProfileWithMemories) {
  const avoidances = profile.avoid_ingredients?.filter((item) => item.trim()) || [];
  return avoidances.length ? avoidances.join(", ") : "None known";
}

function getRecentEntries(entries: CareEntryRow[]) {
  return [...entries].sort(
    (left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime(),
  );
}

function getSavedDetails(memories: DogMemoryRow[]) {
  return memories.filter((memory) => memory.text.trim()).slice(0, 3);
}

function buildProfileHeaderSummary(profile: DogProfileWithMemories) {
  return [
    formatSpecies(profile.species),
    profile.breed?.trim() || "Breed unknown",
    formatAge(profile),
    formatWeight(profile),
  ].join(" · ");
}

function getLatestUpdateAt(profile: DogProfileWithMemories, entries: CareEntryRow[]) {
  const dates = [profile.updated_at, ...entries.map((entry) => entry.occurred_at)]
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (dates.length === 0) return profile.updated_at;
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

function canShowProductLink(guidance: PetWiseAnalysis | null, severeEntry: CareEntryRow | null) {
  if (severeEntry) return false;
  if (guidance?.vetAttention.needed && guidance.vetAttention.urgency === "urgent") return false;
  return true;
}

function getPrioritizedActionField(fields: string[]) {
  const priority = ["weight", "current food", "age", "breed or mixed/unknown", "monthly care budget"];
  return priority.find((field) => fields.includes(field)) || fields[0] || "";
}

function buildProfileActionNextStep(profile: DogProfileWithMemories, name: string, field: string): PetProfileNextStep {
  if (field === "weight") {
    return {
      actionHref: `/dogs/${profile.id}/edit#weight`,
      actionLabel: "Add weight",
      description:
        "Weight helps Furvise estimate food cost, portion context, and care guidance more accurately.",
      kind: "missing_profile_information",
      title: `Add ${name}'s weight when you can`,
    };
  }

  if (field === "current food") {
    return {
      actionHref: `/dogs/${profile.id}/edit#current-food`,
      actionLabel: "Add current food",
      description: "Current food helps Furvise compare options and explain product guidance.",
      kind: "missing_profile_information",
      title: `Add ${name}'s current food when you can`,
    };
  }

  if (field === "age") {
    return {
      actionHref: `/dogs/${profile.id}/edit#age`,
      actionLabel: "Add age",
      description: "Age gives Furvise more context for care and product guidance.",
      kind: "missing_profile_information",
      title: `Add ${name}'s age when you can`,
    };
  }

  if (field === "breed or mixed/unknown") {
    return {
      actionHref: `/dogs/${profile.id}/edit#breed`,
      actionLabel: "Add breed",
      description: "Breed helps Furvise tailor breed-sensitive care guidance.",
      kind: "missing_profile_information",
      title: `Add ${name}'s breed when you can`,
    };
  }

  if (field === "monthly care budget") {
    return {
      actionHref: `/dogs/${profile.id}/edit#budget`,
      actionLabel: "Add budget",
      description: "Care budget helps Furvise compare options and estimate monthly cost more accurately.",
      kind: "missing_profile_information",
      title: `Add ${name}'s care budget when you can`,
    };
  }

  return {
    actionHref: `/dogs/${profile.id}/edit`,
    actionLabel: "Complete profile",
    description: `Add ${formatList([field])} so Furvise can provide more useful guidance.`,
    kind: "missing_profile_information",
    title: `Complete ${name}'s profile`,
  };
}

function formatGuidanceConfidenceLabel(
  confidence: PetWiseAnalysis["confidence"],
  readiness: ProfileCompleteness["status"],
) {
  if (readiness !== "Ready for guidance") return "Limited context";
  if (confidence === "high") return "High confidence";
  if (confidence === "moderate") return "Moderate confidence";
  return "Low confidence";
}

function formatProductLinkLabel(
  completeness: ProfileCompleteness,
  guidance: PetWiseAnalysis | null,
  severeEntry: CareEntryRow | null,
) {
  if (!canShowProductLink(guidance, severeEntry)) return "";
  if (completeness.status === "Limited context") return "Explore product options";
  if (completeness.status === "Missing required information") return "View product options";
  return "View relevant products";
}

function formatSafetyStatus(guidance: PetWiseAnalysis) {
  if (!guidance.vetAttention.needed || guidance.vetAttention.urgency === "none") {
    return "No safety escalation stored";
  }
  if (guidance.vetAttention.urgency === "urgent") return "Urgent veterinary caution";
  if (guidance.vetAttention.urgency === "soon") return "Veterinary follow-up suggested soon";
  return "Routine veterinary note";
}

function buildCurrentFocus(
  profile: DogProfileWithMemories,
  entries: CareEntryRow[],
  severeEntry: CareEntryRow | null,
  guidance: PetWiseAnalysis | null,
) {
  const mainConcern = profile.main_concern?.trim() || "No active concern recorded";
  const latestRelevantEntry = findLatestConcernRelatedEntry(mainConcern, entries);
  const concernLabel = mainConcern === "No active concern recorded" ? "care" : mainConcern.toLowerCase();

  return {
    activeCaution: severeEntry
      ? `Recent severe symptom: ${severeEntry.title || formatCareEntryCategory(severeEntry.category)}`
      : guidance?.vetAttention.needed && guidance.vetAttention.urgency !== "none"
        ? formatSafetyStatus(guidance)
        : "None",
    importantNote: buildImportantNote(entries, severeEntry, guidance, profile),
    latestRelevantChange: latestRelevantEntry
      ? `${formatCareEntryCategory(latestRelevantEntry.category)}: ${latestRelevantEntry.title || formatCareNotePreview(latestRelevantEntry.note, 64)}`
      : `No ${concernLabel}-related update recorded yet`,
    mainConcern,
  };
}

function buildImportantNote(
  entries: CareEntryRow[],
  severeEntry: CareEntryRow | null,
  guidance: PetWiseAnalysis | null,
  profile?: DogProfileWithMemories,
) {
  if (severeEntry) return "Review the severe symptom update before routine decisions.";
  const symptom = entries.find((entry) => entry.category === "symptom" && entry.severity);
  if (symptom) return `${formatCareEntrySeverityLabel(symptom.severity)} symptom update is active.`;
  if (profile?.weight_value === null) return "Weight or body condition has not been recorded yet.";
  if (guidance?.missingInformation.length) return guidance.missingInformation[0];
  return "No important active notes";
}

function findLatestConcernRelatedEntry(mainConcern: string, entries: CareEntryRow[]) {
  const normalizedConcern = mainConcern.toLowerCase();
  if (!normalizedConcern || normalizedConcern === "no active concern recorded") return null;

  const concernParts = normalizedConcern
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z0-9]/g, ""))
    .filter((part) => part.length > 3);

  return (
    entries.find((entry) => {
      const haystack = `${entry.category} ${entry.title || ""} ${entry.note}`.toLowerCase();
      return concernParts.some((part) => haystack.includes(part));
    }) || null
  );
}

function findMeaningfulSymptomFollowUp(entries: CareEntryRow[], now: Date) {
  return (
    entries.find(
      (entry) =>
        entry.category === "symptom" &&
        !isSevereSymptomCareEntry(entry) &&
        isWithinDays(entry.occurred_at, now, RECENT_FOLLOW_UP_DAYS),
    ) || null
  );
}

function findRoutineCareFollowUp(entries: CareEntryRow[], now: Date) {
  return (
    entries.find(
      (entry) =>
        entry.category !== "symptom" &&
        isWithinDays(entry.occurred_at, now, RECENT_FOLLOW_UP_DAYS) &&
        isMeaningfulRoutineFollowUp(entry),
    ) || null
  );
}

function isMeaningfulRoutineFollowUp(entry: CareEntryRow) {
  if (entry.severity) return true;

  const text = `${entry.title || ""} ${entry.note}`.toLowerCase();
  return /\b(change|changed|switch|switched|switching|concern|monitor|watch|follow[- ]?up|abnormal|unusual|worse|limp|itch|vomit|diarrhea|cough|pain|swelling|blood|not eating)\b/.test(
    text,
  );
}

function formatCareEntrySeverityLabel(severity: CareEntryRow["severity"]) {
  if (severity === "severe") return "Severe";
  if (severity === "moderate") return "Moderate";
  return "Mild";
}

function formatRecentCareTitle(entry: CareEntryRow) {
  const title = entry.title?.trim();
  if (title) return title.toLowerCase();
  return `${formatCareEntryCategory(entry.category).toLowerCase()} update`;
}

function formatNumericValue(value: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isWithinDays(value: string, now: Date, days: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const ageMs = now.getTime() - date.getTime();
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

function formatList(values: string[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}
