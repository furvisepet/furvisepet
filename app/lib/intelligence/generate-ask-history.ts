import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAskEvidenceContract } from "./ask-evidence.ts";
import { retrieveAskHistory } from "./history-retrieval.ts";
import { runFurviseIntelligence } from "./run-intelligence.ts";
import { retrieveEpisodeHistory } from "./episode-history.ts";
import { rememberValidatedEvidencePresentation } from "./ask-evidence-presentation.ts";
import { episodeAnswer, type EpisodeResult } from "./episode-contract.ts";

/** The route's actual generation callback boundary, also exercised with mocked
 * provider/database dependencies. generationInput is not a second authority. */
export type AskHistoryStage = "history_retrieval" | "episode_retrieval" | "answer_generation" | "episode_revalidation" | "final_presentation";
export async function generateAskHistoryAnswer({ supabase, onStage, ...input }: Omit<Parameters<typeof runFurviseIntelligence>[0], "evidenceContract"> & { supabase: SupabaseClient; onStage?: (stage: AskHistoryStage) => void }) {
  const petIds = input.authoritativePetIds ?? [input.context.pet.id];
  onStage?.("history_retrieval");
  let context = await retrieveAskHistory(input.context, supabase, petIds);
  onStage?.("episode_retrieval");
  context = await retrieveEpisodeHistory(context, supabase, petIds);
  onStage?.("answer_generation");
  const intelligenceResult = await runFurviseIntelligence({ ...input, context,
    evidenceContract: createAskEvidenceContract(context, petIds) });
  if (context.episodeResult) {
    // Generation can take seconds. Revalidate after it, before returning a list
    // or references for display/persistence. Never silently substitute a new list.
    onStage?.("episode_revalidation");
    const fresh = await retrieveEpisodeHistory(context,supabase,petIds);
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
