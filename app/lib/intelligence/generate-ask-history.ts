import { enforceAskHistoryAccess } from "./history-access.ts";
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
export async function generateAskHistoryAnswer({ supabase, onStage, ...input }: Omit<Parameters<typeof runFurviseIntelligence>[0], "evidenceContract"> & { supabase: SupabaseClient; onStage?: (stage: AskHistoryStage) => void }) {
  input.context = enforceAskHistoryAccess(scopeConversationContext(input.context));

  const legacySubjectPetIds = input.context.askInterpretation?.conversationOnly
    ? []
    : input.authoritativePetIds ?? [input.context.pet.id];
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

  onStage?.("history_retrieval");
  let context = await retrieveFurviseMemory(input.context, supabase, brainTurn);
  onStage?.("episode_retrieval");
  if ((memoryRead.depth === "targeted" || memoryRead.depth === "lifetime") && readPetIds.length) {
    context = await retrieveEpisodeHistory(context, supabase, readPetIds);
  }
  onStage?.("answer_generation");
  const intelligenceResult = await runFurviseIntelligence({ ...input, context,
    evidenceContract: createAskEvidenceContract(context, readPetIds) });
  if (context.episodeResult) {
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
