import { createClient } from "@supabase/supabase-js";
import { invalidLegacyMemoryReason, invalidStoredMemoryReason } from "../app/lib/intelligence/memory-integrity.ts";

const apply = process.argv.includes("--apply");
const confirmation = process.argv.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length);
if (apply && confirmation !== "REJECT_PROVABLY_INVALID_MEMORY_ROWS") {
  throw new Error("Apply requires --confirm=REJECT_PROVABLY_INVALID_MEMORY_ROWS.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and a Supabase server secret are required.");
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const canonical = await supabase.from("furvise_memories")
  .select("id,category,fact_key,fact_value,pet_id,source_excerpt,subject_type")
  .eq("status", "active");
if (canonical.error) throw canonical.error;
const legacy = await supabase.from("dog_memories").select("id,type,text").eq("status", "active");
if (legacy.error) throw legacy.error;

const provableCanonicalReasons = new Set([
  "authoritative_state_is_not_memory",
  "machine_state_is_not_memory",
  "raw_status_or_boolean",
  "machine_identifier",
  "standalone_number",
  "serialized_structure",
  "boolean_value",
  "null_value",
  "number_value",
  "array_value",
  "untyped_object",
]);
const canonicalTargets = (canonical.data || []).flatMap((row) => {
  const reason = invalidStoredMemoryReason(row);
  return reason && provableCanonicalReasons.has(reason) ? [{ id: row.id, reason }] : [];
});
const legacyTargets = (legacy.data || []).flatMap((row) => {
  const reason = invalidLegacyMemoryReason(row);
  return reason && provableCanonicalReasons.has(reason) ? [{ id: row.id, reason }] : [];
});

const report = {
  mode: apply ? "apply" : "dry-run",
  canonicalCount: canonicalTargets.length,
  legacyCount: legacyTargets.length,
  canonicalTargets,
  legacyTargets,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (apply && canonicalTargets.length) {
  const result = await supabase.from("furvise_memories").update({ status: "rejected", updated_at: new Date().toISOString() })
    .in("id", canonicalTargets.map((row) => row.id)).eq("status", "active").select("id");
  if (result.error || result.data?.length !== canonicalTargets.length) throw result.error || new Error("Canonical cleanup count mismatch.");
}
if (apply && legacyTargets.length) {
  const result = await supabase.from("dog_memories").update({ status: "rejected" })
    .in("id", legacyTargets.map((row) => row.id)).eq("status", "active").select("id");
  if (result.error || result.data?.length !== legacyTargets.length) throw result.error || new Error("Legacy cleanup count mismatch.");
}
