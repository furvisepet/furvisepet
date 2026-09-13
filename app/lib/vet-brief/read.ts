import { recoverTransientRead } from "../security/read-recovery.ts";

/** A failed owner-scoped read is unavailable, never evidence that the row is absent. */
export async function readVetBrief<T extends { data: unknown; error: unknown }>(read: () => PromiseLike<T>): Promise<T | { data: null; error: unknown }> {
  try { return await recoverTransientRead(read); }
  catch (error) { return { data: null, error }; }
}

export function vetBriefReadUnavailable(stage: string, error: unknown) {
  const detail = error && typeof error === "object" ? error as { code?: unknown; status?: unknown } : {};
  // Never log database messages, records, tokens, or provider response bodies.
  const code = typeof detail.code === "string" && /^[A-Z0-9_]{1,48}$/.test(detail.code) ? detail.code : "UNKNOWN";
  const status = typeof detail.status === "number" ? detail.status : null;
  console.warn("[Furvise Vet Brief] database read unavailable", { stage, code, status });
  return Response.json({ error: "Saved information is temporarily unavailable. Your work has been kept; please try again.", code: "VET_BRIEF_READ_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
}
