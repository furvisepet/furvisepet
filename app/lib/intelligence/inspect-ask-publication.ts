import { buildAskConversationResponse, parseAskConversationResponse } from "../ask.mjs";
import { presentationOnlyAskResponse } from "../ask-conversation-server.ts";
import { answerIntegrityFailure } from "../answer-integrity.ts";
import { restoreAskEvidencePresentation, reviewedTaskPresentationFailure } from "./ask-evidence-presentation.ts";
import { parseStoredApplicationActions } from "../application-actions/contracts.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { EpisodeResult } from "./episode-contract.ts";
type Response = NonNullable<ReturnType<typeof buildAskConversationResponse>>;
type Answer = { summary: string; sections: { heading: string; items: string[] }[]; safetyNote: string | null };
/** The API and offline harness share the same final publication gate, including
 * the actual persisted-message sanitizer. No stored metadata creates authority. */
export function inspectAskPublication(answer: Answer, response: Response | null, readOnly: boolean,
  evidence?: AskEvidenceContract, episodes?: EpisodeResult) {
  if (!response) return { response, displayed: null, failure: "serialization" };
  const restored = restoreAskEvidencePresentation(response, evidence, episodes);
  const reloaded = readOnly ? presentationOnlyAskResponse(restored, []) as Response : restored;
  const displayed = parseAskConversationResponse(reloaded) as Response | null;
  return { response: restored, displayed, failure: !displayed ? "client_serialization"
    : reviewedTaskPresentationFailure(evidence, displayed, parseStoredApplicationActions(displayed.applicationActions))
      || (readOnly ? answerIntegrityFailure(answer, displayed) : null) };
}
