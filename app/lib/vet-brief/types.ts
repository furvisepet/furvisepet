export const VET_BRIEF_DISCLAIMER =
  "Prepared from information recorded by the pet owner in Furvise. It may be incomplete and does not contain a diagnosis or replace veterinary assessment.";

export const VET_BRIEF_DOCUMENT_VERSION = 1;

export type VetBriefDatedItem = {
  date: string;
  text: string;
};

export type VetBriefHistoryItem = VetBriefDatedItem & {
  category: string;
};

export type VetBriefSectionId =
  | "visit-reason"
  | "changes-noticed"
  | "timeline"
  | "food-products"
  | "medications"
  | "care-history"
  | "questions"
  | "owner-notes";

export type VetBriefDocument = {
  documentVersion: number;
  title: string;
  generatedAt: string;
  dateRange: { from: string; to: string };
  pet: {
    name: string;
    species: string;
    breed: string;
    age: string;
    weight: string;
    photoUrl: string | null;
  };
  reasonForVisit: string;
  ownerReportedChanges: VetBriefDatedItem[];
  concernTimeline: VetBriefDatedItem[];
  foodChanges: VetBriefDatedItem[];
  productsUsed: VetBriefDatedItem[];
  medicationsSupplements: VetBriefDatedItem[];
  relevantCareHistory: VetBriefHistoryItem[];
  reportedPatterns: string[];
  questionsForVeterinarian: string[];
  missingInformation: string[];
  ownerNotes: string;
  excludedSections: VetBriefSectionId[];
  includePetPhoto: boolean;
  disclaimer: string;
};

export type VetBriefConversationMessage = {
  role: "user" | "furvise";
  text?: string;
  response?: {
    answerType?: string;
    directAnswer?: string;
    sections?: Array<{ heading?: string; items?: string[] }>;
    urgency?: string;
  };
};

export type VetBriefRecord = {
  id: string;
  petProfileId: string;
  generatedAt: string;
  dateRange: { from: string; to: string };
  version: number;
  status: "confirmed" | "archived";
  previousVersionId: string | null;
  document: VetBriefDocument;
};
