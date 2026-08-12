import "server-only";
import { createClient } from "@supabase/supabase-js";
import { verifyV2PersistenceUser } from "./server-identity-core.ts";

/** Phase 1 only: this is intentionally not wired into production Ask. */
export async function createV2ShadowPersistenceBoundary(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceKey) throw new Error("V2_PERSISTENCE_CONFIGURATION_MISSING");

  const verifier = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const verifiedUserId = await verifyV2PersistenceUser(accessToken, verifier);
  const serviceClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { serviceClient, verifiedUserId };
}
