import type { VetBriefDocument } from "../vet-brief/types";

const datedItem = {
  type: "object", additionalProperties: false, required: ["date", "text"],
  properties: { date: { type: "string" }, text: { type: "string", maxLength: 1200 } },
} as const;
const historyItem = {
  type: "object", additionalProperties: false, required: ["date", "category", "text"],
  properties: { date: { type: "string" }, category: { type: "string", maxLength: 80 }, text: { type: "string", maxLength: 1200 } },
} as const;
const stringList = (maxItems: number) => ({ type: "array", maxItems, items: { type: "string", maxLength: 1200 } });

export const intelligenceVetBriefJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["document", "sourceRecordIds", "confidence"],
  properties: {
    document: {
      type: "object", additionalProperties: false,
      required: ["documentVersion", "title", "generatedAt", "dateRange", "pet", "reasonForVisit", "visitSummary", "ownerReportedChanges", "concernTimeline", "foodChanges", "productsUsed", "medicationsSupplements", "relevantCareHistory", "reportedPatterns", "questionsForVeterinarian", "missingInformation", "ownerNotes", "excludedSections", "includePetPhoto", "disclaimer"],
      properties: {
        documentVersion: { type: "number" }, title: { type: "string", maxLength: 160 }, generatedAt: { type: "string" },
        dateRange: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" } } },
        pet: { type: "object", additionalProperties: false, required: ["name", "species", "breed", "age", "weight", "photoUrl"], properties: {
          name: { type: "string" }, species: { type: "string" }, breed: { type: "string" }, age: { type: "string" }, weight: { type: "string" }, photoUrl: { type: ["string", "null"] },
        } },
        reasonForVisit: { type: "string", maxLength: 1200 }, visitSummary: { type: "string", maxLength: 1200 }, ownerReportedChanges: { type: "array", maxItems: 80, items: datedItem },
        concernTimeline: { type: "array", maxItems: 80, items: datedItem }, foodChanges: { type: "array", maxItems: 80, items: datedItem },
        productsUsed: { type: "array", maxItems: 80, items: datedItem }, medicationsSupplements: { type: "array", maxItems: 80, items: datedItem },
        relevantCareHistory: { type: "array", maxItems: 80, items: historyItem }, reportedPatterns: stringList(80),
        questionsForVeterinarian: stringList(80), missingInformation: stringList(80), ownerNotes: { type: "string", maxLength: 4000 },
        excludedSections: { type: "array", maxItems: 8, items: { type: "string", enum: ["visit-reason", "changes-noticed", "timeline", "food-products", "medications", "care-history", "questions", "owner-notes"] } },
        includePetPhoto: { type: "boolean" }, disclaimer: { type: "string" },
      },
    },
    sourceRecordIds: { type: "array", maxItems: 300, items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
} as const;

export type IntelligenceVetBrief = { document: VetBriefDocument; sourceRecordIds: string[]; confidence: "low" | "medium" | "high" };
