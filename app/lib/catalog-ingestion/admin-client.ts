import { createClient } from "@supabase/supabase-js";

export function createTrustedIngestionClientFromEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serverKey) {
    throw new Error("Trusted ingestion requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
  }
  if (typeof window !== "undefined") throw new Error("Trusted ingestion cannot run in a browser.");
  return createClient(url, serverKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
