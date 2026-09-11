import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { EpisodeResult } from "./episode-contract.ts";
import { buildAskConversationResponse } from "../ask.mjs";
import { answerIntegrityFailure } from "../answer-integrity.ts";
import type { FurviseApplicationAction } from "../application-actions/types.ts";

type Answer = { summary: string; sections: { heading: string; items: string[] }[]; safetyNote: string | null };
const validatedPresentations = new WeakMap<AskEvidenceContract, { answer: Answer; episodes: string }>();
const taskPresentations = new WeakMap<AskEvidenceContract, { answer: Answer; actions: string[] }>();
const actionIdentity = (action: FurviseApplicationAction) => JSON.stringify({ kind: action.kind, petId: action.petId,
  input: action.input, explicitIntent: action.explicitIntent, href: action.href });

/** Ephemeral final-review receipt. Persisted JSON cannot recreate approval. */
export function rememberReviewedTaskPresentation(evidence: AskEvidenceContract | undefined, answer: Answer, actions: FurviseApplicationAction[]) {
  if (evidence) taskPresentations.set(evidence, { answer: structuredClone(answer), actions: actions.map(actionIdentity) });
}
export function reviewedTaskPresentationFailure(evidence: AskEvidenceContract | undefined, answer: Answer, actions: FurviseApplicationAction[]) {
  const reviewed = evidence && taskPresentations.get(evidence);
  if (!reviewed) return null;
  const failure = answerIntegrityFailure(reviewed.answer, answer);
  if (failure) return `task_${failure}`;
  const actual = actions.map(actionIdentity);
  return reviewed.actions.some(action => !actual.includes(action)) ? "task_action_missing_or_changed" : null;
}

/** Only the completed validation callback can register a presentation. Model
 * JSON and serialized/reloaded evidence cannot create this server capability. */
export function rememberValidatedEvidencePresentation(evidence: AskEvidenceContract | undefined, answer: Answer, episodes?: EpisodeResult) {
  if (evidence) validatedPresentations.set(evidence, { answer: structuredClone(answer), episodes: JSON.stringify(episodes) });
}

/** Restore exact source punctuation only when ordinary rendering was the sole
 * change. Never recompute status, undo downstream governance/safety edits, or
 * restore an episode list whose sources changed during generation. */
export function restoreAskEvidencePresentation<T extends { summary: string; directAnswer: string; sections: { heading: string; items: string[] }[] }>(
  response: T, evidence?: AskEvidenceContract, episodes?: EpisodeResult,
): T {
  const saved = evidence && validatedPresentations.get(evidence);
  if (!saved || saved.episodes !== JSON.stringify(episodes)) return response;
  const rendered = buildAskConversationResponse(saved.answer);
  if (!rendered || response.summary !== rendered.summary || response.directAnswer !== rendered.directAnswer
    || JSON.stringify(response.sections) !== JSON.stringify(rendered.sections)) return response;
  return { ...response, summary: saved.answer.summary, directAnswer: saved.answer.summary, sections: structuredClone(saved.answer.sections) };
}
