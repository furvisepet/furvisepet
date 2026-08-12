import "server-only";

import OpenAI from "openai";
import { interpretStructuredProviderResponse } from "../../ai/ask-provider.ts";
import { AskPipelineError, type AskProviderEvent } from "../../ai/ask-reasoning.ts";
import { executeAdmittedProviderCall } from "../../ai/usage-guard/provider-call-budget.ts";
import { extractProposedSemanticFrame } from "./extract-frame.ts";
import { proposedSemanticFrameJsonSchema } from "./schema.ts";
import type { ProposedSemanticFrame } from "./types.ts";

const TURN_SUBJECT_MAX_OUTPUT_TOKENS = 1800;
const TURN_SUBJECT_TIMEOUT_MS = 15_000;

type SubjectFrameClient = {
  responses: {
    create: (request: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<Record<string, unknown>>;
  };
};

const instructions = [
  "Return only strict JSON matching the supplied schema.",
  "Extract a ProposedSemanticFrame for the current user message solely so the server can resolve mentioned entities and references.",
  "Use local IDs only. Never emit or infer database IDs.",
  "Represent every explicit animal or person mention, including names, descriptions such as my cat, and pronouns used as claim subjects.",
  "For animal mentions, populate species, lifeStage, and ownership only when supported by the message. Do not assume the selected pet is the subject.",
  "Include each supported assertion, event, state transition, preference, relationship, or correction so its subjectRef identifies the applicable mention.",
  "Bind first-person preferences and first-person owner facts to the owner mention (I, me, or my). A named organization, retailer, brand, product, or place is the preference value/object, never the owner-subject.",
  "Evidence surfaceText must be copied exactly from the current message. Never invent or paraphrase evidence.",
  "Recent user discourse may establish a reference antecedent, but it is context only and must not be copied into current-message evidence.",
].join("\n");

export async function extractTurnSubjectFrame({
  apiKey = process.env.OPENAI_API_KEY,
  client,
  message,
  model,
  onProviderEvent,
  recentConversation,
}: {
  apiKey?: string;
  client?: SubjectFrameClient;
  message: string;
  model: string;
  onProviderEvent?: (event: AskProviderEvent) => void;
  recentConversation: Array<{ role?: string; text: string }>;
}): Promise<ProposedSemanticFrame> {
  const activeClient = client || createClient(apiKey);
  if (!activeClient) throw new AskPipelineError("primary_provider_failed", "Ask subject resolution is unavailable.", { elapsedMs: 0, model, providerErrorCode: "OPENAI_API_KEY_MISSING" });
  const input = {
    currentMessage: message,
    recentUserDiscourse: recentConversation.filter((turn) => !turn.role || turn.role === "user").slice(-6).map((turn) => turn.text.slice(0, 500)),
  };
  const request = {
    model,
    temperature: 0,
    max_output_tokens: TURN_SUBJECT_MAX_OUTPUT_TOKENS,
    instructions,
    input: JSON.stringify(input),
    text: { format: { type: "json_schema", name: "furvise_turn_subject_frame", strict: true, schema: proposedSemanticFrameJsonSchema } },
  };
  const started = Date.now();
  onProviderEvent?.({ stage: "primary", outcome: "started", model, elapsedMs: 0, configuredOutputLimit: TURN_SUBJECT_MAX_OUTPUT_TOKENS });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURN_SUBJECT_TIMEOUT_MS);
  try {
    const response = await executeAdmittedProviderCall({
      invoke: () => activeClient.responses.create(request, { signal: controller.signal }),
      maxOutputTokens: TURN_SUBJECT_MAX_OUTPUT_TOKENS,
      model,
      providerInput: input,
    });
    const interpreted = interpretStructuredProviderResponse(response, (raw) => {
      const parsed = extractProposedSemanticFrame(JSON.parse(raw));
      if (!parsed) throw new Error("Turn subject frame did not satisfy ProposedSemanticFrame.");
      return parsed;
    });
    if (interpreted.status !== "completed" || !interpreted.parsed) {
      throw new AskPipelineError("primary_invalid_output", interpreted.errorMessage || "Turn subject frame was invalid.", {
        elapsedMs: Date.now() - started,
        model,
        providerErrorCode: interpreted.errorCode || "ASK_OUTPUT_INVALID",
        providerErrorType: interpreted.status,
      });
    }
    onProviderEvent?.({
      stage: "primary", outcome: "succeeded", model, elapsedMs: Date.now() - started,
      configuredOutputLimit: TURN_SUBJECT_MAX_OUTPUT_TOKENS,
      inputTokens: interpreted.usage.inputTokens, outputTokens: interpreted.usage.outputTokens,
      finishReason: interpreted.finishReason, incompleteReason: interpreted.incompleteReason,
      outputLimitReached: false, parsingAttempted: true, rawOutputLength: interpreted.rawText?.length || 0,
    });
    return interpreted.parsed;
  } catch (error) {
    if (error instanceof AskPipelineError) throw error;
    throw new AskPipelineError("primary_provider_failed", "Turn subject resolution failed.", {
      elapsedMs: Date.now() - started,
      model,
      providerErrorCode: error instanceof Error ? error.name : "TURN_SUBJECT_PROVIDER_FAILED",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function createClient(apiKey?: string): SubjectFrameClient | null {
  const key = apiKey?.trim();
  return key ? new OpenAI({ apiKey: key }) as unknown as SubjectFrameClient : null;
}
