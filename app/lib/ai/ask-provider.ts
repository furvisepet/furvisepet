export const ASK_MAX_OUTPUT_TOKENS = 4096;

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

  if (status === "incomplete") {
    return {
      ...common,
      status: "incomplete",
      parsed: null,
      errorCode: "ASK_OUTPUT_INCOMPLETE",
      errorMessage: "The provider output was incomplete.",
      parsingAttempted: false,
    };
  }
  if (status === "failed" || response.error) {
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
      errorMessage: error instanceof Error ? error.message : "Structured output validation failed.",
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
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
