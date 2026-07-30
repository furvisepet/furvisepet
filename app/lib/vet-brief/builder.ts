import type { CareEntryRow, DogMemoryRow, DogProfileRow } from "../supabase";
import { formatSpecies } from "../petwise";
import { cleanVetBriefText, parseVetBriefDocument } from "./schema.ts";
import {
  VET_BRIEF_DISCLAIMER,
  VET_BRIEF_DOCUMENT_VERSION,
  type VetBriefConversationMessage,
  type VetBriefDocument,
} from "./types.ts";

type BuildVetBriefInput = {
  profile: DogProfileRow;
  careEntries: CareEntryRow[];
  memories: DogMemoryRow[];
  conversation?: VetBriefConversationMessage[];
  from: string;
  to: string;
  reasonForVisit?: string;
  generatedAt?: string;
};

export function buildVetBriefDraft(input: BuildVetBriefInput) {
  const conversation = sanitizeConversation(input.conversation || []);
  const reasonForVisit = cleanVetBriefText(input.reasonForVisit, 1200) || getConversationReason(conversation) || "Not recorded";
  const topicText = `${reasonForVisit} ${conversation.map(getConversationText).join(" ")}`.toLowerCase();
  const rangedEntries = input.careEntries
    .filter((entry) => isWithinDateRange(entry.occurred_at, input.from, input.to))
    .filter((entry) => !isDeletedOrGeneratedGuidance(entry));
  const relevantEntries = rangedEntries.filter((entry) => isRelevantEntry(entry, topicText));
  const relevantMemories = input.memories
    .filter((memory) => isWithinDateRange(memory.created_at, input.from, input.to))
    .filter((memory) => isRelevantMemory(memory, topicText));
  const generatedAt = input.generatedAt || new Date().toISOString();

  const medications = [
    ...relevantEntries
    .filter((entry) => entry.category === "medication")
    .map((entry) => datedOwnerItem(entry)),
    ...relevantMemories
      .filter((memory) => /\b(medication|medicine|supplement|vitamin)\b/i.test(`${memory.type || ""} ${memory.text}`))
      .map((memory) => datedSavedNote(memory)),
  ];
  const foodChanges = relevantEntries
    .filter((entry) => entry.category === "food" && /\b(change|changed|switch|switched|new|started|stopped|food|diet|meal|appetite)\b/i.test(entryText(entry)))
    .map((entry) => datedOwnerItem(entry));
  const productsUsed = relevantEntries
    .filter((entry) => entry.category !== "medication" && /\b(used|tried|applied|started|gave)\b/i.test(entryText(entry)) && /\b(product|shampoo|cleaner|balm|wipe|chew|supplement|food|spray|drops?)\b/i.test(entryText(entry)))
    .map((entry) => datedOwnerItem(entry));
  const concernTimeline = relevantEntries
    .filter((entry) => entry.category === "symptom" || entry.category === "behavior")
    .map((entry) => datedOwnerItem(entry));
  const ownerReportedChanges = [
    ...relevantEntries
      .filter((entry) => ["symptom", "behavior", "activity", "food", "grooming"].includes(entry.category))
      .map((entry) => datedOwnerItem(entry)),
    ...getConversationOwnerReports(conversation),
  ];
  const reportedPatterns = uniqueStrings([
    ...relevantEntries
      .filter((entry) => /\b(always|often|usually|every|after|before|repeated|again|each time|seems worse|seems better)\b/i.test(entryText(entry)))
      .map((entry) => `Owner reported: ${entryText(entry)}`),
    ...relevantMemories
      .filter((memory) => memory.source === "owner" || memory.source === "manual")
      .filter((memory) => /\b(always|often|usually|every|after|before|repeated|each time|pattern)\b/i.test(memory.text))
      .map((memory) => `Owner reported: ${cleanVetBriefText(memory.text)}`),
  ]);

  const document: VetBriefDocument = {
    documentVersion: VET_BRIEF_DOCUMENT_VERSION,
    title: "Furvise Vet Visit Brief",
    generatedAt,
    dateRange: { from: input.from, to: input.to },
    pet: {
      name: cleanVetBriefText(input.profile.name, 120) || "Not recorded",
      species: input.profile.species ? formatSpecies(input.profile.species) : "Not recorded",
      breed: cleanVetBriefText(input.profile.breed, 120) || "Not recorded",
      age: formatAge(input.profile),
      weight: formatWeight(input.profile),
      photoUrl: null,
    },
    reasonForVisit,
    ownerReportedChanges: uniqueDatedItems(ownerReportedChanges),
    concernTimeline: uniqueDatedItems(concernTimeline),
    foodChanges: uniqueDatedItems(foodChanges),
    productsUsed: uniqueDatedItems(productsUsed),
    medicationsSupplements: uniqueDatedItems(medications),
    relevantCareHistory: relevantEntries.map((entry) => ({
      category: formatCategory(entry.category),
      date: entry.occurred_at.slice(0, 10),
      text: `Saved care history shows: ${entryText(entry)}`,
    })),
    reportedPatterns,
    questionsForVeterinarian: getConversationQuestions(conversation),
    missingInformation: buildMissingInformation(input.profile, medications),
    ownerNotes: "",
    excludedSections: [],
    includePetPhoto: false,
    disclaimer: VET_BRIEF_DISCLAIMER,
  };
  const parsed = parseVetBriefDocument(document);
  if (!parsed) throw new Error("Vet brief draft validation failed.");
  return {
    document: parsed,
    sourceEntryIds: relevantEntries.map((entry) => entry.id),
  };
}

function isRelevantEntry(entry: CareEntryRow, topicText: string) {
  if (["symptom", "medication", "vet_visit"].includes(entry.category)) return true;
  if (!topicText.trim() || /\b(routine|wellness|checkup|check-up|annual)\b/.test(topicText)) return true;
  const terms = getTopicTerms(topicText);
  const text = entryText(entry).toLowerCase();
  if (terms.some((term) => text.includes(term))) return true;
  if (entry.category === "food" && /\b(food|diet|eat|meal|appetite|stomach|vomit|diarrhea)\b/.test(topicText)) return true;
  if (entry.category === "grooming" && /\b(skin|itch\w*|scratch\w*|paw|ear|groom\w*|coat|fur)\b/.test(topicText)) return true;
  if (entry.category === "behavior" && /\b(behavior|energy|sleep|mood|activity|pain)\b/.test(topicText)) return true;
  return false;
}

function getTopicTerms(value: string) {
  const stop = new Set(["about", "after", "before", "could", "furvise", "help", "owner", "pet", "rocky", "should", "their", "there", "these", "thing", "visit", "what", "when", "with", "would"]);
  return uniqueStrings(value.match(/[a-z]{4,}/g) || []).filter((term) => !stop.has(term)).slice(0, 24);
}

function isRelevantMemory(memory: DogMemoryRow, topicText: string) {
  if (!topicText.trim() || /\b(routine|wellness|checkup|check-up|annual)\b/.test(topicText)) return true;
  const text = `${memory.type || ""} ${memory.text}`.toLowerCase();
  return getTopicTerms(topicText).some((term) => text.includes(term));
}

function datedOwnerItem(entry: CareEntryRow) {
  const severity = entry.severity ? ` Severity recorded by owner: ${entry.severity}.` : "";
  return {
    date: entry.occurred_at.slice(0, 10),
    text: `Owner reported: ${entryText(entry)}${severity}`,
  };
}

function datedSavedNote(memory: DogMemoryRow) {
  return {
    date: memory.created_at?.slice(0, 10) || "Date unknown",
    text: `Saved note shows: ${cleanVetBriefText(memory.text)}`,
  };
}

function getConversationOwnerReports(conversation: VetBriefConversationMessage[]) {
  return conversation
    .filter((message) => message.role === "user" && typeof message.text === "string")
    .map((message) => cleanVetBriefText(message.text, 1200))
    .filter((text) => /\b(my pet|my dog|my cat|he |she |they |has |have |noticed|seems?|started|stopped|changed|worse|better|vomit|itch|scratch|pain|appetite|energy|stool|sleep)\b/i.test(text))
    .map((text) => ({ date: "Date unknown", text: `Owner reported: ${text}` }));
}

function getConversationQuestions(conversation: VetBriefConversationMessage[]) {
  const questions: string[] = [];
  for (const message of conversation) {
    if (message.role !== "furvise" || message.response?.urgency === "urgent") continue;
    for (const section of message.response?.sections || []) {
      if (!/question|ask.*vet|bring up/i.test(section.heading || "")) continue;
      for (const item of section.items || []) questions.push(cleanVetBriefText(item, 500));
    }
  }
  return uniqueStrings(questions).slice(0, 12);
}

function getConversationReason(conversation: VetBriefConversationMessage[]) {
  return [...conversation].reverse().find((message) => message.role === "user" && message.text?.trim())?.text?.trim() || "";
}

function sanitizeConversation(value: VetBriefConversationMessage[]) {
  return value.slice(-20).map((message) => ({
    role: message.role === "furvise" ? "furvise" as const : "user" as const,
    text: typeof message.text === "string" ? cleanVetBriefText(message.text, 1200) : undefined,
    response: message.response && typeof message.response === "object" ? {
      answerType: cleanVetBriefText(message.response.answerType, 80),
      directAnswer: cleanVetBriefText(message.response.directAnswer, 1200),
      urgency: cleanVetBriefText(message.response.urgency, 40),
      sections: Array.isArray(message.response.sections) ? message.response.sections.slice(0, 8).map((section) => ({
        heading: cleanVetBriefText(section.heading, 120),
        items: Array.isArray(section.items) ? section.items.slice(0, 12).map((item) => cleanVetBriefText(item, 500)) : [],
      })) : [],
    } : undefined,
  }));
}

function buildMissingInformation(profile: DogProfileRow, medications: Array<{ date: string; text: string }>) {
  const missing: string[] = [];
  if (!profile.breed?.trim()) missing.push("Breed: Not recorded");
  if (profile.age_value === null) missing.push("Age: Not recorded");
  if (profile.weight_value === null) missing.push("Weight: Not recorded");
  if (!profile.current_food?.trim()) missing.push("Current food: Not recorded");
  if (!medications.length) missing.push("Current medication not saved");
  return missing;
}

function formatAge(profile: DogProfileRow) {
  return profile.age_value === null || !profile.age_unit ? "Not recorded" : `${profile.age_value} ${profile.age_unit}`;
}

function formatWeight(profile: DogProfileRow) {
  return profile.weight_value === null || !profile.weight_unit ? "Not recorded" : `${profile.weight_value} ${profile.weight_unit}`;
}

function formatCategory(value: string) {
  return value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function entryText(entry: CareEntryRow) {
  return cleanVetBriefText([entry.title, entry.note].filter(Boolean).join(" - "), 1200);
}

function isWithinDateRange(value: string, from: string, to: string) {
  const date = value.slice(0, 10);
  return date >= from && date <= to;
}

function isDeletedOrGeneratedGuidance(entry: CareEntryRow) {
  return /^furvise\b/i.test(entry.title || "") || /^furvise-generated/i.test(entry.note || "");
}

function getConversationText(message: VetBriefConversationMessage) {
  return message.text || message.response?.directAnswer || "";
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniqueDatedItems<T extends { date: string; text: string }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.date}|${item.text}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
