import { attachAskProviderSchemaDiagnostic } from "./ask-provider-schema-diagnostic.ts";

/** Server-only diagnostic data, never a provider body or a public error message. */
const codes = new Set(["invalid_json_schema", "invalid_request_error", "invalid_value", "unsupported_value",
  "unsupported_parameter", "missing_required_parameter", "invalid_api_key", "insufficient_quota",
  "model_not_found", "context_length_exceeded", "rate_limit_exceeded", "server_error", "internal_server_error",
  "request_timeout", "temporarily_unavailable", "invalid_prompt", "content_filter", "ABORT_ERR",
  "ETIMEDOUT", "ECONNRESET", "vector_store_timeout", "invalid_image", "invalid_image_format",
  "invalid_base64_image", "invalid_image_url", "image_too_large", "image_too_small", "image_parse_error",
  "image_content_policy_violation", "invalid_image_mode", "image_file_too_large",
  "unsupported_image_media_type", "empty_image_file", "failed_to_download_image", "image_file_not_found"]);
const types = new Set(["invalid_request_error", "authentication_error", "permission_error", "rate_limit_error",
  "server_error", "api_error", "insufficient_quota", "requests", "tokens", "Error", "UnknownError",
  "APIError", "BadRequestError", "AuthenticationError", "PermissionDeniedError", "NotFoundError",
  "ConflictError", "UnprocessableEntityError", "RateLimitError", "InternalServerError",
  "APIConnectionError", "APIConnectionTimeoutError", "APIUserAbortError", "AbortError", "TimeoutError",
  "StageDeadlineError"]);
const parameters = new Set(["model", "input", "instructions", "max_output_tokens", "reasoning",
  "reasoning.effort", "reasoning.summary", "text", "text.format", "text.format.type", "text.format.name",
  "text.format.schema", "text.format.strict", "response_format", "response_format.type",
  "response_format.json_schema", "response_format.json_schema.name", "response_format.json_schema.schema",
  "response_format.json_schema.strict", "tools", "tool_choice", "parallel_tool_calls", "temperature",
  "top_p", "service_tier", "stream", "store", "metadata", "previous_response_id", "truncation"]);

// Read only a fixed number of own data properties. Never invoke getters, toJSON,
// toString, header methods, or recursively inspect arbitrary error/cause objects.
function ownData(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch { return undefined; }
}
function enumValue(value: unknown, allowed: ReadonlySet<string>): string | null {
  if (value == null) return null;
  return typeof value === "string" && value.length <= 96 && allowed.has(value) ? value : "other";
}
function requestId(value: unknown): string | null {
  // OpenAI SDK APIError.requestID is an opaque req_ identifier. Unknown formats
  // are omitted, never truncated into a potentially sensitive string prefix.
  return typeof value === "string" && value.length === 36 && /^req_[a-f0-9]{32}$/.test(value) ? value : null;
}
export function safeAskProviderErrorDiagnostic(error: unknown) {
  const detail = ownData(error, "error");
  const status = ownData(error, "status");
  return attachAskProviderSchemaDiagnostic(error, {
    status: typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? status : null,
    code: enumValue(ownData(error, "code") ?? ownData(detail, "code"), codes),
    type: enumValue(ownData(error, "type") ?? ownData(detail, "type") ?? ownData(error, "name"), types),
    param: enumValue(ownData(error, "param") ?? ownData(detail, "param"), parameters),
    requestId: requestId(ownData(error, "requestID") ?? ownData(error, "request_id") ?? ownData(error, "requestId") ?? ownData(error, "_request_id")),
  });
}
export type AskProviderErrorDiagnostic = ReturnType<typeof safeAskProviderErrorDiagnostic>;
