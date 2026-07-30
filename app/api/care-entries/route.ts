import { getAuthenticatedApiContext } from "../../lib/authenticated-api-server";
import { parseCareRequest } from "../../lib/care-entry-api-server";
import { prepareCareEntryForInsert } from "../../lib/care-log.mjs";
import { beginRateLimitedRequest, getRateLimitRequestId } from "../../lib/security/rate-limit";
import type { CareEntryInput, CareEntryRow } from "../../lib/supabase";

export async function POST(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const parsed = await parseCareRequest(request, true);
  if ("response" in parsed) return parsed.response;
  const { dedupe, input } = parsed;

  const { data: pet } = await context.supabase.from("dog_profiles").select("id").eq("id", input.petProfileId).eq("user_id", context.userId).maybeSingle<{ id: string }>();
  if (!pet) return Response.json({ error: "That pet profile is not available." }, { status: 404 });

  const requestId = getRateLimitRequestId(request);
  const rate = await beginRateLimitedRequest({ idempotencyKey: request.headers.get("idempotency-key") || undefined, payload: { dedupe, input }, policy: "CARE_WRITE", request, requestId, route: "/api/care-entries", userId: context.userId });
  if (!rate.allowed) return rate.response;

  if (dedupe) {
    const cutoff = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recent, error: recentError } = await context.supabase.from("pet_care_entries")
      .select("id,user_id,pet_profile_id,category,title,note,severity,occurred_at,created_at,updated_at")
      .eq("pet_profile_id", input.petProfileId).eq("user_id", context.userId).gte("created_at", cutoff)
      .order("created_at", { ascending: false }).limit(50).returns<CareEntryRow[]>();
    if (recentError) return Response.json({ error: "Care entries are temporarily unavailable." }, { status: 503 });
    const duplicate = (recent || []).find((entry) => isDuplicateGeneratedEntry(entry, input));
    if (duplicate) return Response.json({ action: "duplicate", entry: duplicate });
  }

  const payload = prepareCareEntryForInsert(input, context.userId);
  const { data, error } = await context.supabase.from("pet_care_entries").insert(payload).select().single<CareEntryRow>();
  if (error || !data) return Response.json({ error: "The care entry could not be saved." }, { status: 503 });
  return Response.json(dedupe ? { action: "created", entry: data } : { entry: data }, { status: 201 });
}

function isDuplicateGeneratedEntry(entry: CareEntryRow, input: CareEntryInput) {
  if (!/^furvise\b/i.test(entry.title || "") && !/^furvise-generated (guidance|note)/i.test(entry.note || "")) return false;
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalize(entry.title || "") !== normalize(input.title || "")) return false;
  const existing = normalize(entry.note || "");
  const next = normalize(input.note || "");
  return existing === next || existing.slice(0, 200) === next.slice(0, 200);
}
