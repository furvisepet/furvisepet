export const CARE_ENTRY_CATEGORIES = [
  "symptom",
  "food",
  "medication",
  "activity",
  "grooming",
  "vet_visit",
  "behavior",
  "general",
];

export const CARE_ENTRY_SEVERITIES = ["mild", "moderate", "severe"];

const CARE_ENTRY_CATEGORY_LABELS = {
  symptom: "Symptom",
  food: "Food",
  medication: "Medication",
  activity: "Activity",
  grooming: "Grooming",
  vet_visit: "Vet visit",
  behavior: "Behavior",
  general: "General",
};

const CARE_ENTRY_SEVERITY_LABELS = {
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
};

export function normalizeCareEntryDraft(input) {
  return {
    petProfileId: typeof input.petProfileId === "string" ? input.petProfileId.trim() : "",
    category: typeof input.category === "string" ? input.category.trim() : "",
    title: typeof input.title === "string" ? input.title.trim() : "",
    note: typeof input.note === "string" ? input.note.trim() : "",
    severity: normalizeCareSeverity(input.severity),
    occurredAt: typeof input.occurredAt === "string" ? input.occurredAt.trim() : "",
  };
}

export function validateCareEntryDraft(input) {
  const draft = normalizeCareEntryDraft(input);
  const errors = {};

  if (!draft.petProfileId) {
    errors.petProfileId = "Choose a pet.";
  }

  if (!draft.category || !CARE_ENTRY_CATEGORIES.includes(draft.category)) {
    errors.category = "Choose a care category.";
  }

  if (!draft.note) {
    errors.note = "Add a note describing what happened.";
  }

  if (!draft.occurredAt) {
    errors.occurredAt = "Choose when this happened.";
  } else if (Number.isNaN(new Date(draft.occurredAt).getTime())) {
    errors.occurredAt = "Choose a valid date and time.";
  }

  if (draft.severity && !CARE_ENTRY_SEVERITIES.includes(draft.severity)) {
    errors.severity = "Choose a valid severity.";
  }

  return {
    draft,
    errors,
    valid: Object.keys(errors).length === 0,
  };
}

export function isSevereSymptomCareEntry(entry) {
  return entry.category === "symptom" && entry.severity === "severe";
}

export function getSevereSymptomCautionMessage(entry) {
  return isSevereSymptomCareEntry(entry)
    ? "Furvise is not a veterinarian. If symptoms are severe, rapidly worsening, or involve emergency signs, contact a veterinarian right away."
    : "";
}

export function formatCareEntryCategory(category) {
  return CARE_ENTRY_CATEGORY_LABELS[category] || humanizeValue(category);
}

export function formatCareEntrySeverity(severity) {
  if (!severity) return "";
  return CARE_ENTRY_SEVERITY_LABELS[severity] || humanizeValue(severity);
}

export function formatCareEntryTimestamp(value, locale = undefined) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatCareNotePreview(note, maxLength = 96) {
  const normalized = String(note || "").trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function toLocalDateTimeInputValue(date = new Date()) {
  const offsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offsetMinutes * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

export function sortCareEntriesNewestFirst(entries) {
  return [...entries].sort(compareCareEntriesNewestFirst);
}

export function buildDashboardCareEntries(entries, petNameById = new Map()) {
  return [...entries]
    .sort(compareCareEntriesNewestFirst)
    .slice(0, 5)
    .map((entry) => ({
      ...entry,
      petName: petNameById.get(entry.pet_profile_id) || "Unknown pet",
    }));
}

export function buildDashboardCareSectionState({
  hasPets,
  entries,
  petNameById,
}) {
  if (!hasPets) {
    return {
      actionHref: null,
      entries: [],
      emptyMessage: "Add a pet first to start logging real care updates.",
      hasPets: false,
    };
  }

  return {
    actionHref: "/care-log",
    entries: buildDashboardCareEntries(entries, petNameById),
    emptyMessage: "No care updates have been logged yet.",
    hasPets: true,
  };
}

/**
 * @param {{
 *   editingPetId?: string;
 *   isPetScope?: boolean;
 *   petProfileId?: string;
 *   profiles?: Array<{ id?: string }>;
 *   selectedPet?: string;
 * }} options
 */
export function resolveCareLogInitialPetId({
  editingPetId = "",
  isPetScope = false,
  petProfileId = "",
  profiles = [],
  selectedPet = "all",
} = {}) {
  if (editingPetId) return editingPetId;
  if (isPetScope) return petProfileId;
  if (selectedPet && selectedPet !== "all") return selectedPet;
  return profiles.length === 1 ? profiles[0]?.id || "" : "";
}

export function prepareCareEntryForInsert(input, userId) {
  const { draft, errors, valid } = validateCareEntryDraft(input);
  if (!valid) {
    const error = new Error("Invalid care entry data.");
    error.details = errors;
    throw error;
  }

  return {
    user_id: userId,
    pet_profile_id: draft.petProfileId,
    category: draft.category,
    title: draft.title || null,
    note: draft.note,
    severity: draft.severity || null,
    occurred_at: new Date(draft.occurredAt).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function prepareCareEntryForUpdate(input) {
  const { draft, errors, valid } = validateCareEntryDraft(input);
  if (!valid) {
    const error = new Error("Invalid care entry data.");
    error.details = errors;
    throw error;
  }

  return {
    category: draft.category,
    title: draft.title || null,
    note: draft.note,
    severity: draft.severity || null,
    occurred_at: new Date(draft.occurredAt).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function normalizeCareDatabaseError(error, label = "care entry") {
  const code = error?.code;
  const message = typeof error?.message === "string" ? error.message : "";

  if (code === "42P01" || code === "PGRST205") {
    return new Error(
      `Furvise could not find the ${label} table yet. Apply the Supabase migration, then try again.`,
    );
  }

  if (code === "PGRST116") {
    return new Error(`Furvise could not find that ${label} for your account.`);
  }

  if (code === "23514") {
    if (message.includes("pet_care_entries_category_check")) {
      return new Error("Choose one of the supported care categories.");
    }
    if (message.includes("pet_care_entries_severity_check")) {
      return new Error("Choose mild, moderate, severe, or leave severity blank.");
    }
    if (message.includes("pet_care_entries_note_check")) {
      return new Error("Add a non-empty care note.");
    }
  }

  if (code === "42501" || message.toLowerCase().includes("row-level security")) {
    return new Error("Furvise could not save that update because the account check failed.");
  }

  return new Error(`Furvise could not load ${label}. Please try again.`);
}

function normalizeCareSeverity(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return CARE_ENTRY_SEVERITIES.includes(text) ? text : null;
}

function compareCareEntriesNewestFirst(left, right) {
  return new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime();
}

function humanizeValue(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
