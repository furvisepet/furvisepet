import { getAuthenticatedApiContext } from "../../lib/authenticated-api-server";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, isUuid, readBoundedJson } from "../../lib/security/request";
import { beginIdempotentRateLimitedOperation } from "../../lib/security/idempotency";
import type { DogMemoryRow } from "../../lib/supabase";
import { isEligibleLegacyMemory } from "../../lib/intelligence/memory-integrity.ts";

export async function POST(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const parsed = await parseBody(request);
  if ("response" in parsed) return parsed.response;
  const { memoryIds, memories, petId } = parsed;
  if (memoryIds.length) return Response.json({ error: "Send memories to save." }, { status: 400 });
  const { data: pet } = await context.supabase.from("dog_profiles").select("id").eq("id", petId).eq("user_id", context.userId).maybeSingle<{ id: string }>();
  if (!pet) return Response.json({ error: "That pet profile is not available." }, { status: 404 });
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "legacy_memory.create", payload: { memories, petId }, policy: "MEMORY_WRITE", request, route: "/api/legacy-memories", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const { data: existing, error: existingError } = await context.supabase.from("dog_memories").select("text").eq("dog_profile_id", petId).eq("user_id", context.userId).eq("status", "active").returns<Array<{ text: string }>>();
    if (existingError) return Response.json({ error: "Remembered details are temporarily unavailable." }, { status: 503 });
    const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
    const seen = new Set((existing || []).map((item) => normalize(item.text)));
    let skippedDuplicates = 0;
    const rows = memories.flatMap((memory, index) => {
      const normalized = normalize(memory.text);
      if (!isEligibleLegacyMemory(memory) || seen.has(normalized)) { skippedDuplicates += 1; return []; }
      seen.add(normalized);
      return [{ confidence: memory.confidence, dog_profile_id: petId, idempotency_item_index: index, idempotency_key: gate.operation.key, source: memory.source || "ai_suggestion", text: memory.text.trim(), type: memory.type, user_id: context.userId }];
    });
    if (!rows.length) return Response.json({ saved: [], skippedDuplicates });
    let { data, error } = await context.supabase.from("dog_memories").insert(rows).select().returns<DogMemoryRow[]>();
    if (error?.code === "23505") {
      const replay = await context.supabase.from("dog_memories").select("*").eq("user_id", context.userId).eq("idempotency_key", gate.operation.key).order("idempotency_item_index").returns<DogMemoryRow[]>();
      data = replay.data; error = replay.error;
    }
    if (error) return Response.json({ error: "Remembered details could not be saved." }, { status: 503 });
    return Response.json({ saved: data || [], skippedDuplicates }, { status: 201 });
  });
}

export async function DELETE(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const parsed = await parseBody(request);
  if ("response" in parsed) return parsed.response;
  const { memoryIds, petId } = parsed;
  if (!memoryIds.length) return Response.json({ error: "Choose a remembered detail." }, { status: 400 });
  const { data: pet } = await context.supabase.from("dog_profiles").select("id").eq("id", petId).eq("user_id", context.userId).maybeSingle<{ id: string }>();
  if (!pet) return Response.json({ error: "That pet profile is not available." }, { status: 404 });
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "legacy_memory.delete", payload: { memoryIds, petId }, policy: "DESTRUCTIVE_WRITE", request, retention: "destructive", route: "/api/legacy-memories", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const { error } = await context.supabase.from("dog_memories").delete().in("id", memoryIds).eq("dog_profile_id", petId).eq("user_id", context.userId);
    if (error) return Response.json({ error: "Remembered details could not be removed." }, { status: 503 });
    return new Response(null, { status: 204 });
  });
}

async function parseBody(request: Request): Promise<{ response: Response } | { memoryIds: string[]; memories: Array<{ confidence: string; source?: string; text: string; type: string }>; petId: string }> {
  let raw: unknown;
  try { raw = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) {
    const tooLarge = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return { response: Response.json({ error: tooLarge ? "That memory update is too large." : "Send a valid memory update." }, { status: tooLarge ? 413 : 400 }) };
  }
  if (!hasOnlyKeys(raw, ["petId", "memories", "memoryIds"])) return { response: Response.json({ error: "The memory update contains unsupported fields." }, { status: 400 }) };
  const body = raw as Record<string, unknown>;
  const petId = typeof body.petId === "string" ? body.petId : "";
  const memoryIds = Array.isArray(body.memoryIds) ? body.memoryIds.filter(isUuid).slice(0, 50) : [];
  const memories = Array.isArray(body.memories) ? body.memories.flatMap((value) => {
    if (!hasOnlyKeys(value, ["type", "text", "confidence", "source"])) return [];
    const item = value as Record<string, unknown>;
    if (typeof item.type !== "string" || item.type.length > 80 || typeof item.text !== "string" || !item.text.trim() || item.text.length > 500 || typeof item.confidence !== "string" || item.confidence.length > 40 || (item.source !== undefined && (typeof item.source !== "string" || item.source.length > 120))) return [];
    return [{ confidence: item.confidence, source: item.source as string | undefined, text: item.text, type: item.type }];
  }).slice(0, 50) : [];
  if (!isUuid(petId) || (Array.isArray(body.memoryIds) && memoryIds.length !== body.memoryIds.length) || (Array.isArray(body.memories) && memories.length !== body.memories.length)) return { response: Response.json({ error: "Review the memory update fields and try again." }, { status: 400 }) };
  return { memoryIds, memories, petId };
}
