import { resolutionStatusAnswer, type AskEvidenceContract } from "./ask-evidence.ts";
import { episodeAnswer, type EpisodeResult } from "./episode-contract.ts";

/** Restore server-composed source text after ordinary action/prose rendering.
 * This accepts only server evidence, never presentation fields from a client. */
export function restoreAskEvidencePresentation<T extends { summary: string; directAnswer: string; sections: { heading: string; items: string[] }[] }>(
  response: T, evidence?: AskEvidenceContract, episodes?: EpisodeResult,
): T {
  const status = evidence ? resolutionStatusAnswer(evidence) : null;
  const answer = status ? { summary: status, sections: [] } : episodes ? episodeAnswer(episodes) : null;
  return answer ? { ...response, ...answer, directAnswer: answer.summary } : response;
}
