import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { saveProfile } from "../../../lib/pet-profile-api-server";
import { isUuid } from "../../../lib/security/request";
import { beginRateLimitedRequest, getRateLimitRequestId } from "../../../lib/security/rate-limit";

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
  const { data: owned } = await auth.supabase.from("dog_profiles").select("id").eq("id", id).eq("user_id", auth.userId).maybeSingle<{ id: string }>();
  if (!owned) return Response.json({ error: "That pet profile is not available." }, { status: 404 });
  const requestId = getRateLimitRequestId(request);
  const rate = await beginRateLimitedRequest({ payload: { id }, policy: "DESTRUCTIVE_WRITE", request, requestId, route: "/api/pets/[id]", userId: auth.userId });
  if (!rate.allowed) return rate.response;
  const { error } = await auth.supabase.from("dog_profiles").delete().eq("id", id).eq("user_id", auth.userId);
  if (error) return Response.json({ error: "The pet profile could not be deleted." }, { status: 503 });
  return new Response(null, { status: 204 });
}
