/** Allowlisted diagnostics only: never return provider messages or raw payloads. */
export function featureFailureDetails(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const diagnostic = value.diagnostics && typeof value.diagnostics === "object"
    ? value.diagnostics as Record<string, unknown> : {};
  const status = typeof diagnostic.providerStatus === "number" && Number.isInteger(diagnostic.providerStatus)
    && diagnostic.providerStatus >= 400 && diagnostic.providerStatus <= 599 ? diagnostic.providerStatus : null;
  const identifier = diagnostic.providerErrorCode;
  const stage = typeof value.stage === "string" && [
    "configuration_failed", "primary_provider_failed", "primary_timeout", "primary_invalid_output",
    "fallback_provider_failed", "fallback_timeout", "fallback_invalid_output",
  ].includes(value.stage) ? value.stage : "unknown";
  const failureKind = value.name === "FeatureValidationError" ? "compatibility_validation"
    : stage === "configuration_failed" ? "configuration"
    : diagnostic.timedOut === true ? "timeout"
    : identifier === "ASK_OUTPUT_INCOMPLETE" ? "incomplete_output"
    : identifier === "ASK_OUTPUT_INVALID" ? "invalid_output"
    : identifier === "unsupported_parameter" || identifier === "unsupported_value" ? "unsupported_parameter"
    : status === 401 || status === 403 ? "provider_access"
    : status === 429 ? "provider_limit"
    : status === 400 ? "provider_request"
    : status !== null && status >= 500 ? "provider_unavailable" : "unknown";
  return { failureStage: stage, failureKind, providerStatus: status };
}
