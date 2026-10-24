import { createRecordedCalculationContext } from "./recorded-calculation-source.ts";
import { calculationCapability } from "./calculation-capability.ts";
import { enforceAskHistoryAccess } from "./history-access.ts";
import { isOrdinarySavedHistoryRequest } from "./publication-authority.ts";
import { scopeConversationContext } from "./conversation-scope.ts";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAskEvidenceContract } from "./ask-evidence.ts";
import { runFurviseIntelligence } from "./run-intelligence.ts";
import { retrieveEpisodeHistory } from "./episode-history.ts";
import { rememberValidatedEvidencePresentation } from "./ask-evidence-presentation.ts";
import { episodeAnswer, type EpisodeResult } from "./episode-contract.ts";
import { assertAskBrainScope, buildAskBrainTurn } from "../furvise-brain/ask-runtime.ts";
import { planFurviseMemoryRead, retrieveFurviseMemory } from "../furvise-brain/memory-organ.ts";
import { setFurviseMemoryAuthority } from "../furvise-brain/turn-authority.ts";

/** The route's actual generation callback boundary, also exercised with mocked
 * provider/database dependencies. generationInput is not a second authority. */
export type AskHistoryStage = "history_retrieval" | "episode_retrieval" | "answer_generation" | "episode_revalidation" | "final_presentation";
export async function generateAskHistoryAnswer({ supabase, onStage, signal, ...input }: Omit<Parameters<typeof runFurviseIntelligence>[0], "evidenceContract"> & { supabase: SupabaseClient; signal?: AbortSignal; onStage?: (stage: AskHistoryStage) => void }) {
  input.context = enforceAskHistoryAccess(scopeConversationContext(input.context));

  // Legacy route/harness scope is untrusted at this boundary. Intersect it
  // with the authenticated owner's eligible pets before the Brain turn exists.
  // This preserves valid multi-pet reads while making foreign ids inert.
  const ownedPetIds = new Set(input.context.eligiblePets
    .filter(pet => pet.user_id === input.context.owner.userId)
    .map(pet => pet.id));
  const legacySubjectPetIds = input.context.askInterpretation?.conversationOnly
    ? []
    : [...new Set((input.authoritativePetIds ?? [input.context.pet.id]).filter(id => ownedPetIds.has(id)))];
  let brainTurn = buildAskBrainTurn({
    context: input.context,
    logicalTurnId: input.requestId,
    authoritativePetIds: legacySubjectPetIds,
  });
  // Entering the server-owned historical callback is itself read authority.
  // Some deterministic/fallback paths intentionally have no model interpretation;
  // they must still perform the bounded history read this callback promises.
  if (!input.context.askInterpretation?.request && !input.context.askInterpretation?.conversationOnly) {
    brainTurn = setFurviseMemoryAuthority(brainTurn, { need: "targeted", petIds: legacySubjectPetIds });
  }
  const memoryRead = planFurviseMemoryRead(brainTurn);
  const petIds = [...brainTurn.subject.petIds];
  const readPetIds = [...memoryRead.petIds];
  assertAskBrainScope({ turn: brainTurn, authoritativePetIds: petIds, readPetIds });
  input.authoritativePetIds = petIds;

  const ordinaryHistory = isOrdinarySavedHistoryRequest(input.context.askInterpretation?.request);
  const request = input.context.askInterpretation?.request;
  const capability = request?.calculatePlan && request.readTicket
    ? calculationCapability(request.calculatePlan, request.readTicket, input.context.owner.userId) : null;
  const calculationUnsupported = capability?.supported === false;
  if (capability) console.info("[Ask Calculation] capability", capability);
  if (!calculationUnsupported) onStage?.("history_retrieval");
  let context = calculationUnsupported ? input.context : await retrieveFurviseMemory(input.context, supabase, brainTurn);
  onStage?.("episode_retrieval");
  if (!calculationUnsupported && !ordinaryHistory && (memoryRead.depth === "targeted" || memoryRead.depth === "lifetime") && readPetIds.length) {
    context = await retrieveEpisodeHistory(context, supabase, readPetIds);
  }
  onStage?.("answer_generation");
  const recordedCalculation = request?.calculatePlan && request.readTicket?.authority === "stored_report" && capability?.supported
    ? createRecordedCalculationContext({supabase,requestId:input.requestId,ownerId:context.owner.userId,petIds:readPetIds,signal}) : undefined;
  const intelligenceResult = await runFurviseIntelligence({ ...input, context, recordedCalculation,
    evidenceContract: createAskEvidenceContract(context, readPetIds) });
  if (!calculationUnsupported && !ordinaryHistory && context.episodeResult) {
    // Generation can take seconds. Revalidate after it, before returning a list
    // or references for display/persistence. Never silently substitute a new list.
    onStage?.("episode_revalidation");
    const fresh = await retrieveEpisodeHistory(context, supabase, readPetIds);
    const signature = (value: EpisodeResult | undefined) => JSON.stringify(value && {
      ...value, recordedInventory:value.recordedInventory && {...value.recordedInventory,snapshot:null},
    });
    if (signature(fresh.episodeResult) !== signature(context.episodeResult)) {
      context = { ...context, episodeResult: { ...context.episodeResult, items:[], supportedCount:0, exactTotal:null,
        coverage:"unavailable", references:undefined, details:undefined, reasons:["episode_changed_during_generation"] } };
      intelligenceResult.reasoning.answer = { ...intelligenceResult.reasoning.answer,...episodeAnswer(context.episodeResult!) };
    }
  }
  onStage?.("final_presentation");
  rememberValidatedEvidencePresentation(intelligenceResult.reasoning.evidenceContract, intelligenceResult.reasoning.answer, context.episodeResult);
  return { context, intelligenceResult };
}
