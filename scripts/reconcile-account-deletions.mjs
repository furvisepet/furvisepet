import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const batch = Number((process.argv.find((value) => value.startsWith("--batch=")) || "--batch=25").slice(8));
if (!Number.isInteger(batch) || batch < 1 || batch > 100) fail("Use --batch=1..100.", 2);
if (apply && !process.argv.includes("--confirm-apply")) fail("Apply mode requires --apply --confirm-apply.", 2);
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail("Supabase operator credentials are required.", 2);
try {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.from("account_deletion_requests").select("user_id,idempotency_key").eq("status", "auth_delete_failed").order("updated_at").limit(batch);
  if (error) throw error;
  let completed = 0; let failed = 0;
  if (apply) for (const row of data || []) {
    const result = await client.auth.admin.deleteUser(row.user_id, false);
    if (result.error) { failed += 1; continue; }
    const marked = await client.rpc("mark_account_deletion_result", { p_completed: true, p_error_code: null, p_idempotency_key: row.idempotency_key, p_user_id: row.user_id });
    if (marked.error) failed += 1; else completed += 1;
  }
  console.log(JSON.stringify({ apply, batch, candidates: data?.length || 0, completed, failed }));
  if (failed) process.exitCode = 1;
} catch { fail("Account deletion reconciliation failed.", 1); }

function fail(message, code) { console.error(message); process.exit(code); }
