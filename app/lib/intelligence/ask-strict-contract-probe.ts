import "server-only";
import { createHash } from "node:crypto";
import { AskPipelineError, type AskProviderEvent } from "../ai/ask-reasoning.ts";
import { interpretStructuredProviderResponse, structuredProviderEnvelopeDiagnostic } from "../ai/ask-provider.ts";
import { withProviderDeadline } from "../ai/execution-deadline.ts";
import { getActiveAiAdmission } from "../ai/usage-guard/context.ts";
import { AiAdmissionError } from "../ai/usage-guard/errors.ts";
import { boundedProviderTimeout, executeAdmittedResponsesRequest } from "../ai/usage-guard/provider-call-budget.ts";

const CAP = 8192;
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
type ProbeClient = { responses: { create: (request: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<Record<string, unknown>> } };
function stop(code: string, model: string, extras: Partial<AskProviderEvent> = {}): never {
  throw new AskPipelineError("interpretation_failed", "The diagnostic stopped without creating an answer or changing saved care records.",
    { model, elapsedMs: 0, providerErrorCode: code, providerErrorType: "diagnostic", ...extras });
}
function providerId(value: unknown, kind: "response" | "request") {
  if (typeof value !== "string" || value.length > 200) return null;
  const pattern = kind === "response" ? /^resp_[A-Za-z0-9_-]+$/ : /^(?:req_[A-Za-z0-9_-]+|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27})$/;
  return pattern.test(value) ? value : null;
}

function safeProviderError(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const allowedCodes = ["invalid_json_schema", "invalid_request_error", "context_length_exceeded", "unsupported_parameter", "invalid_parameter", "rate_limit_exceeded", "insufficient_quota", "credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "model_not_found", "server_error", "server_is_overloaded"];
  const allowedTypes = ["invalid_request_error", "authentication_error", "permission_error", "rate_limit_error", "server_error", "service_unavailable_error"];
  return {
    providerStatus: typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599 ? value.status : null,
    providerErrorCode: typeof value.code === "string" ? allowedCodes.includes(value.code) ? value.code : "other" : null,
    providerErrorType: typeof value.type === "string" ? allowedTypes.includes(value.type) ? value.type : "other" : null,
    providerRequestId: providerId(value.request_id ?? value._request_id, "request"),
  };
}

/** Temporary diagnostic build only. Always throws; never returns a plan. */
export async function runAskStrictContractProbe(input: {
  model: string;
  preparedSchema: Record<string, unknown>;
  createClient: () => ProbeClient;
  onProviderEvent?: (event: AskProviderEvent) => void;
}): Promise<never> {
  const { model, onProviderEvent } = input;
  if (process.env.VERCEL_ENV !== "preview") stop("ASK_DIAGNOSTIC_PREVIEW_REQUIRED", model);
  if (model !== "gpt-5.4-mini") stop("ASK_DIAGNOSTIC_MODEL_REQUIRED", model);
  if (getActiveAiAdmission()?.feature !== "ask") stop("ASK_DIAGNOSTIC_ADMISSION_REQUIRED", model);
  const minimalSchema = { type: "object", properties: { ok: { type: "boolean", enum: [true] } }, required: ["ok"], additionalProperties: false };
  const fullSchema = input.preparedSchema;
  const client = input.createClient();
  // Only the prepared schema is retained. Normal instructions/input and runtime context are not sent.
  // Use a fresh conversation and neutral non-care text: schemas can contain request-derived enum values.
  const common = { model, service_tier: "default", max_output_tokens: CAP, reasoning: { effort: "none" },
    instructions: "Return one minimal JSON object matching the supplied schema. Do not explain it or call tools.",
    input: "Generate a schema test object." };
  const controls = [{ label: "minimal", schema: minimalSchema }, { label: "full_wire", schema: fullSchema }] as const;
  for (const control of controls) {
    const request = { ...common, text: { format: { type: "json_schema", name: "furvise_ask_interpretation", strict: true, schema: control.schema } } };
    const requestIdentity = { label: control.label, model,
      requestSha256: hash(JSON.stringify(request)), schemaSha256: hash(JSON.stringify(control.schema)) };
    const started = Date.now();
    let response: Record<string, unknown>;
    let attempted = false;
    try {
      response = await executeAdmittedResponsesRequest({ model, maxOutputTokens: CAP, stage: "interpretation", reserveMs: 24_000, request,
        invoke: (sent) => {
          attempted = true;
          onProviderEvent?.({ stage: "interpretation", outcome: "started", model, elapsedMs: 0,
            configuredOutputLimit: CAP, validationDetails: `strict_contract_probe:${control.label}` });
          return withProviderDeadline(signal => client.responses.create(sent, { signal }),
            boundedProviderTimeout(25_000, 24_000, "interpretation"));
        } });
    } catch (error) {
      // Preserve the route's existing admission-denial and accounting-uncertainty handling.
      if (error instanceof AiAdmissionError) {
        if (attempted) onProviderEvent?.({ stage: "interpretation", outcome: "failed", model,
          elapsedMs: Date.now() - started, configuredOutputLimit: CAP, providerErrorCode: "ASK_INTERPRETATION_ADMISSION",
          validationDetails: `strict_contract_probe:${control.label}` });
        throw error;
      }
      const safeError = safeProviderError(error);
      console.info("[Ask strict contract probe]", { ...requestIdentity, outcome: "call_failed", attempted,
        elapsedMs: Date.now() - started, ...safeError });
      const timedOut = error instanceof Error && ["TimeoutError", "APIConnectionTimeoutError"].includes(error.name);
      onProviderEvent?.({ stage: "interpretation", outcome: "failed", model, elapsedMs: Date.now() - started,
        configuredOutputLimit: CAP, providerErrorCode: "ASK_DIAGNOSTIC_CALL_FAILED", providerStatus: safeError.providerStatus, timedOut,
        validationDetails: `strict_contract_probe:${control.label}` });
      stop("ASK_DIAGNOSTIC_CALL_FAILED", model, { timedOut });
    }
    const envelope = structuredProviderEnvelopeDiagnostic(response);
    console.info("[Ask strict contract probe]", { ...requestIdentity,
      providerResponseId: providerId(response.id, "response"), providerRequestId: providerId(response._request_id, "request"),
      elapsedMs: Date.now() - started, envelope });
    let validControl = false;
    let parsingAttempted = false;
    if (control.label === "minimal") {
      const result = interpretStructuredProviderResponse(response, raw => {
        const value = JSON.parse(raw) as Record<string, unknown>;
        if (!value || Array.isArray(value) || Object.keys(value).length !== 1 || value.ok !== true) throw new Error("INVALID_DIAGNOSTIC_CONTROL");
        return true;
      });
      validControl = result.status === "completed" && result.parsed === true;
      parsingAttempted = result.parsingAttempted;
    }
    onProviderEvent?.({ stage: "interpretation", outcome: (control.label === "minimal" ? validControl : envelope.responseStatus === "completed") ? "succeeded" : "failed", model,
      elapsedMs: Date.now() - started, configuredOutputLimit: CAP, providerEnvelope: envelope,
      inputTokens: envelope.inputTokens, outputTokens: envelope.outputTokens, ticketArrived: false,
      parsingAttempted, validationDetails: `strict_contract_probe:${control.label}` });
    if (control.label === "minimal" && !validControl) stop("ASK_DIAGNOSTIC_MINIMAL_FAILED", model, { providerEnvelope: envelope });
    if (control.label === "full_wire") stop("ASK_DIAGNOSTIC_TERMINAL", model, { providerEnvelope: envelope, parsingAttempted: false, ticketArrived: false });
  }
  return stop("ASK_DIAGNOSTIC_TERMINAL", model);
}
