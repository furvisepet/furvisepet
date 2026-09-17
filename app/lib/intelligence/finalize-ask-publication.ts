import "server-only";

import { buildAskConversationResponse } from "../ask.mjs";
import type { AskTurnTrace } from "../ai/ask-turn-model.ts";
import type { AiCreditStatus } from "../ai/usage-ledger.ts";
import type { PendingUpdateSuggestion, PetConcern } from "../ai/concern-engine.ts";
import type { CarePersistenceResult, IntelligencePersistenceSummary } from "./types.ts";
import { persistedLearningConfirmation } from "./response-rendering.ts";

type CompletedAskResponse = NonNullable<ReturnType<typeof buildAskConversationResponse>>;

export function didPersistEffectiveAskState(
  intelligencePersistence: IntelligencePersistenceSummary | null,
  carePersistence: CarePersistenceResult,
) {
  return Boolean(
    intelligencePersistence?.memoriesCreated
    || intelligencePersistence?.memoriesSuperseded
    || intelligencePersistence?.memoryIds.length
    || intelligencePersistence?.concernsResolved
    || carePersistence.status === "persisted" && (carePersistence.careEntryIds.length || carePersistence.concernIds.length)
  );
}

function textPayloadValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Single public success serializer for completed Ask turns.
 *
 * This boundary may publish save/update state only from durable server receipts.
 * Model prose, planner intent, missing persistence summaries and skipped writes
 * never become success metadata here.
 */
export function buildSuccessfulAskResponse({
  assistantMessageId = "",
  applicationStateChanged = false,
  concern = null,
  creditsUsed = 0,
  contextUsed,
  conversationId,
  handledWithoutAi = false,
  intelligencePersistence = null,
  intelligencePersistenceWarning = "",
  carePersistence = { status: "skipped", careEntryIds: [], concernIds: [], errorCode: null, currentSafetyState: null, alreadyPersisted: false },
  persistenceWarning,
  persistenceMode = "none",
  persistedCareAction = null,
  requestId,
  response,
  saved,
  saveMetadata,
  safetyLevel,
  usage,
  shoppingSuppressed,
  suggestion = null,
  turn = null,
  userMessageId,
}: {
  assistantMessageId?: string;
  applicationStateChanged?: boolean;
  concern?: PetConcern | null;
  creditsUsed?: number;
  contextUsed: unknown;
  conversationId: string;
  handledWithoutAi?: boolean;
  intelligencePersistence?: IntelligencePersistenceSummary | null;
  intelligencePersistenceWarning?: string;
  carePersistence?: CarePersistenceResult;
  persistenceWarning?: string;
  persistenceMode?: "automatic" | "suggested" | "none";
  persistedCareAction?: { careEntryId?: string | null; concernId?: string | null } | null;
  requestId: string;
  response: CompletedAskResponse;
  saved: boolean;
  saveMetadata: unknown;
  safetyLevel: "normal" | "monitor" | "urgent";
  usage: AiCreditStatus;
  shoppingSuppressed: boolean;
  suggestion?: (PendingUpdateSuggestion & { id: string }) | null;
  turn?: AskTurnTrace | null;
  userMessageId: string;
}) {
  void requestId;
  return Response.json({
    answer: response.directAnswer,
    assistantMessageId,
    concern: concern ? { id: concern.id, status: concern.status, title: concern.title } : null,
    contextUsed,
    conversationId,
    creditsUsed,
    handledWithoutAi,
    dataChanged: applicationStateChanged || didPersistEffectiveAskState(intelligencePersistence, carePersistence),
    automaticSaveConfirmation: carePersistence.status === "persisted" && carePersistence.careEntryIds.length > 0
      ? "Added to care history"
      : persistedLearningConfirmation(intelligencePersistence),
    carePersistence,
    intelligencePersistence: {
      saved: Boolean(
        !intelligencePersistenceWarning
        && intelligencePersistence
        && didPersistEffectiveAskState(intelligencePersistence, intelligencePersistence.carePersistence)
      ),
      ...(intelligencePersistenceWarning ? { warning: intelligencePersistenceWarning } : {}),
    },
    remainingCredits: usage.remaining,
    persistence: {
      saved,
      ...(persistenceWarning ? { warning: persistenceWarning } : {}),
    },
    persistenceMode,
    persistedCareAction,
    proposedHistoryUpdate: suggestion ? {
      shouldOffer: true,
      category: textPayloadValue(suggestion.payload.category),
      title: textPayloadValue(suggestion.payload.title),
      details: suggestion.details || null,
      severity: textPayloadValue(suggestion.payload.severity),
      resolvesConcernId: suggestion.concernId || null,
    } : null,
    response,
    safety: { level: safetyLevel, shoppingSuppressed },
    saveMetadata,
    suggestion,
    success: true,
    turn,
    userMessageId,
    usage,
  });
}
