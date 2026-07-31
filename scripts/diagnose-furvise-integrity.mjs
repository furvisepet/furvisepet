import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Supabase service configuration is required.");
const petId = process.argv[2] || null;
const client = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await client.rpc("diagnose_furvise_integrity", { p_pet_id: petId });
if (error) throw new Error(`Integrity diagnostic failed (${error.code || "unknown"}).`);
console.log(JSON.stringify({ petId, issueCount: data?.length || 0, issues: data || [] }, null, 2));
