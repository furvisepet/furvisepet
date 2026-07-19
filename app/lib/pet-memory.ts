import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CareEntryRow,
  DogMemoryRow,
  DogProductFeedbackRow,
  DogProfileRow,
} from "./supabase";

const FURVISE_SAFETY_LINE =
  "Furvise organizes care context. It does not diagnose or replace a veterinarian.";
const FURVISE_URGENT_SAFETY_MESSAGE =
  "Some signs may need urgent veterinary care. If your pet is struggling to breathe, collapsing, repeatedly vomiting, showing severe pain, or may have eaten something toxic, contact a veterinarian or emergency clinic now.";

export type PetMemorySource = "owner" | "furvise" | "system";

export type PetMemoryContext = {
  pet: {
    id: string;
    name: string;
    species: "dog" | "cat" | null;
    breed: string | null;
    ageLabel: string | null;
    weightLabel: string | null;
    mainConcern: string | null;
    currentFood: string | null;
    avoidIngredients: string[];
    monthlyBudget: string | null;
    wellnessGoal: string | null;
    importantNotes: string[];
  };
  timeline: {
    recentEntries: PetMemoryTimelineEntry[];
    recallEntries: PetMemoryTimelineEntry[];
    entriesLast7Days: PetMemoryTimelineEntry[];
    entriesLast30Days: PetMemoryTimelineEntry[];
  };
  savedDetails: PetMemorySavedDetail[];
  productFeedback: PetMemoryProductFeedback[];
  derived: {
    recentChanges: string[];
    recurringConcerns: string[];
    knownAvoids: string[];
    safetyFlags: string[];
    missingContext: string[];
    summaryBullets: string[];
  };
};

export type PetMemoryTimelineEntry = {
  id: string;
  date: string;
  category: string;
  title: string;
  detail: string | null;
  source: PetMemorySource;
};

export type PetMemorySavedDetail = {
  id: string;
  label: string;
  value: string;
  source: "owner" | "furvise";
  createdAt: string;
};

export type PetMemoryProductFeedback = {
  productId: string;
  status: string;
  note?: string | null;
  createdAt: string;
};

export type AskMemoryIntent =
  | "recent_summary"
  | "last_week_logs"
  | "food_notes"
  | "symptom_notes"
  | "vet_prep"
  | "product_feedback_summary"
  | "general_pet_question";

type StoredGuidanceInput = {
  createdAt?: string | null;
  detail?: string | null;
  id?: string | null;
  title?: string | null;
};

type BuildPetMemoryInput = {
  careEntries?: CareEntryRow[];
  now?: Date;
  productFeedback?: DogProductFeedbackRow[];
  profile: DogProfileRow;
  recentGuidance?: StoredGuidanceInput[];
  savedMemories?: DogMemoryRow[];
};

type LoadPetMemoryInput = {
  petId: string;
  supabase: SupabaseClient;
  userId: string;
};

const urgentSafetyPatterns: { label: string; pattern: RegExp }[] = [
  { label: "trouble breathing", pattern: /\b(trouble breathing|can't breathe|cannot breathe|difficulty breathing|labou?red breathing)\b/i },
  { label: "collapse", pattern: /\b(collapse|collapsed|unconscious|fainted|nonresponsive)\b/i },
  { label: "seizure", pattern: /\b(seizure|seizing|convulsion)\b/i },
  { label: "severe bleeding", pattern: /\b(severe bleeding|bleeding heavily|won't stop bleeding|blood in vomit|blood in stool)\b/i },
  { label: "poisoning", pattern: /\b(poisoning|poison|toxin|toxic|ate chocolate|ate grapes|ate raisins|antifreeze|rat poison)\b/i },
  { label: "cannot urinate", pattern: /\b(cannot urinate|can't urinate|unable to urinate|straining to pee|blocked urine)\b/i },
  { label: "repeated vomiting", pattern: /\b(repeated vomiting|keeps vomiting|vomiting repeatedly|unable to keep water down)\b/i },
  { label: "bloated abdomen", pattern: /\b(bloated abdomen|swollen abdomen|bloat)\b/i },
  { label: "extreme lethargy", pattern: /\b(extreme lethargy|severe weakness|barely moving|can't stand|cannot stand)\b/i },
  { label: "severe pain", pattern: /\b(severe pain|crying in pain|screaming in pain)\b/i },
];

const strongFoodUpdatePattern =
  /\b(current food|food|brand|protein|ingredients?|treats?|kibble|wet food|diet|chicken|beef|salmon|lamb|duck|turkey)\b/i;
const relatedMealTimePattern =
  /\b(dinner|breakfast|lunch|supper|appetite|ate|eats?|eating|water|meal|meals|drank|drink|drinking|hydration|fed|feeding)\b/i;

export function buildPetMemoryContext({
  careEntries = [],
  now = new Date(),
  productFeedback = [],
  profile,
  recentGuidance = [],
  savedMemories = [],
}: BuildPetMemoryInput): PetMemoryContext {
  const pet = {
    id: profile.id,
    name: normalizeText(profile.name) || "this pet",
    species: profile.species === "dog" || profile.species === "cat" ? profile.species : null,
    breed: normalizeNullable(profile.breed),
    ageLabel: formatAgeLabel(profile),
    weightLabel: formatWeightLabel(profile),
    mainConcern: normalizeNullable(profile.main_concern),
    currentFood: normalizeNullable(profile.current_food),
    avoidIngredients: normalizeList(profile.avoid_ingredients || []),
    monthlyBudget:
      typeof profile.monthly_budget === "number" && Number.isFinite(profile.monthly_budget)
        ? `$${profile.monthly_budget}/month`
        : null,
    wellnessGoal: normalizeNullable(profile.wellness_goal),
    importantNotes: [] as string[],
  };

  const ownerEntries = careEntries.map(mapCareEntryToTimelineEntry);
  const guidanceEntries = recentGuidance
    .filter((item) => normalizeNullable(item.detail))
    .map((item, index) => ({
      category: "guidance",
      date: item.createdAt || now.toISOString(),
      detail: item.detail || null,
      id: item.id || `recent-guidance-${index}`,
      source: "furvise" as const,
      title: item.title || "Furvise summary",
    }));
  const allEntries = [...ownerEntries, ...guidanceEntries].sort(compareTimelineNewestFirst);
  const recentEntries = allEntries.slice(0, 10);
  const entriesLast7Days = allEntries.filter((entry) => isWithinDays(entry.date, now, 7));
  const entriesLast30Days = allEntries.filter((entry) => isWithinDays(entry.date, now, 30));

  const savedDetails = savedMemories
    .filter((memory) => normalizeNullable(memory.text))
    .map((memory) => ({
      createdAt: memory.created_at,
      id: memory.id,
      label: memory.type || "Saved detail",
      source: normalizeMemorySource(memory.source),
      value: normalizeText(memory.text),
    }));

  const mappedFeedback = productFeedback.map((feedback) => ({
    createdAt: feedback.created_at,
    note: feedback.note,
    productId: feedback.product_id,
    status: feedback.feedback_type,
  }));

  const knownAvoids = normalizeList([
    ...pet.avoidIngredients,
    ...mappedFeedback
      .filter((feedback) => feedback.status === "avoid_product")
      .map((feedback) => feedback.note || feedback.productId),
  ]);

  const safetyFlags = detectSafetyFlagsFromText([
    pet.mainConcern,
    pet.currentFood,
    ...pet.avoidIngredients,
    ...recentEntries.flatMap((entry) => [entry.title, entry.detail]),
    ...savedDetails.map((detail) => detail.value),
  ]);
  const missingContext = deriveMissingContext(pet, recentEntries);
  const recentChanges = deriveRecentChanges(recentEntries);
  const recurringConcerns = deriveRecurringConcerns(recentEntries, savedDetails);
  const summaryBullets = buildSummaryBullets(pet, recentEntries, entriesLast7Days, missingContext, safetyFlags);

  return {
    pet,
    timeline: {
      recentEntries,
      recallEntries: allEntries,
      entriesLast7Days,
      entriesLast30Days,
    },
    savedDetails,
    productFeedback: mappedFeedback,
    derived: {
      recentChanges,
      recurringConcerns,
      knownAvoids,
      safetyFlags,
      missingContext,
      summaryBullets,
    },
  };
}

export async function loadPetMemoryContext({
  petId,
  supabase,
  userId,
}: LoadPetMemoryInput): Promise<PetMemoryContext> {
  const { data: profile, error: profileError } = await supabase
    .from("dog_profiles")
    .select("*")
    .eq("id", petId)
    .eq("user_id", userId)
    .single<DogProfileRow>();

  if (profileError || !profile) {
    throw new Error("Furvise could not load this pet profile.");
  }

  const [entriesResult, memoriesResult, feedbackResult] = await Promise.all([
    supabase
      .from("pet_care_entries")
      .select("*")
      .eq("pet_profile_id", petId)
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(60)
      .returns<CareEntryRow[]>(),
    supabase
      .from("dog_memories")
      .select("*")
      .eq("dog_profile_id", petId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(60)
      .returns<DogMemoryRow[]>(),
    supabase
      .from("dog_product_feedback")
      .select("*")
      .eq("dog_profile_id", petId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(60)
      .returns<DogProductFeedbackRow[]>(),
  ]);

  if (entriesResult.error) throw new Error("Furvise could not load care updates.");
  if (memoriesResult.error) throw new Error("Furvise could not load saved details.");
  if (feedbackResult.error) throw new Error("Furvise could not load product feedback.");

  return buildPetMemoryContext({
    careEntries: entriesResult.data || [],
    productFeedback: feedbackResult.data || [],
    profile,
    savedMemories: memoriesResult.data || [],
  });
}

export function getEntriesInDateRange(
  memory: PetMemoryContext,
  startDate: Date | string,
  endDate: Date | string,
) {
  const start = startOfDay(new Date(startDate)).getTime();
  const end = endOfDay(new Date(endDate)).getTime();
  return memory.timeline.recallEntries.filter((entry) => {
    const value = new Date(entry.date).getTime();
    return value >= start && value <= end;
  });
}

export function getLastWeekDateRange(now = new Date()) {
  const today = startOfDay(now);
  const day = today.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() - daysSinceMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setUTCDate(thisMonday.getUTCDate() - 1);
  return { end: endOfDay(lastSunday), start: startOfDay(lastMonday) };
}

export function classifyAskMemoryIntent(question: string): AskMemoryIntent {
  const normalized = question.toLowerCase();
  if (/\b(last week|previous week|past week)\b/.test(normalized) && /\b(log|logged|update|note|record)\b/.test(normalized)) {
    return "last_week_logs";
  }
  if (/\b(vet|veterinarian|appointment)\b/.test(normalized) || /\bwhat should i tell\b/.test(normalized)) {
    return "vet_prep";
  }
  if (/\b(food|ate|eat|diet|chicken|kibble|meal|appetite)\b/.test(normalized)) {
    return "food_notes";
  }
  if (/\b(symptom|scratch|itch|lick|vomit|diarrhea|cough|pain|skin|paw|ear)\b/.test(normalized)) {
    return "symptom_notes";
  }
  if (/\b(product|feedback|worked|tried|saved|avoid product|too expensive)\b/.test(normalized)) {
    return "product_feedback_summary";
  }
  if (/\b(summarize|summary|recent changes|changed|what changed|recent history)\b/.test(normalized)) {
    return "recent_summary";
  }
  return "general_pet_question";
}

export function answerPetMemoryQuestion(
  memory: PetMemoryContext,
  question: string,
  now = new Date(),
) {
  const questionSafetyFlags = detectSafetyFlags(memory, question);
  if (questionSafetyFlags.length > 0) {
    return {
      response: buildUrgentMemoryResponse(questionSafetyFlags),
      urgent: true,
      intent: classifyAskMemoryIntent(question),
    };
  }

  const intent = classifyAskMemoryIntent(question);
  if (isCauseStyleQuestion(question)) {
    return {
      response: buildCauseBoundaryAnswer(memory),
      urgent: false,
      intent,
    };
  }

  const response =
    intent === "last_week_logs"
      ? buildLastWeekLogsAnswer(memory, now)
      : intent === "food_notes"
        ? summarizeFoodNotes(memory)
        : intent === "symptom_notes"
          ? summarizeSymptomNotes(memory, question)
          : intent === "vet_prep"
            ? buildVetPrepSummary(memory)
            : intent === "product_feedback_summary"
              ? summarizeProductFeedback(memory)
              : intent === "recent_summary"
                ? summarizeRecentChanges(memory)
                : buildGeneralMemoryAnswer(memory, question);

  return { response, urgent: false, intent };
}

export function shouldUseGroundedAskFallback(memory: PetMemoryContext, question: string) {
  return (
    classifyAskMemoryIntent(question) === "general_pet_question" &&
    detectSafetyFlags(memory, question).length === 0 &&
    !isCauseStyleQuestion(question)
  );
}

function isCauseStyleQuestion(question: string) {
  return /\b(what.*caus|why is|why did|could.*be|does this mean|may indicate|possible cause)\b/i.test(question);
}

function buildCauseBoundaryAnswer(memory: PetMemoryContext) {
  return {
    title: `${memory.pet.name}'s care context`,
    summary:
      `${FURVISE_SAFETY_LINE} Based on saved notes, these are details worth tracking and asking your vet about.`,
    sections: [
      {
        heading: "What to track",
        items: buildMemoryLogNextItems(memory),
      },
      {
        heading: "What to ask the vet",
        items: buildMemoryVetQuestions(memory),
      },
    ],
    safetyNote: buildSafetyNote(memory),
  };
}

export function detectSafetyFlags(memory: PetMemoryContext, extraText = "") {
  return detectSafetyFlagsFromText([
    extraText,
    ...memory.derived.safetyFlags,
    memory.pet.mainConcern,
    ...memory.timeline.recentEntries.flatMap((entry) => [entry.title, entry.detail]),
    ...memory.savedDetails.map((detail) => detail.value),
  ]);
}

export function summarizeRecentChanges(memory: PetMemoryContext) {
  if (memory.timeline.recentEntries.length === 0) {
    return {
      title: `${memory.pet.name}'s recent changes`,
      summary: `Furvise has ${memory.pet.name}'s profile, but no recent care updates yet.`,
      sections: [
        {
          heading: "What is saved",
          items: memory.derived.summaryBullets.slice(0, 4),
        },
        {
          heading: "Missing context",
          items: memory.derived.missingContext.slice(0, 4),
        },
      ].filter((section) => section.items.length > 0),
      safetyNote: buildSafetyNote(memory),
    };
  }

  return {
    title: `${memory.pet.name}'s recent changes`,
    summary: `I found ${memory.timeline.recentEntries.length} recent saved update${memory.timeline.recentEntries.length === 1 ? "" : "s"} for ${memory.pet.name}.`,
    sections: [
      {
        heading: "Latest updates",
        items: memory.timeline.recentEntries.slice(0, 5).map(formatEntryForRecall),
      },
      {
        heading: "Patterns Furvise can use",
        items: [...memory.derived.recentChanges, ...memory.derived.recurringConcerns].slice(0, 5),
      },
      {
        heading: "Missing context",
        items: memory.derived.missingContext.slice(0, 4),
      },
    ].filter((section) => section.items.length > 0),
    safetyNote: buildSafetyNote(memory),
  };
}

export function summarizeFoodNotes(memory: PetMemoryContext) {
  const foodEntries = memory.timeline.recallEntries.filter(isPrimaryFoodUpdateEntry);
  const relatedMealEntries = memory.timeline.recallEntries.filter(isRelatedMealTimeEntry);
  const profileItems = [
    memory.pet.currentFood ? `Current food in profile: ${memory.pet.currentFood}.` : "",
    memory.pet.avoidIngredients.length
      ? `Saved avoid ingredients: ${formatList(memory.pet.avoidIngredients)}.`
      : "",
  ].filter(Boolean);

  return {
    title: `${memory.pet.name}'s food notes`,
    summary: buildFoodNotesSummary(memory, profileItems.length, foodEntries.length, relatedMealEntries.length),
    sections: [
      { heading: "Profile food context", items: profileItems },
      { heading: "Saved food updates", items: foodEntries.slice(0, 6).map(formatEntryForRecall) },
      { heading: "Related appetite or meal-time updates", items: relatedMealEntries.slice(0, 6).map(formatEntryForRecall) },
      { heading: "Missing context", items: memory.derived.missingContext.filter((item) => /food|care update/i.test(item)) },
    ].filter((section) => section.items.length > 0),
    safetyNote: buildSafetyNote(memory),
  };
}

export function summarizeSymptomNotes(memory: PetMemoryContext, question = "") {
  const symptomEntries = filterEntriesByTerms(memory, [
    "symptom",
    "skin",
    "scratch",
    "itch",
    "lick",
    "paw",
    "vomit",
    "diarrhea",
    "cough",
    "pain",
    "ear",
  ]);
  const normalizedQuestion = question.toLowerCase();
  const askedAboutVomiting = /\b(vomit|vomited|throw up|threw up)\b/.test(normalizedQuestion);
  const vomitingEntries = filterEntriesByTerms(memory, ["vomit", "vomited", "throw up", "threw up"]);

  if (askedAboutVomiting && vomitingEntries.length === 0) {
    return {
      title: `${memory.pet.name}'s symptom notes`,
      summary: `I do not see saved vomiting logs for ${memory.pet.name}.`,
      sections: symptomEntries.length
        ? [{ heading: "Other symptom-related updates", items: symptomEntries.slice(0, 5).map(formatEntryForRecall) }]
        : [],
      safetyNote: buildSafetyNote(memory),
    };
  }

  return {
    title: `${memory.pet.name}'s symptom notes`,
    summary:
      symptomEntries.length > 0
        ? `I found ${symptomEntries.length} saved symptom-related update${symptomEntries.length === 1 ? "" : "s"} for ${memory.pet.name}.`
        : `I do not see saved symptom notes for ${memory.pet.name} yet.`,
    sections: [
      { heading: "Saved symptom-related updates", items: symptomEntries.slice(0, 6).map(formatEntryForRecall) },
      { heading: "Profile concern", items: memory.pet.mainConcern ? [memory.pet.mainConcern] : [] },
      { heading: "Missing context", items: memory.derived.missingContext.slice(0, 4) },
    ].filter((section) => section.items.length > 0),
    safetyNote: buildSafetyNote(memory),
  };
}

export function buildVetPrepSummary(memory: PetMemoryContext) {
  return {
    title: `Vet prep for ${memory.pet.name}`,
    summary: `Use these saved facts and recent logs to prepare a clear vet summary for ${memory.pet.name}.`,
    sections: [
      {
        heading: "Saved profile facts",
        items: [
          memory.pet.species ? `Species: ${memory.pet.species}.` : "",
          memory.pet.breed ? `Breed: ${memory.pet.breed}.` : "",
          memory.pet.ageLabel ? `Age: ${memory.pet.ageLabel}.` : "",
          memory.pet.weightLabel ? `Weight: ${memory.pet.weightLabel}.` : "",
          memory.pet.mainConcern ? `Main concern: ${memory.pet.mainConcern}.` : "",
          memory.pet.currentFood ? `Current food: ${memory.pet.currentFood}.` : "",
          memory.pet.avoidIngredients.length
            ? `Avoid ingredients: ${formatList(memory.pet.avoidIngredients)}.`
            : "",
        ].filter(Boolean),
      },
      {
        heading: "Recent saved updates",
        items:
          memory.timeline.recentEntries.length > 0
            ? memory.timeline.recentEntries.slice(0, 6).map(formatEntryForRecall)
            : [`Furvise does not have care updates for ${memory.pet.name} yet.`],
      },
      {
        heading: "What to ask the vet",
        items: buildVetPrepQuestions(memory),
      },
      {
        heading: "Helpful context still missing",
        items: buildVetPrepMissingContext(memory),
      },
    ].filter((section) => section.items.length > 0),
    safetyNote: buildVetPrepSafetyNote(memory),
  };
}

export function buildDashboardNextStep(memory: PetMemoryContext) {
  if (memory.derived.safetyFlags.length > 0) {
    return {
      missingContext: [],
      description: `Saved context mentions ${formatList(memory.derived.safetyFlags)}. Furvise does not diagnose; urgent warning signs should be reviewed by a veterinarian now.`,
      title: `Contact a veterinarian for ${memory.pet.name}`,
    };
  }

  if (memory.timeline.recentEntries.length === 0) {
    return {
      missingContext: memory.derived.missingContext.slice(0, 3),
      description: "Start with one quick note about food, appetite, activity, or symptoms.",
      title: `Keep logging ${memory.pet.name}'s changes`,
    };
  }

  const latest = memory.timeline.recentEntries[0];
  const missing = memory.derived.missingContext.slice(0, 2);
  return {
    missingContext: missing,
    description: `Latest update: ${latest.title}. ${buildCareNextStep(memory)}`,
    title: `${memory.pet.name}'s memory is current`,
  };
}

export function buildResultsUnderstanding(memory: PetMemoryContext) {
  return {
    careHistory:
      memory.timeline.recentEntries.filter((entry) => entry.source === "owner").length > 0
        ? memory.timeline.recentEntries.filter((entry) => entry.source === "owner").slice(0, 4).map(formatEntryForRecall)
        : [`Furvise does not have care updates for ${memory.pet.name} yet.`],
    missingContext: memory.derived.missingContext,
    profileFacts: [
      memory.pet.species ? `${memory.pet.name} is saved as a ${memory.pet.species}.` : "",
      memory.pet.breed ? `Breed: ${memory.pet.breed}.` : "",
      memory.pet.ageLabel ? `Age: ${memory.pet.ageLabel}.` : "",
      memory.pet.weightLabel ? `Weight: ${memory.pet.weightLabel}.` : "",
      memory.pet.mainConcern ? `Main concern: ${memory.pet.mainConcern}.` : "",
      memory.pet.currentFood ? `Current food: ${memory.pet.currentFood}.` : "",
    ].filter(Boolean),
    productGuidanceAllowed: memory.derived.safetyFlags.length === 0,
    recentChanges: memory.derived.recentChanges,
    savedAvoids: memory.derived.knownAvoids,
    safetyFlags: memory.derived.safetyFlags,
  };
}

function buildLastWeekLogsAnswer(memory: PetMemoryContext, now: Date) {
  const { end, start } = getLastWeekDateRange(now);
  const entries = getEntriesInDateRange(memory, start, end).filter((entry) => entry.source === "owner");
  return {
    title: `${memory.pet.name}'s logs from last week`,
    summary:
      entries.length > 0
        ? `I found ${entries.length} saved update${entries.length === 1 ? "" : "s"} for ${memory.pet.name} from last week.`
        : `I do not see any saved care updates for ${memory.pet.name} from last week.`,
    sections: entries.length
      ? [{ heading: "Saved updates", items: entries.map(formatEntryForRecall) }]
      : [],
    safetyNote: buildSafetyNote(memory),
  };
}

function summarizeProductFeedback(memory: PetMemoryContext) {
  return {
    title: `${memory.pet.name}'s product feedback`,
    summary:
      memory.productFeedback.length > 0
        ? `I found ${memory.productFeedback.length} saved product feedback item${memory.productFeedback.length === 1 ? "" : "s"} for ${memory.pet.name}.`
        : `I do not see saved product feedback for ${memory.pet.name} yet.`,
    sections: memory.productFeedback.length
      ? [
          {
            heading: "Saved product feedback",
            items: memory.productFeedback.slice(0, 8).map((item) =>
              `${formatDate(item.createdAt)} - ${item.productId}: ${formatFeedbackStatus(item.status)}${item.note ? ` - ${item.note}` : ""}`,
            ),
          },
        ]
      : [],
    safetyNote: buildSafetyNote(memory),
  };
}

function buildGeneralMemoryAnswer(memory: PetMemoryContext, question: string) {
  const normalized = question.toLowerCase();
  if (/\b(vomit|vomited|throw up|threw up)\b/.test(normalized)) {
    return summarizeSymptomNotes(memory, question);
  }

  return {
    title: `${memory.pet.name}'s saved context`,
    summary: `I can answer best from saved memory. Furvise has ${memory.pet.name}'s profile${memory.timeline.recentEntries.length ? ` and ${memory.timeline.recentEntries.length} recent update${memory.timeline.recentEntries.length === 1 ? "" : "s"}` : ", but no recent care updates yet"}.`,
    sections: [
      { heading: "What is saved", items: memory.derived.summaryBullets.slice(0, 5) },
      { heading: "Recent updates", items: memory.timeline.recentEntries.slice(0, 4).map(formatEntryForRecall) },
      { heading: "Missing context", items: memory.derived.missingContext.slice(0, 4) },
    ].filter((section) => section.items.length > 0),
    safetyNote: buildSafetyNote(memory),
  };
}

function buildFoodNotesSummary(
  memory: PetMemoryContext,
  profileItemCount: number,
  foodEntryCount: number,
  relatedMealEntryCount: number,
) {
  if (profileItemCount || foodEntryCount) {
    return `Here is the saved food context I found for ${memory.pet.name}.`;
  }
  if (relatedMealEntryCount) {
    return `I do not see saved food updates for ${memory.pet.name} yet, but I found related appetite or meal-time updates.`;
  }
  return `I do not see saved food notes for ${memory.pet.name} yet.`;
}

function buildUrgentMemoryResponse(flags: string[]) {
  return {
    title: "Contact a veterinarian now",
    summary:
      "The saved context or question includes urgent warning signs. Contact an emergency veterinarian now.",
    sections: [
      {
        heading: "Urgent signs detected",
        items: flags,
      },
    ],
    safetyNote:
      `${FURVISE_SAFETY_LINE} ${FURVISE_URGENT_SAFETY_MESSAGE}`,
  };
}

function buildSafetyNote(memory: PetMemoryContext) {
  if (memory.derived.safetyFlags.length === 0) return null;
  return `Urgent safety flags in saved context: ${formatList(memory.derived.safetyFlags)}. Contact a veterinarian and do not use product shopping as a substitute for care.`;
}

function buildCareNextStep(memory: PetMemoryContext) {
  const latestText = memory.timeline.recentEntries
    .slice(0, 4)
    .map((entry) => `${entry.title} ${entry.detail || ""}`)
    .join(" ")
    .toLowerCase();
  if (/food|chicken|diet|meal|appetite/.test(latestText)) {
    return "Keep logging food changes and symptoms so Furvise can compare patterns over time.";
  }
  if (/scratch|itch|skin|lick|paw/.test(latestText)) {
    return "Keep logging skin symptoms, timing, and any food or grooming changes.";
  }
  return "Add another note when food, appetite, activity, symptoms, or behavior changes.";
}

function buildMemoryLogNextItems(memory: PetMemoryContext) {
  const text = [
    memory.pet.mainConcern || "",
    ...memory.timeline.recentEntries.slice(0, 4).flatMap((entry) => [entry.category, entry.title, entry.detail || ""]),
  ]
    .join(" ")
    .toLowerCase();
  return [
    memory.timeline.recentEntries.some((entry) => entry.source === "owner")
      ? "Whether the latest logged issue repeats, improves, or changes."
      : "One quick note about food, appetite, activity, symptoms, or behavior.",
    /\b(food|diet|meal|chicken|appetite|water|stool|vomit|diarrhea)\b/.test(text)
      ? "Food eaten before the concern appeared, plus appetite, water intake, and stool changes."
      : "",
    /\b(scratch|itch|skin|paw|lick|ear|redness)\b/.test(text)
      ? "Skin redness, paw licking, ear irritation, and time of day."
      : "",
    "Photos or concise notes before a vet visit, if relevant.",
  ].filter(Boolean);
}

function buildMemoryVetQuestions(memory: PetMemoryContext) {
  const text = `${memory.pet.mainConcern || ""} ${memory.timeline.recentEntries
    .slice(0, 4)
    .map((entry) => `${entry.category} ${entry.title} ${entry.detail || ""}`)
    .join(" ")}`.toLowerCase();
  return [
    "What symptoms would make this urgent?",
    /\b(scratch|itch|skin|paw|lick|ear|food|diet|meal)\b/.test(text)
      ? "Are diet, fleas, or environmental triggers worth checking?"
      : "",
    "What details should I bring to the appointment?",
    "Should I track timing, photos, appetite, water intake, or stool changes?",
  ].filter(Boolean);
}

function buildVetPrepQuestions(memory: PetMemoryContext) {
  const signals = getVetPrepSignals(memory);
  const questions = [];

  if (signals.behavior) {
    questions.push(
      "Could this change in activity or mood be related to pain, stress, illness, or appetite changes?",
      "What signs would make this urgent?",
      "What should I track over the next 24-48 hours?",
    );
  }

  if (signals.food) {
    questions.push(
      "Could the appetite, water intake, stool, or vomiting changes be related to recent food, treat, or diet changes?",
    );
  }

  if (signals.skin) {
    questions.push(
      "What symptoms would make scratching or paw licking urgent?",
      "Should I track food changes, skin redness, paw licking, ears, stool, or appetite before the visit?",
    );
  } else if (signals.grooming) {
    questions.push(
      "Could grooming, bathing, brushing, or coat-care products be irritating the skin?",
      "Should I track skin tolerance, redness, timing, and any grooming products used before the visit?",
    );
  } else if (signals.food) {
    questions.push(
      "Should I track appetite, water intake, stool, or vomiting before the visit?",
    );
  }

  if (signals.food && /\b(chicken|food|diet|kibble|meal|treat)\b/i.test(getVetPrepContextText(memory))) {
    questions.push("Should I keep tracking reactions after chicken-based food or diet changes?");
  }

  if (questions.length === 0) {
    questions.push(
      "What signs would make this urgent?",
      "What details should I track before the visit?",
    );
  }

  questions.push("Could you help me decide what details are most useful to log next?");
  return uniqueNonEmptyStrings(questions);
}

function getVetPrepSignals(memory: PetMemoryContext) {
  const recentEntries = memory.timeline.recentEntries
    .filter((entry) => entry.source === "owner")
    .slice(0, 6);
  const recentSignals = recentEntries.reduce(
    (signals, entry) => mergeVetPrepSignals(signals, getVetPrepSignalsForText(formatVetPrepEntryText(entry))),
    createVetPrepSignals(),
  );

  if (hasVetPrepSignal(recentSignals)) return recentSignals;

  return getVetPrepSignalsForText(getVetPrepContextText(memory));
}

function getVetPrepContextText(memory: PetMemoryContext) {
  return [
    memory.pet.mainConcern || "",
    memory.pet.currentFood || "",
    ...memory.pet.avoidIngredients,
    ...memory.timeline.recentEntries.slice(0, 6).map(formatVetPrepEntryText),
    ...memory.savedDetails.map((detail) => detail.value),
  ].join(" ");
}

function formatVetPrepEntryText(entry: PetMemoryTimelineEntry) {
  return `${entry.category} ${entry.title} ${entry.detail || ""}`;
}

function getVetPrepSignalsForText(value: string) {
  const text = value.toLowerCase();
  return {
    behavior: /\b(behavior|behaviour|mood|sad|depressed|quiet|withdrawn|hiding|anxious|anxiety|stress|stressed|sitting|resting|sleeping|lethargic|low energy|less active|barely moving|not moving|low activity)\b/.test(text),
    food: /\b(food|appetite|ate|eat|eating|meal|breakfast|dinner|lunch|diet|kibble|treat|stool|poop|diarrhea|vomit|water|drank|drinking)\b/.test(text),
    grooming: /\b(groom|grooming|bath|bathe|bathing|shampoo|brush|brushing|nail|trim|clip|coat)\b/.test(text),
    skin: /\b(scratch|scratching|itch|itchy|paw|lick|licking|skin|ear|red|redness|rash|hot spot)\b/.test(text),
  };
}

function createVetPrepSignals() {
  return {
    behavior: false,
    food: false,
    grooming: false,
    skin: false,
  };
}

function mergeVetPrepSignals(
  left: ReturnType<typeof createVetPrepSignals>,
  right: ReturnType<typeof createVetPrepSignals>,
) {
  return {
    behavior: left.behavior || right.behavior,
    food: left.food || right.food,
    grooming: left.grooming || right.grooming,
    skin: left.skin || right.skin,
  };
}

function hasVetPrepSignal(signals: ReturnType<typeof createVetPrepSignals>) {
  return signals.behavior || signals.food || signals.grooming || signals.skin;
}

function uniqueNonEmptyStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function buildVetPrepMissingContext(memory: PetMemoryContext) {
  return [
    memory.pet.breed ? "" : "Breed",
    memory.pet.weightLabel ? "" : "Weight",
    memory.pet.currentFood ? "" : "Current food",
    memory.pet.avoidIngredients.length ? "" : "Avoid ingredients",
  ].filter(Boolean);
}

function buildVetPrepSafetyNote(memory: PetMemoryContext) {
  const urgentNote = buildSafetyNote(memory);
  return urgentNote ? `${FURVISE_SAFETY_LINE} ${urgentNote}` : FURVISE_SAFETY_LINE;
}

function mapCareEntryToTimelineEntry(entry: CareEntryRow): PetMemoryTimelineEntry {
  return {
    category: entry.category,
    date: entry.occurred_at,
    detail: normalizeNullable(entry.note),
    id: entry.id,
    source: isFurviseCareEntry(entry) ? "furvise" : "owner",
    title: normalizeNullable(entry.title) || formatCareCategory(entry.category),
  };
}

function isFurviseCareEntry(entry: CareEntryRow) {
  return (
    /^furvise guidance$/i.test(entry.title || "") ||
    /^furvise\b/i.test(entry.title || "") ||
    /^furvise-generated (guidance|note)/i.test(entry.note || "")
  );
}

function deriveMissingContext(pet: PetMemoryContext["pet"], entries: PetMemoryTimelineEntry[]) {
  const missing = [];
  if (!pet.species) missing.push("species");
  if (!pet.breed) missing.push("breed");
  if (!pet.ageLabel) missing.push("age");
  if (!pet.weightLabel) missing.push("weight");
  if (!pet.mainConcern) missing.push("main concern");
  if (!pet.currentFood) missing.push("current food");
  if (!pet.monthlyBudget) missing.push("monthly care budget");
  if (entries.filter((entry) => entry.source === "owner").length === 0) missing.push("recent care updates");
  return missing;
}

function deriveRecentChanges(entries: PetMemoryTimelineEntry[]) {
  return entries
    .filter((entry) => entry.source === "owner")
    .slice(0, 4)
    .map((entry) => `${formatCareCategory(entry.category)}: ${entry.title}${entry.detail ? ` - ${entry.detail}` : ""}.`);
}

function deriveRecurringConcerns(entries: PetMemoryTimelineEntry[], details: PetMemorySavedDetail[]) {
  const text = [
    ...entries.flatMap((entry) => [entry.category, entry.title, entry.detail || ""]),
    ...details.map((detail) => detail.value),
  ]
    .join(" ")
    .toLowerCase();
  const concerns = [
    [/\b(scratch|scratching|itch|itchy|lick|paw)\b/g, "Skin or paw irritation appears more than once."],
    [/\b(vomit|diarrhea|stomach|digest)\b/g, "Digestive context appears repeatedly."],
  ] as const;

  const derived: string[] = concerns
    .filter(([pattern]) => (text.match(pattern) || []).length >= 2)
    .map(([, label]) => label);
  if (hasRepeatedFoodOrAppetiteContext(entries, details)) {
    derived.push("Food or appetite context appears repeatedly.");
  }
  return derived;
}

function buildSummaryBullets(
  pet: PetMemoryContext["pet"],
  entries: PetMemoryTimelineEntry[],
  entriesLast7Days: PetMemoryTimelineEntry[],
  missingContext: string[],
  safetyFlags: string[],
) {
  return [
    `${pet.name}'s saved profile is available.`,
    pet.mainConcern ? `Main concern: ${pet.mainConcern}.` : "",
    pet.currentFood ? `Current food: ${pet.currentFood}.` : "",
    pet.avoidIngredients.length ? `Avoid ingredients: ${formatList(pet.avoidIngredients)}.` : "",
    entries.length
      ? `${entriesLast7Days.filter((entry) => entry.source === "owner").length} care update${entriesLast7Days.filter((entry) => entry.source === "owner").length === 1 ? "" : "s"} in the last 7 days.`
      : "No care updates logged yet.",
    missingContext.length ? `Missing context: ${formatList(missingContext.slice(0, 4))}.` : "",
    safetyFlags.length ? `Safety flags: ${formatList(safetyFlags)}.` : "",
  ].filter(Boolean);
}

function detectSafetyFlagsFromText(values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(" ");
  const flags = urgentSafetyPatterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);
  return [...new Set(flags)];
}

function filterEntriesByTerms(memory: PetMemoryContext, terms: string[]) {
  const patterns = terms.map((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i"));
  return memory.timeline.recallEntries.filter((entry) => {
    const text = `${entry.category} ${entry.title} ${entry.detail || ""}`;
    return patterns.some((pattern) => pattern.test(text));
  });
}

function isPrimaryFoodUpdateEntry(entry: PetMemoryTimelineEntry) {
  return /^food$/i.test(entry.category) || strongFoodUpdatePattern.test(entryTextForClassification(entry));
}

function isRelatedMealTimeEntry(entry: PetMemoryTimelineEntry) {
  return (
    /^(general|symptom)$/i.test(entry.category) &&
    !isPrimaryFoodUpdateEntry(entry) &&
    relatedMealTimePattern.test(entryTextForClassification(entry))
  );
}

function hasRepeatedFoodOrAppetiteContext(entries: PetMemoryTimelineEntry[], details: PetMemorySavedDetail[]) {
  const primaryFoodCount = entries.filter(isPrimaryFoodUpdateEntry).length;
  if (primaryFoodCount >= 2) return true;

  const relatedMealCount = entries.filter(isRelatedMealTimeEntry).length;
  if (primaryFoodCount >= 1 && relatedMealCount >= 1) return true;

  const savedText = details.map((detail) => detail.value).join(" ");
  return primaryFoodCount >= 1 && relatedMealTimePattern.test(savedText);
}

function entryTextForClassification(entry: PetMemoryTimelineEntry) {
  return `${entry.title} ${entry.detail || ""}`;
}

function formatEntryForRecall(entry: PetMemoryTimelineEntry) {
  return `${formatDate(entry.date)} - ${formatCareCategory(entry.category)} - ${entry.title}${entry.detail ? ` - ${entry.detail}` : ""}`;
}

function formatAgeLabel(profile: DogProfileRow) {
  if (typeof profile.age_value !== "number" || !Number.isFinite(profile.age_value)) return null;
  const unit = profile.age_unit === "months" ? "months" : "years";
  return `${profile.age_value} ${profile.age_value === 1 ? unit.slice(0, -1) : unit}`;
}

function formatWeightLabel(profile: DogProfileRow) {
  if (typeof profile.weight_value !== "number" || !Number.isFinite(profile.weight_value)) return null;
  const unit = profile.weight_unit === "kg" ? "kg" : "lb";
  return `${profile.weight_value} ${unit}`;
}

function formatCareCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFeedbackStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function normalizeMemorySource(source: string | null): "owner" | "furvise" {
  return source === "owner" || source === "manual" ? "owner" : "furvise";
}

function normalizeNullable(value: string | null | undefined) {
  const normalized = normalizeText(value || "");
  return normalized || null;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeList(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => normalizeText(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (!key || key === "none known" || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isWithinDays(value: string, now: Date, days: number) {
  const then = new Date(value).getTime();
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return then >= cutoff && then <= now.getTime();
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function compareTimelineNewestFirst(left: PetMemoryTimelineEntry, right: PetMemoryTimelineEntry) {
  return new Date(right.date).getTime() - new Date(left.date).getTime();
}

function formatList(values: string[]) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
