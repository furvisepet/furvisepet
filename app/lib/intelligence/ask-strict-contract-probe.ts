import "server-only";
import { createHash } from "node:crypto";
import { AskPipelineError, type AskProviderEvent } from "../ai/ask-reasoning.ts";
import { structuredProviderEnvelopeDiagnostic } from "../ai/ask-provider.ts";
import { withProviderDeadline } from "../ai/execution-deadline.ts";
import { getActiveAiAdmission } from "../ai/usage-guard/context.ts";
import { AiAdmissionError } from "../ai/usage-guard/errors.ts";
import { boundedProviderTimeout, executeAdmittedResponsesRequest } from "../ai/usage-guard/provider-call-budget.ts";

import { expand } from "./ask-wire-codec.mjs";
import { completeInstantSchema } from "../furvise-brain/complete-instant.ts";

const CAP = 8192;
const EXPECTED_SCHEMA_SHAPE = "11e00fbf6f86fe25184702045ad9c2631d9e0736bcdc0de668ab3b9ac1737d0b";
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

// Fingerprinting only: UUID enum values remain unchanged in both transmitted schemas.
function schemaShapeFingerprint(schema: Record<string, unknown>) {
  const ids = new Map<string, string>();
  function walk(value: unknown, key = ""): unknown {
    if (key === "enum" && Array.isArray(value)) return value.map(item => {
      if (typeof item === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item)) {
        if (!ids.has(item)) ids.set(item, "UUID_LITERAL_" + ids.size);
        return ids.get(item);
      }
      return walk(item);
    });
    if (Array.isArray(value)) return value.map(item => walk(item));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, walk(item, name)]));
  }
  return hash(JSON.stringify(walk(schema)));
}

function withoutTimestampPattern(schema: Record<string, unknown>) {
  const removed: string[] = [];
  function walk(value: unknown, path = "#"): unknown {
    if (Array.isArray(value)) return value.map((item, index) => walk(item, path + "/" + index));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      if (key === "pattern" && item === completeInstantSchema.pattern) { removed.push(path + "/pattern"); return []; }
      return [[key, walk(item, path + "/" + key)]];
    }));
  }
  return { schema: walk(schema) as Record<string, unknown>, removed };
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
  const preparedSchemaSha256 = hash(JSON.stringify(input.preparedSchema));
  const preparedShapeFingerprint = schemaShapeFingerprint(input.preparedSchema);
  if (preparedShapeFingerprint !== EXPECTED_SCHEMA_SHAPE) stop("ASK_DIAGNOSTIC_SCHEMA_SHAPE", model);
  const inlinedSchema = expand(input.preparedSchema) as Record<string, unknown>;
  const relaxed = withoutTimestampPattern(input.preparedSchema);
  if (relaxed.removed.length !== 2) stop("ASK_DIAGNOSTIC_PATTERN_SCOPE", model);
  const client = input.createClient();
  // Only the prepared schema is retained. Normal instructions/input and runtime context are not sent.
  // Use a fresh conversation and neutral non-care text: schemas can contain request-derived enum values.
  const common = { model, service_tier: "default", max_output_tokens: CAP, reasoning: { effort: "none" },
    instructions: "Return one minimal JSON object matching the supplied schema. Do not explain it or call tools.",
    input: "Generate a schema test object." };
  const controls = [{ label: "refs_inlined", schema: inlinedSchema }, { label: "timestamp_pattern_removed", schema: relaxed.schema }] as const;
  for (const control of controls) {
    const request = { ...common, text: { format: { type: "json_schema", name: "furvise_ask_interpretation", strict: true, schema: control.schema } } };
    const requestIdentity = { label: control.label, model, preparedSchemaSha256, preparedShapeFingerprint,
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
    onProviderEvent?.({ stage: "interpretation", outcome: envelope.responseStatus === "completed" ? "succeeded" : "failed", model,
      elapsedMs: Date.now() - started, configuredOutputLimit: CAP, providerEnvelope: envelope,
      inputTokens: envelope.inputTokens, outputTokens: envelope.outputTokens, ticketArrived: false,
      parsingAttempted: false, validationDetails: `strict_contract_probe:${control.label}` });
    if (envelope.hasError || envelope.hasMessageRefusal || envelope.incompleteReason === "content_filter"
      || !["completed", "incomplete"].includes(envelope.responseStatus || ""))
      stop("ASK_DIAGNOSTIC_VARIANT_STOP", model, { providerEnvelope: envelope, parsingAttempted: false, ticketArrived: false });
    // Each is an independently authorized schema experiment, not a retry of the first request.
    // A well-formed incomplete response with reconciled usage can proceed to the second variant.
    if (control.label === "timestamp_pattern_removed") stop("ASK_DIAGNOSTIC_TERMINAL", model,
      { providerEnvelope: envelope, parsingAttempted: false, ticketArrived: false });
  }
  return stop("ASK_DIAGNOSTIC_TERMINAL", model);
}
