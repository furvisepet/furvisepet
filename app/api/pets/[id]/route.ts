import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { saveProfile } from "../../../lib/pet-profile-api-server";
import { isUuid } from "../../../lib/security/request";
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
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "profile.delete", payload: { id }, policy: "DESTRUCTIVE_WRITE", request, retention: "destructive", route: "/api/pets/[id]", supabase: auth.supabase, userId: auth.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const { data: owned } = await auth.supabase.from("dog_profiles").select("id").eq("id", id).eq("user_id", auth.userId).maybeSingle<{ id: string }>();
    if (!owned) return Response.json({ error: "That pet profile is not available." }, { status: 404 });
    const { error } = await auth.supabase.from("dog_profiles").delete().eq("id", id).eq("user_id", auth.userId);
    if (error) return Response.json({ error: "The pet profile could not be deleted." }, { status: 503 });
    return new Response(null, { status: 204 });
  });
}
