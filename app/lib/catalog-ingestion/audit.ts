import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordIngestionEvent(
  supabase: SupabaseClient,
  event: {
    actorId?: string | null;
    batchId: string;
    eventType: string;
    message?: string | null;
    metadata?: Record<string, unknown> | null;
    recordId?: string | null;
  },
) {
  const { error } = await supabase.from("product_ingestion_events").insert({
    actor_id: event.actorId || null,
    batch_id: event.batchId,
    event_type: event.eventType,
    message: event.message || null,
    metadata: event.metadata || null,
    record_id: event.recordId || null,
  });
  if (error) throw new Error(`Could not record ingestion event: ${safeDatabaseMessage(error)}`);
}

export function safeDatabaseMessage(error: unknown) {
  if (!error || typeof error !== "object") return "database operation failed";
  const value = error as { code?: unknown; message?: unknown };
  return [value.code, value.message].filter((item) => typeof item === "string").join(": ") || "database operation failed";
}
