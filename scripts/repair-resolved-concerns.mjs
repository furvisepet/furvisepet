import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

loadLocalEnvironment(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("Supabase URL and server credential are required.");
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const apply = process.argv.includes("--apply");

const dryRun = await runRepair(false);
console.table(dryRun);
if (!apply) {
  console.info(`Dry run complete. ${dryRun.length} confidently linked concern(s) would be resolved. Pass --apply to update them.`);
} else if (!dryRun.length) {
  console.info("No repair candidates found. No rows were changed.");
} else {
  const applied = await runRepair(true);
  console.table(applied);
  console.info(`Applied ${applied.length} concern repair(s).`);
}

async function runRepair(pApply) {
  const { data, error } = await supabase.rpc("repair_resolved_concern_suggestions", { p_apply: pApply });
  if (error) throw new Error(`Concern repair failed: ${error.code || "unknown"} ${error.message}`);
  return data || [];
}

function loadLocalEnvironment(path) {
  let source = "";
  try {
    source = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}
