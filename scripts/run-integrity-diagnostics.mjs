import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail("Supabase operator credentials are required.", 2);
try {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("run_furvise_integrity_diagnostics");
  if (error) throw error;
  const issues = (data || []).map((row) => ({ count: Number(row.issue_count || 0), issue: String(row.issue_code || "unknown").slice(0, 80), severity: String(row.severity || "unknown").slice(0, 16) }));
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), issues }));
  if (issues.some((item) => item.count > 0 && item.severity === "critical")) process.exitCode = 1;
} catch { fail("Integrity diagnostics failed.", 1); }

function fail(message, code) { console.error(message); process.exit(code); }
