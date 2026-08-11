import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { parseCareRequest } from "../../../lib/care-entry-api-server";
import { prepareCareEntryForUpdate } from "../../../lib/care-log.mjs";
import { isUuid } from "../../../lib/security/request";
import { beginIdempotentRateLimitedOperation } from "../../../lib/security/idempotency";
import type { CareEntryRow } from "../../../lib/supabase";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, routeContext: RouteContext) {
  const { id } = await routeContext.params;
  if (!isUuid(id)) return Response.json({ error: "That care entry ID is invalid." }, { status: 400 });
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const parsed = await parseCareRequest(request);
  if ("response" in parsed) return parsed.response;
  const { input } = parsed;
  const [entryResult, petResult] = await Promise.all([
    context.supabase.from("pet_care_entries").select("id").eq("id", id).eq("user_id", context.userId).is("deleted_at", null).maybeSingle<{ id: string }>(),
    context.supabase.from("dog_profiles").select("id").eq("id", input.petProfileId).eq("user_id", context.userId).maybeSingle<{ id: string }>(),
  ]);
  if (!entryResult.data || !petResult.data) return Response.json({ error: "That care entry is not available." }, { status: 404 });
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "care.update", payload: { id, input }, policy: "CARE_WRITE", request, route: "/api/care-entries/[id]", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const { data, error } = await context.supabase.from("pet_care_entries").update(prepareCareEntryForUpdate(input)).eq("id", id).eq("user_id", context.userId).select().single<CareEntryRow>();
    if (error || !data) return Response.json({ error: "The care entry could not be saved." }, { status: 503 });
    return Response.json({ entry: data });
  });
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  const { id } = await routeContext.params;
  if (!isUuid(id)) return Response.json({ error: "That care entry ID is invalid." }, { status: 400 });
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "care.delete", payload: { id }, policy: "DESTRUCTIVE_WRITE", request, retention: "destructive", route: "/api/care-entries/[id]", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const { data: entry } = await context.supabase.from("pet_care_entries").select("id,deleted_at").eq("id", id).eq("user_id", context.userId).maybeSingle<{ id: string; deleted_at: string | null }>();
    if (!entry) return Response.json({ error: "That care entry is not available." }, { status: 404 });
    if (entry.deleted_at) return new Response(null, { status: 204 });
    const { error } = await context.supabase.rpc("tombstone_my_care_entry", { p_entry_id: id, p_reason: "user_removed" });
    if (error) return Response.json({ error: "The care entry could not be deleted." }, { status: 503 });
    return new Response(null, { status: 204 });
  });
}
