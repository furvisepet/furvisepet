import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const batchArgument = process.argv.find((value) => value.startsWith("--batch="));
const batchLimit = batchArgument ? Number(batchArgument.slice("--batch=".length)) : 500;
if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 5000) throw new Error("Use --batch=1..5000.");
if (apply && !process.argv.includes("--confirm-apply")) throw new Error("Apply mode requires --apply --confirm-apply.");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase operator credentials are required.");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase.rpc("cleanup_expired_idempotency_operations", {
  p_apply: apply,
  p_batch_limit: batchLimit,
});
if (error) throw new Error(`Idempotency cleanup failed (${error.code || "UNKNOWN"}).`);
const result = Array.isArray(data) ? data[0] : data;
console.log(JSON.stringify({ apply, batchLimit, deletedCount: Number(result?.deleted_count || 0), eligibleCount: Number(result?.eligible_count || 0) }));
