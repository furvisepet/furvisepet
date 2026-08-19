import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const batch = Number((process.argv.find((value) => value.startsWith("--batch=")) || "--batch=500").slice(8));
if (!Number.isInteger(batch) || batch < 1 || batch > 5000) fail("Use --batch=1..5000.", 2);
if (apply && !process.argv.includes("--confirm-apply")) fail("Apply mode requires --apply --confirm-apply.", 2);
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail("Supabase operator credentials are required.", 2);
try {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("cleanup_operational_records", { p_apply: apply, p_batch_limit: batch });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  console.log(JSON.stringify({
    apply,
    batch,
    completedCredits: Number(row?.completed_credit_count || 0),
    deletedDeletionRecords: Number(row?.deleted_deletion_count || 0),
    expiredDeletionRecords: Number(row?.expired_deletion_count || 0),
    missingCreditDispositions: Number(row?.missing_disposition_count || 0),
    releasedCredits: Number(row?.released_credit_count || 0),
    staleCredits: Number(row?.stale_credit_count || 0),
  }));
} catch { fail("Operational cleanup failed.", 1); }

function fail(message, code) { console.error(message); process.exit(code); }
