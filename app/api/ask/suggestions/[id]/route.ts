import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { validateSensitiveRequestOriginResponse } from "../../../../lib/security/headers/origin-policy";
import { safeErrorForLog } from "../../../../lib/security/logging";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../../lib/security/request";
import { beginIdempotentRateLimitedOperation } from "../../../../lib/security/idempotency";
import { prepareMemorySuggestion } from "../../../../lib/intelligence/memory-suggestion.ts";
import { createCanonicalCareAuthorityClient } from "../../../../lib/intelligence/care-authority-client.ts";

type SuggestionStatus = "pending" | "saved" | "dismissed";
type SuggestionRow = {
  id: string;
  user_id: string;
  pet_profile_id: string;
  source_message_id: string | null;
  concern_id: string | null;
  care_entry_id?: string | null;
  applied_at?: string | null;
  type: "history" | "memory" | "concern_resolution" | "concern_opening";
  title: string;
  details: string | null;
  payload: Record<string, unknown>;
  status: SuggestionStatus;
};

type ApplyRow = {
  apply_status: "applied" | "already_applied";
  suggestion_id: string;
  concern_id: string | null;
  care_entry_id: string | null;
  concern_status: string | null;
  applied_at: string | null;
};

type SuggestionErrorCode =
  | "SUGGESTION_NOT_FOUND"
  | "SUGGESTION_FORBIDDEN"
  | "SUGGESTION_INVALID"
  | "SUGGESTION_CONFLICT"
  | "SUGGESTION_PERSISTENCE_FAILED";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = globalThis.crypto.randomUUID();
  const auth = await loadSuggestionContext(request, requestId);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!isUuid(id)) return suggestionError("SUGGESTION_INVALID", "That improvement identifier is invalid.", 400, requestId);
  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return suggestionError("SUGGESTION_INVALID", oversized ? "That improvement update is too large." : "Send a valid improvement update.", oversized ? 413 : 400, requestId);
  }
  if (!hasOnlyKeys(rawBody, ["action", "details"])) return suggestionError("SUGGESTION_INVALID", "The improvement update contains unsupported fields.", 400, requestId);
  const body = rawBody as { action?: unknown; details?: unknown };
  const action = body?.action;
  if (action !== "save" && action !== "monitor" && action !== "dismiss" && action !== "edit") {
    return suggestionError("SUGGESTION_INVALID", "Choose a valid suggestion action.", 422, requestId);
  }

  const { data: suggestion, error } = await auth.supabase
    .from("ai_update_suggestions")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .maybeSingle<SuggestionRow>();
  if (error) {
    logSuggestionFailure("load_suggestion", error, { id, requestId, userOwnershipResult: "unknown" });
    return suggestionError("SUGGESTION_PERSISTENCE_FAILED", "This improvement could not be loaded.", 503, requestId);
  }
  if (!suggestion) {
    logSuggestionFailure("load_suggestion", null, { id, requestId, userOwnershipResult: false });
    return suggestionError("SUGGESTION_NOT_FOUND", "This improvement is no longer available.", 404, requestId);
  }

  const gate = await beginIdempotentRateLimitedOperation({
    operationType: `suggestion.${action}`,
    payload: { action, details: body.details, suggestionId: id },
    policy: action === "dismiss" ? "DESTRUCTIVE_WRITE" : suggestion.type === "memory" ? "MEMORY_WRITE" : "CARE_WRITE",
    request,
    retention: action === "dismiss" ? "destructive" : "ordinary",
    route: "/api/ask/suggestions/[id]",
    supabase: auth.supabase,
    userId: auth.userId,
  });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {

  const diagnostic = await loadSuggestionDiagnostic(auth.supabase, auth.userId, suggestion);
  const logContext = {
    requestId,
    suggestionId: suggestion.id,
    petId: suggestion.pet_profile_id,
    userOwnershipResult: true,
    linkedConcernId: suggestion.concern_id,
    concernStatus: diagnostic.concernStatus,
    existingCareEntryId: diagnostic.careEntryId,
  };

  if (action === "edit") {
    if (suggestion.status !== "pending") {
      return suggestionError("SUGGESTION_CONFLICT", "This improvement has already been actioned.", 409, requestId);
    }
    const details = typeof body?.details === "string" ? body.details.replace(/\s+/g, " ").trim() : "";
    if (!details || details.length > 1_000) return suggestionError("SUGGESTION_INVALID", "Add an update under 1,000 characters before saving.", 422, requestId);
    const { data, error: updateError } = await auth.authority
      .from("ai_update_suggestions")
      .update({ details, payload: { ...suggestion.payload, note: details } })
      .eq("id", id)
      .eq("user_id", auth.userId)
      .eq("status", "pending")
      .select("*")
      .single<SuggestionRow>();
    if (updateError || !data) {
      logSuggestionFailure("edit_suggestion", updateError, logContext);
      return suggestionError("SUGGESTION_PERSISTENCE_FAILED", "This improvement could not be edited.", 503, requestId);
    }
    return Response.json({ ok: true, requestId, status: "pending", suggestion: toCanonicalSuggestion(data) });
  }

  if (action === "dismiss" || action === "monitor") {
    const { data, error: transitionError } = await auth.authority.rpc("transition_ask_suggestion", {
      p_user_id: auth.userId, p_suggestion_id: id, p_action: action,
    });
    if (transitionError) {
      const mapped = mapRpcError(transitionError);
      logSuggestionFailure("transition_suggestion", transitionError, logContext);
      return suggestionError(mapped.code, mapped.message, mapped.status, requestId);
    }
    const result = (Array.isArray(data) ? data[0] : data) as (Omit<ApplyRow, "apply_status"> & { apply_status: "applied" | "already_applied" | "dismissed" }) | null;
    if (!result || result.suggestion_id !== id || !["applied", "already_applied", "dismissed"].includes(result.apply_status)) {
      return suggestionError("SUGGESTION_PERSISTENCE_FAILED", "The update result could not be confirmed. Try again.", 503, requestId);
    }
    return Response.json({ ok: true, requestId, status: result.apply_status, suggestionId: result.suggestion_id,
      concernId: result.concern_id, careEntryId: result.care_entry_id, concernStatus: result.concern_status,
      appliedAt: result.applied_at, message: result.apply_status === "dismissed" ? "Not saved."
        : result.apply_status === "already_applied" ? "This suggestion was already applied." : "This concern is being monitored." });
  }

  if (suggestion.type === "memory") return saveMemorySuggestion(auth.authority, auth.userId, suggestion, requestId, logContext);

  const { data, error: rpcError } = await auth.authority.rpc("apply_furvise_server_state_suggestion", {
    p_suggestion_id: suggestion.id,
    p_user_id: auth.userId,
  });
  if (rpcError) {
    const mapped = mapRpcError(rpcError);
    logSuggestionFailure("apply_state_suggestion", rpcError, { ...logContext, rpcErrorCode: rpcError.code });
    return suggestionError(mapped.code, mapped.message, mapped.status, requestId);
  }
  const result = (Array.isArray(data) ? data[0] : data) as ApplyRow | null;
  if (!result) {
    logSuggestionFailure("apply_state_suggestion_empty_result", null, logContext);
    return suggestionError("SUGGESTION_PERSISTENCE_FAILED", "This improvement could not be saved.", 503, requestId);
  }
  const alreadyApplied = result.apply_status === "already_applied";
  return Response.json({
    ok: true,
    requestId,
    status: result.apply_status,
    suggestionId: result.suggestion_id,
    concernId: result.concern_id,
    careEntryId: result.care_entry_id,
    concernStatus: result.concern_status,
    appliedAt: result.applied_at,
    suggestion: { ...toCanonicalSuggestion(suggestion), status: "saved" },
    message: alreadyApplied ? "This improvement was already added to the pet’s history." : "This improvement was added to the pet’s history.",
  });
  });
}

async function saveMemorySuggestion(authority: SupabaseClient, userId: string, suggestion: SuggestionRow, requestId: string, logContext: Record<string, unknown>) {
  const prepared = prepareMemorySuggestion(suggestion);
  if (!prepared && suggestion.status !== "saved") return suggestionError("SUGGESTION_INVALID", "That suggestion is not a durable remembered detail.", 422, requestId);
  const { data, error } = await authority.rpc("save_ask_memory_suggestion", {
    p_user_id: userId, p_suggestion_id: suggestion.id, p_expected_pet_id: suggestion.pet_profile_id,
    p_expected_note: prepared?.note || "", p_expected_type: prepared?.memoryType || "",
  });
  if (error) {
    logSuggestionFailure("save_memory_suggestion", error, logContext);
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "40001" ? 409 : error.code === "22023" ? 422 : 503;
    const code: SuggestionErrorCode = status === 403 ? "SUGGESTION_FORBIDDEN" : status === 404 ? "SUGGESTION_NOT_FOUND" : status === 409 ? "SUGGESTION_CONFLICT" : status === 422 ? "SUGGESTION_INVALID" : "SUGGESTION_PERSISTENCE_FAILED";
    return suggestionError(code, "This remembered detail could not be saved. Refresh and try again.", status, requestId);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { apply_status?: string; memory_id?: string | null } | null;
  if (!row || !["applied", "already_applied"].includes(row.apply_status || "") || (row.apply_status === "applied" && !row.memory_id)) {
    return suggestionError("SUGGESTION_PERSISTENCE_FAILED", "This remembered detail could not be confirmed.", 503, requestId);
  }
  return Response.json({ ok: true, requestId, status: row.apply_status, suggestionId: suggestion.id,
    memoryId: row.memory_id || null, concernId: null, careEntryId: null,
    message: row.apply_status === "already_applied" ? "This suggestion was already saved." : "This detail was remembered." });
}

async function loadSuggestionDiagnostic(supabase: SupabaseClient, userId: string, suggestion: SuggestionRow) {
  const [concernResult, entryResult] = await Promise.all([
    suggestion.concern_id
      ? supabase.from("pet_concerns").select("status").eq("id", suggestion.concern_id).eq("user_id", userId).maybeSingle<{ status: string }>()
      : Promise.resolve({ data: null }),
    supabase.from("pet_care_entries").select("id").eq("user_id", userId)
      .or(`id.eq.${suggestion.care_entry_id || "00000000-0000-0000-0000-000000000000"},state_suggestion_id.eq.${suggestion.id}`)
      .order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>(),
  ]);
  return { concernStatus: concernResult.data?.status || null, careEntryId: entryResult.data?.id || suggestion.care_entry_id || null };
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
