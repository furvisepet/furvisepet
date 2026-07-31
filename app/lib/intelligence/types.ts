import type { CareEntryRow, DogMemoryRow, DogProductFeedbackRow, DogProfileRow, UserProfileRow } from "../supabase";
import type { PetConcern } from "../ai/concern-engine";
import type { CareEpisode } from "./episodes/types";
import type { PetCurrentStateRow } from "./pet-state/types";

export type IntelligenceFeature = "ask" | "product_question" | "product_query_interpretation" | "product_explanation" | "safety_followup" | "vet_brief" | "care_plan";
export type IntelligenceSafetyLevel = "routine" | "monitor" | "urgent" | "emergency" | "recently_resolved";
export type IntelligenceIntent =
  | "question" | "update" | "correction" | "concern_resolution" | "new_symptom"
  | "food" | "routine" | "behavior" | "training" | "medication" | "product"
  | "shopping" | "vet_preparation" | "general_conversation" | "owner_preference"
  | "pet_preference" | "unknown";

export type IntelligenceMessageUnderstanding = {
  primaryIntent: IntelligenceIntent;
  secondaryIntents: IntelligenceIntent[];
  userIsAskingQuestion: boolean;
  userIsProvidingUpdate: boolean;
  userIsCorrectingPriorInformation: boolean;
  userIsResolvingConcern: boolean;
  userIsProvidingPreference: boolean;
  userIsMakingSmallTalk: boolean;
  requestedTopic: string | null;
  referencedPet: string | null;
  safetyRelevance: "none" | "possible" | "direct";
  needsClarification: boolean;
  canAnswerDirectly: boolean;
};

export type IntelligenceLearning = {
  subjectType: "pet" | "owner";
  subjectId: string | null;
  category: string;
  factKey: string;
  factValue: unknown;
  confidence: number;
  importance: "low" | "medium" | "high";
  durability: "temporary" | "ongoing" | "durable";
  action: "create" | "confirm" | "update" | "supersede" | "resolve" | "none";
  sourceExcerpt: string;
};

export type IntelligenceCareAction = {
  action: "create_entry" | "resolve_concern" | "reopen_concern" | "update_profile" | "none";
  category: string;
  title: string;
  details: string;
  severity: "routine" | "mild" | "moderate" | "urgent" | "emergency";
  confidence: number;
  relatedRecordId: string | null;
  episodeOperation?: "start" | "complete";
  normalizedEpisodeKey?: string;
};

export type FurviseMemoryRow = {
  id: string;
  user_id: string;
  pet_id: string | null;
  subject_type: "pet" | "owner";
  category: string;
  fact_key: string;
  fact_value: unknown;
  normalized_value: string | null;
  confidence: number;
  importance: "low" | "medium" | "high";
  durability: "temporary" | "ongoing" | "durable";
  status: "active" | "unconfirmed" | "resolved" | "superseded" | "rejected" | "expired";
  source_type: string;
  source_id: string | null;
  source_excerpt: string | null;
  first_observed_at: string;
  last_confirmed_at: string;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
  observed_at?: string | null;
  expires_at?: string | null;
  freshness_class?: "permanent" | "long_lived" | "medium_lived" | "short_lived" | "episode_bound" | null;
  base_confidence?: number | null;
  current_confidence?: number | null;
  decay_policy?: string | null;
  confirmation_required_after?: string | null;
  stale_at?: string | null;
};

export type IntelligenceConversationTurn = {
  id: string;
  role: "user" | "furvise";
  text: string;
  createdAt: string;
};

export type FurviseLiveContext = {
  feature: IntelligenceFeature;
  locale: string;
  currentMessage: string;
  currentTimestamp: string;
  conversationId: string | null;
  pet: DogProfileRow;
  owner: { userId: string; profile: UserProfileRow | null };
  careEntries: CareEntryRow[];
  selectedCareEntries: CareEntryRow[];
  activeConcerns: PetConcern[];
  recentlyResolvedConcerns: PetConcern[];
  activeEpisodes: CareEpisode[];
  monitoringEpisodes: CareEpisode[];
  currentState: PetCurrentStateRow | null;
  legacyPetMemories: DogMemoryRow[];
  memories: FurviseMemoryRow[];
  productFeedback: DogProductFeedbackRow[];
  conversationTurns: IntelligenceConversationTurn[];
};

export type IntelligencePersistenceSummary = {
  careEntriesCreated: number;
  concernsResolved: number;
  memoriesCreated: number;
  memoriesSuperseded: number;
  memoryIds: string[];
  rejectedLearnings: number;
  careActionPresent: boolean;
  persistedCareEntryId: string | null;
  persistedConcernId: string | null;
  persistenceMode: "automatic" | "none";
  carePersistence: CarePersistenceResult;
};

export type CarePersistenceResult = {
  status: "persisted" | "suggested" | "skipped" | "failed";
  careEntryIds: string[];
  concernIds: string[];
  errorCode: string | null;
  currentSafetyState: "routine" | "recently_resolved" | "urgent" | null;
  alreadyPersisted: boolean;
  memoryIds?: string[];
  profileUpdated?: boolean;
};
