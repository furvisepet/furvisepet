// Reasoning tokens share this budget with the structured answer. Live medium-
// effort history reads exhausted 4096 before completing their response object.
export const ASK_MAX_OUTPUT_TOKENS = 8192;

export type StructuredProviderStatus = "completed" | "incomplete" | "refused" | "invalid" | "failed";

export type OpenAiStructuredResponseLike = {
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string | null } | null;
  error?: { code?: string | null; message?: string | null } | null;
  usage?: { input_tokens?: number | null; output_tokens?: number | null } | null;
  output?: Array<{
    status?: string;
    type?: string;
    content?: Array<{ type?: string; refusal?: string; text?: string }>;
  }>;
};

export type StructuredProviderResult<T> = {
  status: StructuredProviderStatus;
  parsed: T | null;
  rawText: string | null;
  incompleteReason: string | null;
  finishReason: string | null;
  refusal: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  parsingAttempted: boolean;
  validationReason?: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
};

export function interpretStructuredProviderResponse<T>(
  response: OpenAiStructuredResponseLike,
  parse: (rawText: string) => T,
): StructuredProviderResult<T> {
  const rawText = typeof response.output_text === "string" ? response.output_text : collectOutputText(response.output);
  const refusal = collectRefusal(response.output);
  const status = response.status || "completed";
  const usage = {
    inputTokens: numberOrNull(response.usage?.input_tokens),
    outputTokens: numberOrNull(response.usage?.output_tokens),
  };
  const finishReason = response.output?.find((item) => item.status)?.status || status || null;
  const incompleteReason = response.incomplete_details?.reason || null;
  const common = { rawText, incompleteReason, finishReason, refusal, usage };

  if (status === "incomplete" || response.output?.some(item => item.status === "incomplete")) {
    return {
      ...common,
      status: "incomplete",
      parsed: null,
      errorCode: "ASK_OUTPUT_INCOMPLETE",
      errorMessage: "The provider output was incomplete.",
      parsingAttempted: false,
    };
  }
  if (status === "failed" || response.error || response.output?.some(item => item.status === "failed")) {
    return {
      ...common,
      status: "failed",
      parsed: null,
      errorCode: response.error?.code || "ASK_PROVIDER_FAILED",
      errorMessage: response.error?.message || "The provider failed to generate a response.",
      parsingAttempted: false,
    };
  }
  if (refusal) {
    return {
      ...common,
      status: "refused",
      parsed: null,
      errorCode: "ASK_OUTPUT_REFUSED",
      errorMessage: "The provider refused the structured response.",
      parsingAttempted: false,
    };
  }
  if (status !== "completed" || !rawText) {
    return {
      ...common,
      status: "invalid",
      parsed: null,
      errorCode: "ASK_OUTPUT_INVALID",
      errorMessage: "The provider returned no complete structured output.",
      parsingAttempted: false,
    };
  }

  try {
    return {
      ...common,
      status: "completed",
      parsed: parse(rawText),
      errorCode: null,
      errorMessage: null,
      parsingAttempted: true,
    };
  } catch (error) {
    return {
      ...common,
      status: "invalid",
      parsed: null,
      errorCode: "ASK_OUTPUT_INVALID",
      errorMessage: "Structured output validation failed.",
      validationReason: safeStructuredValidationReason(error),
      parsingAttempted: true,
    };
  }
}

function collectOutputText(output: OpenAiStructuredResponseLike["output"]) {
  const text = (output || []).flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  return text || null;
}

function collectRefusal(output: OpenAiStructuredResponseLike["output"]) {
  const refusal = (output || []).flatMap((item) => item.content || [])
    .find((part) => part.type === "refusal" && typeof part.refusal === "string")?.refusal;
  return refusal || null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Diagnostics contain only contract-owned enums; never parser excerpts. */
export function safeStructuredValidationReason(error: unknown): string {
  if (error instanceof SyntaxError) return "JSON_SYNTAX";
  const message = error instanceof Error ? error.message : "";
  const known = new Set(["INVALID_READ_RESPONSE", "INVALID_READ_NAVIGATION", "DUPLICATE_READ_BODY", "INVALID_READ_TABLE", "INVALID_READ_LIMITATION", "EMPTY_READ_REQUIRES_EXPLANATION", "MISSING_READ_BODY", "INVALID_READ_LAYOUT", "INVALID_HISTORY_CALCULATION", "INVALID_TASK_REVIEW"]);
  if (known.has(message)) return message;
  if (message === "Ask provider returned an empty answer.") return "EMPTY_ANSWER";
  if (message === "Ask provider returned an invalid response.") return "INVALID_ANSWER_BODY";
  if (message === "Ask response exposed internal reasoning data.") return "INTERNAL_REASONING_EXPOSURE";
  return "STRUCTURED_CONTRACT_INVALID";
}
