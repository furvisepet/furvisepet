import { createClient } from "@supabase/supabase-js";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../lib/security/request";
import { safeErrorForLog } from "../../../lib/security/logging";
import { beginRateLimitedRequest, getRateLimitRequestId } from "../../../lib/security/rate-limit";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticatedClient(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!isUuid(id)) return errorResponse("MEMORY_INVALID", "That remembered detail is invalid.", 400);
  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) { return errorResponse("MEMORY_INVALID", error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? "That memory update is too large." : "Send a valid memory update.", error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400); }
  if (!hasOnlyKeys(rawBody, ["action", "value"])) return errorResponse("MEMORY_INVALID", "The memory update contains unsupported fields.", 400);
  const body = rawBody as { action?: unknown; value?: unknown };
  const action = body?.action;
  if (action !== "confirm" && action !== "edit" && action !== "forget") return errorResponse("MEMORY_INVALID", "Choose a valid memory action.", 422);
  const value = typeof body?.value === "string" && body.value.length <= 500 ? body.value : null;
  if (action === "edit" && value === null) return errorResponse("MEMORY_INVALID", "Keep the remembered detail under 500 characters.", 422);
  const { data: ownedMemory } = await auth.supabase.from("furvise_memories").select("id").eq("id", id).eq("user_id", auth.userId).maybeSingle<{ id: string }>();
  if (!ownedMemory) return errorResponse("MEMORY_NOT_FOUND", "That remembered detail is no longer available.", 404);
  const requestId = getRateLimitRequestId(request);
  const rate = await beginRateLimitedRequest({ payload: { action, id, value }, policy: action === "forget" ? "DESTRUCTIVE_WRITE" : "MEMORY_WRITE", request, requestId, route: "/api/memories/[id]", userId: auth.userId });
  if (!rate.allowed) return rate.response;
  const { data, error } = await auth.supabase.rpc("manage_furvise_memory", { p_action: action, p_fact_value: value, p_memory_id: id });
  if (error) {
    console.error("[Furvise memory] lifecycle update failed", { action, ...safeErrorForLog(error), memoryId: id, userIdPresent: Boolean(auth.userId) });
    if (error.code === "P0002" || /MEMORY_NOT_FOUND/.test(error.message)) return errorResponse("MEMORY_NOT_FOUND", "That remembered detail is no longer available.", 404);
    if (error.code === "22023" || /MEMORY_INVALID/.test(error.message)) return errorResponse("MEMORY_INVALID", "That remembered detail could not be updated.", 422);
    if (error.code === "40001" || /MEMORY_CONFLICT/.test(error.message)) return errorResponse("MEMORY_CONFLICT", "That remembered detail changed. Refresh and try again.", 409);
    return errorResponse("MEMORY_PERSISTENCE_FAILED", "That remembered detail could not be updated.", 500);
  }
  const result = (Array.isArray(data) ? data[0] : data) as { action_status: string; memory_id: string; previous_memory_id: string } | null;
  return Response.json({ ok: true, status: result?.action_status || action, memoryId: result?.memory_id || id });
}

async function authenticatedClient(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return { response: errorResponse("MEMORY_FORBIDDEN", "Sign in again to update remembered details.", 401) };
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return { response: errorResponse("MEMORY_FORBIDDEN", "Sign in again to update remembered details.", 401) };
  return { supabase, userId: data.user.id };
}

function errorResponse(code: string, error: string, status: number) { return Response.json({ code, error, ok: false }, { status }); }
