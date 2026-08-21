import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { saveProfile } from "../../../lib/pet-profile-api-server";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../../lib/security/request";
import { beginIdempotentRateLimitedOperation } from "../../../lib/security/idempotency";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "That pet profile ID is invalid." }, { status: 400 });
  return saveProfile(request, id);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "That pet profile ID is invalid." }, { status: 400 });
  const auth = await getAuthenticatedApiContext(request);
  if ("response" in auth) return auth.response;
  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) {
    const tooLarge = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: tooLarge ? "That deletion request is too large." : "Confirm permanent pet profile deletion." }, { status: tooLarge ? 413 : 400 });
  }
  if (!hasOnlyKeys(rawBody, ["confirmation"]) || (rawBody as { confirmation?: unknown }).confirmation !== "DELETE") {
    return Response.json({ error: "Confirm permanent pet profile deletion." }, { status: 400 });
  }
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "profile.delete", payload: { confirmation: "DELETE", id, version: 1 }, policy: "DESTRUCTIVE_WRITE", request, retention: "destructive", route: "/api/pets/[id]", supabase: auth.supabase, userId: auth.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const { data: owned } = await auth.supabase.from("dog_profiles").select("id").eq("id", id).eq("user_id", auth.userId).maybeSingle<{ id: string }>();
    if (!owned) return Response.json({ error: "That pet profile is not available." }, { status: 404 });
    try {
      const { data, error } = await createOperationsAdminClient().rpc("delete_pet_profile_for_user", { p_pet_id: id, p_user_id: auth.userId });
      if (error) return Response.json({ error: "The pet profile could not be deleted." }, { status: 503 });
      if (data !== true) return Response.json({ error: "That pet profile is not available." }, { status: 404 });
    } catch {
      return Response.json({ error: "The pet profile could not be deleted." }, { status: 503 });
    }
    return new Response(null, { status: 204 });
  });
}
