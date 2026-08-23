import "server-only";

import { createClient } from "@supabase/supabase-js";

/** Trusted server boundary for Furvise-authored canonical care mutations. */
export function createCanonicalCareAuthorityClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("CANONICAL_CARE_AUTHORITY_CONFIGURATION_MISSING");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
