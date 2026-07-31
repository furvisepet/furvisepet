import {
  VET_BRIEF_DISCLAIMER,
  VET_BRIEF_DOCUMENT_VERSION,
  type VetBriefDatedItem,
  type VetBriefDocument,
  type VetBriefHistoryItem,
} from "./types.ts";

const MAX_TEXT = 1200;
const MAX_ITEMS = 80;
const SECTION_IDS = new Set(["visit-reason", "changes-noticed", "timeline", "food-products", "medications", "care-history", "questions", "owner-notes"]);

export function parseVetBriefDocument(value: unknown): VetBriefDocument | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<VetBriefDocument>;
  if (
    draft.documentVersion !== VET_BRIEF_DOCUMENT_VERSION ||
    typeof draft.title !== "string" ||
    typeof draft.generatedAt !== "string" ||
    !isDateRange(draft.dateRange) ||
    !draft.pet ||
    typeof draft.pet !== "object" ||
    typeof draft.reasonForVisit !== "string" ||
    typeof draft.ownerNotes !== "string" ||
    typeof draft.includePetPhoto !== "boolean" ||
    draft.disclaimer !== VET_BRIEF_DISCLAIMER
  ) return null;

  const pet = draft.pet as VetBriefDocument["pet"];
  if (
    ![pet.name, pet.species, pet.breed, pet.age, pet.weight].every((item) => typeof item === "string") ||
    (pet.photoUrl !== null && typeof pet.photoUrl !== "string")
  ) return null;

  const ownerReportedChanges = parseDatedItems(draft.ownerReportedChanges);
  const concernTimeline = parseDatedItems(draft.concernTimeline);
  const foodChanges = parseDatedItems(draft.foodChanges);
  const productsUsed = parseDatedItems(draft.productsUsed);
  const medicationsSupplements = parseDatedItems(draft.medicationsSupplements);
  const relevantCareHistory = parseHistoryItems(draft.relevantCareHistory);
  const reportedPatterns = parseStrings(draft.reportedPatterns);
  const questionsForVeterinarian = parseStrings(draft.questionsForVeterinarian);
  const missingInformation = parseStrings(draft.missingInformation);
  if (
    !ownerReportedChanges || !concernTimeline || !foodChanges || !productsUsed ||
    !medicationsSupplements || !relevantCareHistory || !reportedPatterns ||
    !questionsForVeterinarian || !missingInformation
  ) return null;

  const photoUrl = pet.photoUrl && isSafePrivatePhotoUrl(pet.photoUrl) ? pet.photoUrl : null;
  return {
    documentVersion: VET_BRIEF_DOCUMENT_VERSION,
    title: cleanText(draft.title, 160) || "Furvise Vet Visit Brief",
    generatedAt: normalizeDateTime(draft.generatedAt),
    dateRange: { from: draft.dateRange.from, to: draft.dateRange.to },
    pet: {
      name: cleanText(pet.name, 120) || "Not recorded",
      species: cleanText(pet.species, 80) || "Not recorded",
      breed: cleanText(pet.breed, 120) || "Not recorded",
      age: cleanText(pet.age, 80) || "Not recorded",
      weight: cleanText(pet.weight, 80) || "Not recorded",
      photoUrl,
    },
    reasonForVisit: cleanText(draft.reasonForVisit, MAX_TEXT) || "Not recorded",
    ownerReportedChanges,
    concernTimeline,
    foodChanges,
    productsUsed,
    medicationsSupplements,
    relevantCareHistory,
    reportedPatterns,
    questionsForVeterinarian,
    missingInformation,
    ownerNotes: cleanText(draft.ownerNotes, 4000),
    excludedSections: Array.isArray(draft.excludedSections)
      ? [...new Set(draft.excludedSections.filter((item): item is VetBriefDocument["excludedSections"][number] => typeof item === "string" && SECTION_IDS.has(item)))]
      : [],
    includePetPhoto: Boolean(draft.includePetPhoto && photoUrl),
    disclaimer: VET_BRIEF_DISCLAIMER,
  };
}

export function getVetBriefFilename(petName: string, generatedAt: string) {
  const slug = cleanText(petName, 100)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "pet";
  const date = /^\d{4}-\d{2}-\d{2}/.exec(generatedAt)?.[0] || new Date().toISOString().slice(0, 10);
  return `furvise-vet-brief-${slug}-${date}.pdf`;
}

function parseDatedItems(value: unknown): VetBriefDatedItem[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const items: VetBriefDatedItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const draft = item as Partial<VetBriefDatedItem>;
    if (typeof draft.date !== "string" || typeof draft.text !== "string") return null;
    const text = cleanText(draft.text, MAX_TEXT);
    if (text) items.push({ date: normalizeDisplayDate(draft.date), text });
  }
  return items;
}

function parseHistoryItems(value: unknown): VetBriefHistoryItem[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const items: VetBriefHistoryItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const draft = item as Partial<VetBriefHistoryItem>;
    if (typeof draft.date !== "string" || typeof draft.text !== "string" || typeof draft.category !== "string") return null;
    const text = cleanText(draft.text, MAX_TEXT);
    if (text) items.push({ date: normalizeDisplayDate(draft.date), category: cleanText(draft.category, 80), text });
  }
  return items;
}

function parseStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS || !value.every((item) => typeof item === "string")) return null;
  return value.map((item) => cleanText(item, MAX_TEXT)).filter(Boolean);
}

function isDateRange(value: unknown): value is { from: string; to: string } {
  if (!value || typeof value !== "object") return false;
  const range = value as { from?: unknown; to?: unknown };
  return typeof range.from === "string" && typeof range.to === "string" && isIsoDate(range.from) && isIsoDate(range.to) && range.from <= range.to;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function normalizeDisplayDate(value: string) {
  return isIsoDate(value) ? value : "Date unknown";
}

function normalizeDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function isSafePrivatePhotoUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname.includes("/storage/v1/object/sign/");
  } catch {
    return false;
  }
}

export function cleanVetBriefText(value: unknown, maxLength = MAX_TEXT) {
  return cleanText(value, maxLength);
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[*`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
