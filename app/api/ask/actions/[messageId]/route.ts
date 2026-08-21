import { revalidatePath } from "next/cache";
import { getAuthenticatedApiContext } from "../../../../lib/authenticated-api-server";
import { executeActionCapability } from "../../../../lib/application-actions/capabilities.ts";
import { emitOperationalEvent } from "../../../../lib/operations/events";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../../lib/security/request";

type RouteContext = { params: Promise<{ messageId: string }> };

// The body intentionally names only an opaque server capability. It never carries action semantics.
export async function POST(request: Request, routeContext: RouteContext) {
  const { messageId } = await routeContext.params;
  if (!isUuid(messageId)) return unavailable();
  const auth = await getAuthenticatedApiContext(request);
  if ("response" in auth) return auth.response;
  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) { return Response.json({ error: error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? "That action request is too large." : "Send a valid action request." }, { status: error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400 }); }
  if (!hasOnlyKeys(rawBody, ["actionId", "decision"])) return Response.json({ error: "That action request contains unsupported fields." }, { status: 400 });
  const body = rawBody as { actionId?: unknown; decision?: unknown };
  if (typeof body.actionId !== "string" || !isUuid(body.actionId) || (body.decision !== "confirm" && body.decision !== "cancel")) return Response.json({ error: "Choose confirm or cancel for this action." }, { status: 422 });
  let execution;
  try { execution = await executeActionCapability({ capabilityId: body.actionId, assistantMessageId: messageId, userId: auth.userId, mode: body.decision === "cancel" ? "cancel" : "confirm" }); }
  catch { return Response.json({ error: "That action could not be verified." }, { status: 503 }); }
  if (!execution) return unavailable(); // same answer for guessed IDs, other users, and wrong messages
  const { action } = execution;
  emitOperationalEvent({ actorId: auth.userId, errorCode: action.status === "failed" ? "ASK_ACTION_FAILED" : undefined,
    eventType: action.status === "failed" ? "application_error" : "application_action", feature: "ask_application_action",
    metadata: { actionKind: action.kind, outcome: action.status }, operationId: body.actionId,
    requestId: action.sourceMessageId || body.actionId, resourceId: action.petId,
    route: "/api/ask/actions/[messageId]", severity: action.status === "failed" ? "warning" : "info" });
  if (action.status === "succeeded") revalidateActionViews(action.petId);
  return Response.json({ action, changed: execution.changed });
}

function unavailable() { return Response.json({ error: "That action is no longer available." }, { status: 404 }); }
function revalidateActionViews(petId: string) {
  revalidatePath("/pets"); revalidatePath(`/pets/${petId}`); revalidatePath(`/dogs/${petId}/memories`);
  revalidatePath("/care-log"); revalidatePath("/vet-brief");
}
