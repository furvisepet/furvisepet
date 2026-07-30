import { parseVetBriefDocument } from "../../lib/vet-brief/schema";
import { getVetBriefRequestContext, toPublicVetBriefRecord, type VetBriefDatabaseRow } from "../../lib/vet-brief/server";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../lib/security/request";
import { beginRateLimitedRequest, getRateLimitRequestId } from "../../lib/security/rate-limit";

export async function GET(request: Request) {
  const context = await getVetBriefRequestContext(request);
  if ("response" in context) return context.response;
  const petId = new URL(request.url).searchParams.get("pet") || "";
  if (!petId) return Response.json({ error: "Choose a pet." }, { status: 400 });
  const { data, error } = await context.supabase
    .from("vet_visit_briefs")
    .select("id, pet_profile_id, previous_version_id, version, generated_at, date_range_start, date_range_end, document_version, confirmed_title, status, confirmed_data")
    .eq("user_id", context.userId)
    .eq("pet_profile_id", petId)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<VetBriefDatabaseRow[]>();
  if (error) return Response.json({ error: "Vet Visit Brief history is temporarily unavailable." }, { status: 503 });
  return Response.json({ briefs: (data || []).map(toPublicVetBriefRecord).filter(Boolean) });
}

export async function POST(request: Request) {
  const context = await getVetBriefRequestContext(request);
  if ("response" in context) return context.response;
  let rawBody: unknown;
  try { rawBody = await readBoundedJson(request, API_BODY_LIMITS.vetBrief); }
  catch (error) {
    const oversized = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: oversized ? "The Vet Visit Brief request is too large." : "Send a valid Vet Visit Brief request." }, { status: oversized ? 413 : 400 });
  }
  if (!hasOnlyKeys(rawBody, ["petId", "document", "sourceEntryIds", "previousVersionId"])) return Response.json({ error: "The Vet Visit Brief request contains unsupported fields." }, { status: 400 });
  const body = rawBody as {
    petId?: unknown;
    document?: unknown;
    sourceEntryIds?: unknown;
    previousVersionId?: unknown;
  } | null;
  const petId = typeof body?.petId === "string" ? body.petId : "";
  const document = parseVetBriefDocument(body?.document);
  if (!isUuid(petId) || !document) return Response.json({ error: "Review the brief before confirming it." }, { status: 400 });

  const { data: profile } = await context.supabase.from("dog_profiles").select("id").eq("id", petId).eq("user_id", context.userId).maybeSingle<{ id: string }>();
  if (!profile) return Response.json({ error: "That pet profile is not available." }, { status: 404 });

  const requestId = getRateLimitRequestId(request);
  const rate = await beginRateLimitedRequest({
    payload: { petId, previousVersionId: body?.previousVersionId, sourceEntryIds: body?.sourceEntryIds },
    policy: "CARE_WRITE",
    request,
    requestId,
    route: "/api/vet-briefs",
    userId: context.userId,
  });
  if (!rate.allowed) return rate.response;

  const requestedSourceIds = Array.isArray(body?.sourceEntryIds)
    ? body.sourceEntryIds.filter(isUuid).slice(0, 300)
    : [];
  let verifiedSourceIds: string[] = [];
  if (requestedSourceIds.length) {
    const [care, concerns, legacyMemories, memories] = await Promise.all([
      context.supabase.from("pet_care_entries").select("id").eq("pet_profile_id", petId).eq("user_id", context.userId).in("id", requestedSourceIds).returns<Array<{ id: string }>>(),
      context.supabase.from("pet_concerns").select("id").eq("pet_profile_id", petId).eq("user_id", context.userId).in("id", requestedSourceIds).returns<Array<{ id: string }>>(),
      context.supabase.from("dog_memories").select("id").eq("dog_profile_id", petId).eq("user_id", context.userId).eq("status", "active").in("id", requestedSourceIds).returns<Array<{ id: string }>>(),
      context.supabase.from("furvise_memories").select("id").eq("user_id", context.userId).eq("status", "active").or(`pet_id.eq.${petId},pet_id.is.null`).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).in("id", requestedSourceIds).returns<Array<{ id: string }>>(),
    ]);
    verifiedSourceIds = [...new Set([care, concerns, legacyMemories, memories].flatMap((result) => (result.data || []).map((row) => row.id)))];
  }

  let previousVersionId: string | null = null;
  let version = 1;
  if (typeof body?.previousVersionId === "string" && body.previousVersionId) {
    if (!isUuid(body.previousVersionId)) return Response.json({ error: "The prior brief version is invalid." }, { status: 400 });
    const { data: previous } = await context.supabase.from("vet_visit_briefs").select("id, version").eq("id", body.previousVersionId).eq("pet_profile_id", petId).eq("user_id", context.userId).maybeSingle<{ id: string; version: number }>();
    if (!previous) return Response.json({ error: "The prior brief version is not available." }, { status: 404 });
    previousVersionId = previous.id;
    version = previous.version + 1;
  }

  const { data, error } = await context.supabase.from("vet_visit_briefs").insert({
    confirmed_data: document,
    confirmed_title: document.title,
    date_range_end: document.dateRange.to,
    date_range_start: document.dateRange.from,
    document_version: document.documentVersion,
    generated_at: document.generatedAt,
    pet_profile_id: petId,
    previous_version_id: previousVersionId,
    source_entry_ids: verifiedSourceIds,
    status: "confirmed",
    user_id: context.userId,
    version,
  }).select("*").single<VetBriefDatabaseRow>();
  if (error || !data) return Response.json({ error: "The brief could not be saved." }, { status: 503 });
  return Response.json({ brief: toPublicVetBriefRecord(data) }, { status: 201 });
}
