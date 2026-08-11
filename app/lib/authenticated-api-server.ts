import "server-only";

import { createClient } from "@supabase/supabase-js";
import { resolveAuthenticatedApiContext } from "./authenticated-api-core";
import { validateSensitiveRequestOriginResponse } from "./security/headers/origin-policy";
import { createServerSupabase } from "./supabase/server";

export async function getAuthenticatedApiContext(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const context = await resolveAuthenticatedApiContext(request, {
    configurationAvailable: Boolean(url && key),
    createBearerClient(token) {
      return createClient(url!, key!, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    },
    createCookieClient: createServerSupabase,
  });
  if ("response" in context) return context;
  const originResponse = validateSensitiveRequestOriginResponse(request);
  if (originResponse) return { response: originResponse };
  return { supabase: context.supabase, user: context.user, userId: context.userId };
}
