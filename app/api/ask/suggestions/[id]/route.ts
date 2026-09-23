import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { validateSensitiveRequestOriginResponse } from "../../../../lib/security/headers/origin-policy";
import { safeErrorForLog } from "../../../../lib/security/logging";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../../lib/security/request";
import { beginIdempotentRateLimitedOperation } from "../../../../lib/security/idempotency";
import { createCanonicalCareAuthorityClient } from "../../../../lib/intelligence/care-authority-client.ts";
import { continueCanonicalSuggestion } from "../../../../lib/intelligence/canonical-suggestion-continuation.ts";
import { continueConfirmedAppend } from "../../../../lib/intelligence/append-turn.ts";
import type { CanonicalSuggestionRow as SuggestionRow } from "../../../../lib/intelligence/canonical-suggestion.ts";

type SuggestionErrorCode = "SUGGESTION_NOT_FOUND" | "SUGGESTION_FORBIDDEN" | "SUGGESTION_INVALID"
  | "SUGGESTION_CONFLICT" | "SUGGESTION_PERSISTENCE_FAILED";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = globalThis.crypto.randomUUID();
  const auth = await loadSuggestionContext(request, requestId);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!isUuid(id)) return suggestionError("SUGGESTION_INVALID", "That suggestion identifier is invalid.", 400, requestId);
  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return suggestionError("SUGGESTION_INVALID", "Send a valid suggestion update.", oversized ? 413 : 400, requestId);
  }
  if (!hasOnlyKeys(rawBody, ["action", "details"])) return suggestionError("SUGGESTION_INVALID", "Unsupported update fields.", 400, requestId);
  const body = rawBody as { action?: unknown; details?: unknown };
  const action = body.action;
  if (!["save", "monitor", "dismiss", "edit"].includes(String(action)))
    return suggestionError("SUGGESTION_INVALID", "Choose a valid suggestion action.", 422, requestId);
  const { data: suggestion, error } = await auth.supabase.from("ai_update_suggestions")
    .select("*").eq("id", id).eq("user_id", auth.userId).maybeSingle<SuggestionRow>();
  if (error) return suggestionError("SUGGESTION_PERSISTENCE_FAILED", "This suggestion could not be loaded.", 503, requestId);
  if (!suggestion) return suggestionError("SUGGESTION_NOT_FOUND", "This suggestion is no longer available.", 404, requestId);
  const gate = await beginIdempotentRateLimitedOperation({
    operationType: `suggestion.${action}`, payload: { action, details: body.details, suggestionId: id },
    policy: action === "dismiss" ? "DESTRUCTIVE_WRITE" : suggestion.type === "memory" ? "MEMORY_WRITE" : "CARE_WRITE",
    request, retention: action === "dismiss" ? "destructive" : "ordinary",
    route: "/api/ask/suggestions/[id]", supabase: auth.supabase, userId: auth.userId,
  });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    if (action === "monitor") return suggestionError("SUGGESTION_INVALID", "Monitoring is not supported by canonical suggestions.", 422, requestId);
    if (action === "edit" || action === "dismiss") {
      if (action === "edit" && (typeof body.details !== "string" || !body.details.trim() || body.details.length > 1000))
        return suggestionError("SUGGESTION_INVALID", "Add an update under 1,000 characters.", 422, requestId);
      const { data, error: updateError } = await auth.authority.rpc(
        action === "edit" ? "edit_ask_canonical_suggestion" : "transition_ask_suggestion",
        action === "edit" ? { p_user_id: auth.userId, p_suggestion_id: id, p_details: body.details }
          : { p_user_id: auth.userId, p_suggestion_id: id, p_action: "dismiss" });
      if (updateError) {
        const mapped = mapRpcError(updateError);
        return suggestionError(mapped.code, mapped.message, mapped.status, requestId);
      }
      const result = Array.isArray(data) ? data[0] : data;
      if (!result || (action === "edit" ? result.id !== id : result.suggestion_id !== id))
        return suggestionError("SUGGESTION_PERSISTENCE_FAILED", "The workflow update could not be confirmed.", 503, requestId);
      return Response.json({ ok: true, requestId, suggestionId: id,
        status: action === "edit" ? "pending" : result.apply_status,
        ...(action === "edit" ? { suggestion: toCanonicalSuggestion(result) } : {}),
        message: action === "edit" ? "Edited for display. Start a new Ask turn to authorize this change."
          : result.apply_status === "already_applied" ? "This suggestion was already applied." : "Not saved." });
    }
    let execution;
    try { execution = await continueCanonicalSuggestion({ suggestion, ...auth }); }
    catch (error) {
      logSuggestionFailure("canonical_continuation", error, { requestId, suggestionId: id });
      return suggestionError("SUGGESTION_CONFLICT", "This suggestion cannot execute. Start a new Ask turn.", 409, requestId);
    }
    if (!execution || execution.action.status !== "succeeded")
      return suggestionError("SUGGESTION_CONFLICT", execution?.action.errorMessage || "This suggestion cannot execute.", 409, requestId);
    let continuation;
    try { continuation = await continueConfirmedAppend({ supabase: auth.supabase, userId: auth.userId,
      assistantMessageId: suggestion.source_message_id!, action: execution.action }); }
    catch { continuation = { status: "unavailable" }; }
    return Response.json({ ok: true, requestId, status: execution.changed ? "applied" : "already_applied",
      suggestionId: id, suggestion: { ...toCanonicalSuggestion(suggestion), status: "saved" },
      action: execution.action, changed: execution.changed, ...(continuation ? { continuation } : {}),
      message: execution.action.resultMessage });
  });
}

function mapRpcError(error: PostgrestError): { code: SuggestionErrorCode; message: string; status: number } {
  const internal = `${error.message} ${error.details || ""}`;
  if (/SUGGESTION_NOT_FOUND/.test(internal)) return { code: "SUGGESTION_NOT_FOUND", message: "This improvement is no longer available.", status: 404 };
  if (/SUGGESTION_FORBIDDEN/.test(internal)) return { code: "SUGGESTION_FORBIDDEN", message: "This improvement is not available to this account.", status: 404 };
  if (/SUGGESTION_INVALID|22023/.test(internal) || error.code === "22023") return { code: "SUGGESTION_INVALID", message: "This improvement does not contain enough valid information to save.", status: 422 };
  if (/SUGGESTION_CONFLICT/.test(internal)) return { code: "SUGGESTION_CONFLICT", message: "This improvement conflicts with a newer update.", status: 409 };
  return { code: "SUGGESTION_PERSISTENCE_FAILED", message: "This improvement could not be saved.", status: 503 };
}

function suggestionError(code: SuggestionErrorCode, error: string, status: number, requestId: string) {
  return Response.json({ code, error, ok: false, requestId }, { status });
}

function logSuggestionFailure(operationStage: string, error: PostgrestError | null | unknown, context: Record<string, unknown>) {
  console.error("[Furvise suggestion] operation failed", {
    ...context,
    operationStage,
    ...safeErrorForLog(error),
  });
}

async function loadSuggestionContext(request: Request, requestId: string): Promise<{ response: Response } | { authority: SupabaseClient; supabase: SupabaseClient; userId: string }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token) return { response: Response.json({ code: "SUGGESTION_FORBIDDEN", error: "Your session expired. Sign in again to continue.", ok: false, requestId }, { status: 401 }) };
  if (!url || !key) return { response: suggestionError("SUGGESTION_PERSISTENCE_FAILED", "This improvement is temporarily unavailable.", 503, requestId) };
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return { response: Response.json({ code: "SUGGESTION_FORBIDDEN", error: "Your session expired. Sign in again to continue.", ok: false, requestId }, { status: 401 }) };
  const originResponse = validateSensitiveRequestOriginResponse(request);
  if (originResponse) return { response: originResponse };
  try {
    return { authority: createCanonicalCareAuthorityClient(), supabase, userId: data.user.id };
  } catch {
    return { response: suggestionError("SUGGESTION_PERSISTENCE_FAILED", "This improvement is temporarily unavailable.", 503, requestId) };
  }
}

function toCanonicalSuggestion(suggestion: SuggestionRow) {
  return { id: suggestion.id, type: suggestion.type, title: suggestion.title, details: suggestion.details, status: suggestion.status };
}
