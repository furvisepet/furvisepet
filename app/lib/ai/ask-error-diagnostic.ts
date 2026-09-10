/** Enumerated diagnostics only. Never return exception messages, stack traces,
 * evidence, credentials or model payloads in a public response. */
const stages = new Set(["interpretation", "subject_resolution", "context_loading", "evidence_retrieval",
  "history_retrieval", "answer_generation", "verification", "repair", "orchestration",
  "primary_timeout", "fallback_timeout", "primary_invalid_output", "fallback_invalid_output",
  "primary_provider_failed", "fallback_provider_failed", "interpretation_failed",
  "provider_deadline_exhausted", "response_serialization"]);
export function safeAskDiagnosticStage(value: unknown): string | null {
  return typeof value === "string" && stages.has(value) ? "ASK_" + value.toUpperCase() : null;
}
