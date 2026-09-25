import { revalidatePath } from "next/cache";
import { getAuthenticatedApiContext } from "../../../../lib/authenticated-api-server";
import { executeActionCapability } from "../../../../lib/application-actions/capabilities.ts";
import { continueConfirmedAppend } from "../../../../lib/intelligence/append-turn.ts";
import { emitOperationalEvent } from "../../../../lib/operations/events";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../../lib/security/request";
import { PUBLIC_V1_CAPABILITIES } from "../../../../lib/public-v1-capabilities.ts";

type RouteContext = { params: Promise<{ messageId: string }> };

// The body intentionally names only an opaque server capability. It never carries action semantics.
export async function POST(request: Request, routeContext: RouteContext) {
  const { messageId } = await routeContext.params;
  if (!isUuid(messageId)) return unavailable();
  const auth = await getAuthenticatedApiContext(request);
  if ("response" in auth) return auth.response;
  if (!PUBLIC_V1_CAPABILITIES.askMutations) return unavailable();
  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) { return Response.json({ error: error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? "That action request is too large." : "Send a valid action request." }, { status: error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400 }); }
  if (!hasOnlyKeys(rawBody, ["actionId", "decision"])) return Response.json({ error: "That action request contains unsupported fields." }, { status: 400 });
  const body = rawBody as { actionId?: unknown; decision?: unknown };
  if (typeof body.actionId !== "string" || !isUuid(body.actionId) || (body.decision !== "confirm" && body.decision !== "cancel")) return Response.json({ error: "Choose confirm or cancel for this action." }, { status: 422 });
  let execution;
  try { execution = await executeActionCapability({ capabilityId: body.actionId, assistantMessageId: messageId, userId: auth.userId, mode: body.decision === "cancel" ? "cancel" : "confirm", recentAuthContext: auth }); }
  catch (error) {
    if(error instanceof Error && error.message === "RECENT_AUTH_REQUIRED")return Response.json({code:"RECENT_AUTH_REQUIRED",error:"For your security, sign in again before permanently deleting this pet."},{status:401,headers:{"Cache-Control":"private, no-store"}});
    return Response.json({ error: "That action could not be verified." }, { status: 503 });
  }
  if (!execution) return unavailable(); // same answer for guessed IDs, other users, and wrong messages
  const { action } = execution;
  try { emitOperationalEvent({ actorId: auth.userId, errorCode: action.status === "failed" ? "ASK_ACTION_FAILED" : undefined,
    eventType: action.status === "failed" ? "application_error" : "application_action", feature: "ask_application_action",
    metadata: { actionKind: action.kind, outcome: action.status }, operationId: body.actionId,
    requestId: action.sourceMessageId || body.actionId, resourceId: action.petId,
    route: "/api/ask/actions/[messageId]", severity: action.status === "failed" ? "warning" : "info" }); }
  catch { console.warn("[Ask] Action telemetry unavailable"); }
  if (action.status === "succeeded") revalidateActionViews(action.petId);
  let continuation;
  if (action.status === "succeeded" && body.decision === "confirm") {
    try { continuation = await continueConfirmedAppend({ supabase: auth.supabase, userId: auth.userId, assistantMessageId: messageId, action }); }
    catch { continuation = { status: "unavailable" }; } // A failed read cannot erase Heart's receipt.
  }
  return Response.json({ action, changed: execution.changed, ...(continuation ? { continuation } : {}) });
}

function unavailable() { return Response.json({ error: "That action is no longer available." }, { status: 404 }); }
function revalidateActionViews(petId: string) {
  for (const path of ["/pets", `/pets/${petId}`, `/dogs/${petId}/memories`, "/history", "/care-log", "/vet-brief", "/dashboard", "/today"]) {
    try { revalidatePath(path); }
    catch { console.warn("[Ask] Action view refresh unavailable"); }
  }
}
