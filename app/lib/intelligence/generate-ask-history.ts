import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAskEvidenceContract } from "./ask-evidence.ts";
import { retrieveAskHistory } from "./history-retrieval.ts";
import { runFurviseIntelligence } from "./run-intelligence.ts";

/** The route's actual generation callback boundary, also exercised with mocked
 * provider/database dependencies. generationInput is not a second authority. */
export async function generateAskHistoryAnswer({ supabase, ...input }: Omit<Parameters<typeof runFurviseIntelligence>[0], "evidenceContract"> & { supabase: SupabaseClient }) {
  const petIds = input.authoritativePetIds ?? [input.context.pet.id];
  const context = await retrieveAskHistory(input.context, supabase, petIds);
  const intelligenceResult = await runFurviseIntelligence({ ...input, context,
    evidenceContract: createAskEvidenceContract(context, petIds) });
  return { context, intelligenceResult };
}
