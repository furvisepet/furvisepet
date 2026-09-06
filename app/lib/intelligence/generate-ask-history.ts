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
export async function generateAskHistoryAnswer({ supabase, ...input }: Omit<Parameters<typeof runFurviseIntelligence>[0], "evidenceContract"> & { supabase: SupabaseClient }) {
  const petIds = input.authoritativePetIds ?? [input.context.pet.id];
  let context = await retrieveAskHistory(input.context, supabase, petIds);
  context = await retrieveEpisodeHistory(context, supabase, petIds);
  const intelligenceResult = await runFurviseIntelligence({ ...input, context,
    evidenceContract: createAskEvidenceContract(context, petIds) });
  if (context.episodeResult) {
    // Generation can take seconds. Revalidate after it, before returning a list
    // or references for display/persistence. Never silently substitute a new list.
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
  rememberValidatedEvidencePresentation(intelligenceResult.reasoning.evidenceContract, intelligenceResult.reasoning.answer, context.episodeResult);
  return { context, intelligenceResult };
}
