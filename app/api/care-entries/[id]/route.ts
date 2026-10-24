import { historySourceMetadata } from "../../../lib/history-source-metadata";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";
import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { parseCareRequest } from "../../../lib/care-entry-api-server";
import { prepareCareEntryForUpdate } from "../../../lib/care-log.mjs";
import { isUuid } from "../../../lib/security/request";
import { beginIdempotentRateLimitedOperation } from "../../../lib/security/idempotency";
import type { CareEntryRow } from "../../../lib/supabase";

type RouteContext = { params: Promise<{ id: string }> };

type RemovalResultRow = {
  already_tombstoned: boolean;
  entry_id: string;
  lifecycle_dismissed: boolean;
  tombstoned_at: string;
};

export async function GET(request: Request, routeContext: RouteContext) {
  const { id } = await routeContext.params;
  const privateResponse = (body: unknown, status: number) => Response.json(body, { status, headers: PRIVATE_CACHE_HEADERS });
  if (!isUuid(id)) return privateResponse({ error: "That care entry ID is invalid." }, 400);
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) {
    const response = context.response;
    Object.entries(PRIVATE_CACHE_HEADERS).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
  const params = new URL(request.url).searchParams;
  const subjectId = params.get("subjectId"), revision = params.get("revision") ?? undefined, bodySHA256 = params.get("bodySHA256") ?? undefined;
  if (!subjectId || !isUuid(subjectId) || revision !== undefined && (revision.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(revision) || !Number.isFinite(Date.parse(revision)))
    || bodySHA256 !== undefined && !/^[a-f0-9]{64}$/.test(bodySHA256))
    return privateResponse({ error: "Invalid source details request." }, 400);
  try {
    const [entries, pets] = await Promise.all([
      context.supabase.from("pet_care_entries").select("*").eq("id", id).eq("user_id", context.userId)
        .eq("pet_profile_id", subjectId).is("deleted_at", null).limit(2).abortSignal(request.signal).returns<CareEntryRow[]>(),
      context.supabase.from("dog_profiles").select("id").eq("id", subjectId).eq("user_id", context.userId)
        .limit(2).abortSignal(request.signal).returns<{ id: string }[]>(),
    ]);
    if (entries.error || pets.error || request.signal.aborted) return privateResponse({ error: "Source details are temporarily unavailable." }, 503);
    if (entries.data?.length !== 1 || pets.data?.length !== 1) return privateResponse({ error: "That source is not available." }, 404);
    return privateResponse(historySourceMetadata(entries.data[0], { ownerId: context.userId, subjectId, recordId: id }, { revision, bodySHA256 }), 200);
  } catch {
    return privateResponse({ error: "Source details are temporarily unavailable." }, 503);
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const { id } = await routeContext.params;
  if (!isUuid(id)) return Response.json({ error: "That care entry ID is invalid." }, { status: 400 });
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const parsed = await parseCareRequest(request, false, true);
  if ("response" in parsed) return parsed.response;
  const { input } = parsed;
  const [entryResult, petResult] = await Promise.all([
    context.supabase.from("pet_care_entries").select("id,updated_at").eq("id", id).eq("user_id", context.userId)
      .eq("pet_profile_id", input.petProfileId).is("deleted_at", null).maybeSingle<{ id: string; updated_at: string }>(),
    context.supabase.from("dog_profiles").select("id").eq("id", input.petProfileId).eq("user_id", context.userId).maybeSingle<{ id: string }>(),
  ]);
  if (!entryResult.data || !petResult.data) return Response.json({ error: "That care entry is not available." }, { status: 404 });
  const expectedUpdatedAt = parsed.expectedUpdatedAt!;
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "care.update", payload: { id, input, expectedUpdatedAt }, policy: "CARE_WRITE", request, route: "/api/care-entries/[id]", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const update = prepareCareEntryForUpdate(input);
    const { data: rows, error } = await context.supabase.rpc("update_my_care_entry", {
      p_entry_id: id,
      p_pet_profile_id: input.petProfileId,
      p_expected_updated_at: expectedUpdatedAt,
      p_category: update.category,
      p_title: update.title,
      p_note: update.note,
      p_severity: update.severity,
      p_occurred_at: update.occurred_at,
    });
    const data = (rows as CareEntryRow[] | null)?.[0] || null;
    if (error?.code === "40001") return Response.json({ code: "CARE_ENTRY_STALE", error: "This note changed after you opened it. Reopen it before editing." }, { status: 409, headers: PRIVATE_CACHE_HEADERS });
    if (error || !data) return Response.json({ error: "The care entry could not be saved." }, { status: 503, headers: PRIVATE_CACHE_HEADERS });
    return Response.json({ entry: data, receipt: { operation: "care.update", entryId: data.id, subjectId: data.pet_profile_id, previousRevision: expectedUpdatedAt, revision: data.updated_at } }, { headers: PRIVATE_CACHE_HEADERS });
  });
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  const { id } = await routeContext.params;
  if (!isUuid(id)) return Response.json({ error: "That care entry ID is invalid." }, { status: 400 });
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "care.remove_history", payload: { id }, policy: "DESTRUCTIVE_WRITE", request, retention: "destructive", route: "/api/care-entries/[id]", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const { data: entry, error: entryError } = await context.supabase.from("pet_care_entries").select("id").eq("id", id).eq("user_id", context.userId).maybeSingle<{ id: string }>();
    if (entryError) return Response.json({ error: "The care entry could not be removed." }, { status: 503 });
    if (!entry) return Response.json({ error: "That care entry is not available." }, { status: 404 });
    const { data, error } = await context.supabase.rpc("remove_my_care_entry", {
      p_entry_id: id,
      p_stop_tracking: true,
    }).single<RemovalResultRow>();
    if (error || !data) return Response.json({ error: "The care entry could not be removed." }, { status: 503 });
    return Response.json({ removedFromHistory: true });
  });
}
