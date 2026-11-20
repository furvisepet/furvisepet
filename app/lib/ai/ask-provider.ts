// Reasoning tokens share this budget with the structured answer. Live medium-
// effort history reads exhausted 4096 before completing their response object.
export const ASK_MAX_OUTPUT_TOKENS = 8192;

// Brain's typed-plan generation has an independent total generated-token budget.
// This includes non-visible structure/reasoning, even with effort none. Raising
// it never authorizes a retry or widens final-answer / Vet Brief generation.
export const ASK_INTERPRETATION_MAX_OUTPUT_TOKENS = 100_000;

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

// Safe envelope shape only: never provider text, identifiers, or arbitrary strings.
const responseStatuses = ["completed", "failed", "in_progress", "cancelled", "queued", "incomplete"] as const;
const outputTypes = ["message", "reasoning", "function_call", "file_search_call", "web_search_call",
  "computer_call", "code_interpreter_call", "image_generation_call", "local_shell_call",
  "shell_call", "shell_call_output", "apply_patch_call", "apply_patch_call_output",
  "mcp_call", "mcp_list_tools", "mcp_approval_request", "custom_tool_call",
  "compaction", "tool_search_call", "tool_search_output", "namespace"] as const;
const responseErrorCodes = ["server_error", "rate_limit_exceeded", "invalid_prompt", "vector_store_timeout",
  "invalid_image", "invalid_image_format", "invalid_base64_image", "invalid_image_url",
  "image_too_large", "image_too_small", "image_parse_error", "image_content_policy_violation",
  "invalid_image_mode", "image_file_too_large", "unsupported_image_media_type",
  "empty_image_file", "failed_to_download_image", "image_file_not_found"] as const;
function envelopeEnum<T extends string>(value: unknown, allowed: readonly T[]): T | "other" | null {
  return value == null ? null : typeof value === "string" && allowed.includes(value as T) ? value as T : "other";
}

/** Bounded diagnostic projection; it never participates in classification or authority. */
export function structuredProviderEnvelopeDiagnostic(response: OpenAiStructuredResponseLike) {
  const output = response.output || [];
  const messages = output.filter(item => item.type === "message");
  return {
    responseStatus: envelopeEnum(response.status, responseStatuses),
    incompleteReason: envelopeEnum(response.incomplete_details?.reason, ["max_output_tokens", "content_filter"] as const),
    errorCode: envelopeEnum(response.error?.code, responseErrorCodes),
    hasError: response.error != null,
    outputItemCount: output.length,
    outputItems: output.slice(0, 32).map(item => ({
      type: envelopeEnum(item.type, outputTypes),
      status: envelopeEnum(item.status, responseStatuses),
    })),
    outputItemsTruncated: output.length > 32,
    hasMessage: messages.length > 0,
    hasMessageOutputText: messages.some(item => item.content?.some(part => part.type === "output_text")),
    hasMessageRefusal: messages.some(item => item.content?.some(part => part.type === "refusal")),
    hasOutputText: typeof response.output_text === "string" && response.output_text.length > 0,
    hasUsage: response.usage != null,
    inputTokens: numberOrNull(response.usage?.input_tokens),
    outputTokens: numberOrNull(response.usage?.output_tokens),
  };
}
export type StructuredProviderEnvelopeDiagnostic = ReturnType<typeof structuredProviderEnvelopeDiagnostic>;

export function interpretStructuredProviderResponse<T>(
  response: OpenAiStructuredResponseLike,
  parse: (rawText: string) => T,
): StructuredProviderResult<T> {
  const rawText = typeof response.output_text === "string" ? response.output_text : collectOutputText(response.output);
  const refusal = collectRefusal(response.output);
  const status = response.status === undefined ? legacyMessageStatus(response) : response.status;
  const usage = {
    inputTokens: numberOrNull(response.usage?.input_tokens),
    outputTokens: numberOrNull(response.usage?.output_tokens),
  };
  const finishReason = status || null;
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
      errorMessage: "Structured output validation failed.",
      validationReason: safeStructuredValidationReason(error),
      parsingAttempted: true,
    };
  }
}

// Compatibility for envelopes without a Responses status. Only message status
// can supply item-level completion authority; absent/mixed statuses fail closed.
function legacyMessageStatus(response: OpenAiStructuredResponseLike): string {
  const messages = (response.output || []).filter(item => item.type === "message");
  if (messages.length) {
    if (messages.some(item => item.status === "failed")) return "failed";
    if (messages.some(item => item.status === "incomplete")) return "incomplete";
    const unfinished = messages.find(item => item.status !== "completed");
    return unfinished ? unfinished.status || "invalid" : "completed";
  }
  // Existing text-only adapters have no output items or item status to consult.
  return !response.output?.length && typeof response.output_text === "string" && response.output_text.length > 0
    ? "completed" : "invalid";
}

function collectOutputText(output: OpenAiStructuredResponseLike["output"]) {
  const text = (output || []).filter(item => item.type === "message").flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  return text || null;
}

function collectRefusal(output: OpenAiStructuredResponseLike["output"]) {
  const refusal = (output || []).filter(item => item.type === "message").flatMap((item) => item.content || [])
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
  const safeWireCodes = new Set(["ASK_WIRE_WIRE_SCHEMA", "ASK_WIRE_RAW_GRAPH_SCHEMA", "ASK_WIRE_ROOT_SCHEMA", "ASK_WIRE_NONCANONICAL_WIRE", "ASK_WIRE_INVALID_EDGE", "ASK_WIRE_UNREACHABLE_NODES", "ASK_WIRE_REUSED_OR_DEEP_NODE", "ASK_WIRE_COMPACT_SCHEMA", "ASK_WIRE_CANONICAL_RESTORATION", "ASK_WIRE_CANONICAL_SCHEMA", "ASK_WIRE_UNKNOWN_PACKED_TAG", "ASK_WIRE_PACKED_TAG_SYNTAX", "ASK_WIRE_MULTIPLE_PACKED_TAGS", "ASK_WIRE_PACKED_COLLISION", "ASK_WIRE_GROUP_BRANCH", "ASK_WIRE_FIELD_ORDER", "ASK_WIRE_SCHEMA_REF", "ASK_WIRE_SCHEMA_RESTORATION", "ASK_WIRE_ENCODED_SCHEMA", "ASK_WIRE_POLICY_ENVELOPE", "ASK_WIRE_POLICY_ROOT_SCHEMA", "ASK_RECURSIVE_INDEXED_ENVELOPE", "ASK_RECURSIVE_SERIALIZED_LIMIT", "ASK_RECURSIVE_DEPTH", "ASK_RECURSIVE_STRING_LIMIT", "ASK_RECURSIVE_VALUE_LIMIT", "ASK_RECURSIVE_CONTAINER_LIMIT", "ASK_RECURSIVE_CYCLE_OR_REUSED_CONTAINER", "ASK_RECURSIVE_ENTRY_LIMIT", "ASK_RECURSIVE_OWN_DATA_PROPERTY", "ASK_RECURSIVE_ARRAY_SHAPE", "ASK_RECURSIVE_PLAIN_CONTAINER", "ASK_RECURSIVE_JSON_VALUE"]);
  if (safeWireCodes.has(message)) return message;
  // Only diagnostics defined by our direct semantic codec; never copy model values.
  const safeDirectCodes = new Set(["ASK_DIRECT_ENVELOPE", "ASK_DIRECT_REQUIRED_FIELDS", "ASK_DIRECT_BRANCH_SCHEMA", "ASK_DIRECT_FIELD_FORMAT", "ASK_DIRECT_FIELD_JSON", "ASK_DIRECT_FIELD_TYPE", "ASK_DIRECT_CATALOG_STRING", "ASK_DIRECT_CATALOG_JSON", "ASK_DIRECT_CATALOG_CONTRACT", "ASK_DIRECT_RESOURCE_LIMIT", "ASK_DIRECT_STRING_LIMIT", "ASK_DIRECT_NON_JSON_TREE", "ASK_DIRECT_CANONICAL_ENVELOPE", "ASK_DIRECT_CANONICAL_KEYS", "ASK_DIRECT_RUNTIME_CHECK_REQUIRED"]);
  if (safeDirectCodes.has(message)) return message;
  if (["INVALID_MIXED_HISTORY_NARRATIVE", "INVALID_MIXED_HISTORY_CALCULATIONS"].includes(message)) return message;
  if (message === "Ask provider returned an empty answer.") return "EMPTY_ANSWER";
  if (message === "Ask provider returned an invalid response.") return "INVALID_ANSWER_BODY";
  if (message === "Ask response exposed internal reasoning data.") return "INTERNAL_REASONING_EXPOSURE";
  return "STRUCTURED_CONTRACT_INVALID";
}
