import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  decideAccountCountryDetection,
  detectCountryFromRequestHeaders,
  type AccountCountryProfile,
} from "../../../lib/account-country";
import type { UserProfileRow } from "../../../lib/supabase";

export async function POST(request: Request) {
  const context = await loadAccountRequestContext(request);
  if ("response" in context) return context.response;

  const { supabase, userId } = context;
  const { data: currentProfile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,country,country_source,country_detected_at,country_updated_at")
    .eq("user_id", userId)
    .maybeSingle<AccountCountryProfile>();

  if (profileError) {
    return Response.json({ error: "Furvise could not load account profile." }, { status: 500 });
  }

  const detectedCountry = detectCountryFromRequestHeaders(request.headers);
  const decision = decideAccountCountryDetection({
    currentProfile,
    detectedCountry,
  });

  if (!decision.shouldWrite && currentProfile) {
    return Response.json({ profile: currentProfile });
  }

  const now = new Date().toISOString();
  const payload = {
    country: decision.country,
    country_detected_at: decision.countrySource === "detected" ? now : null,
    country_source: decision.countrySource,
    country_updated_at: decision.countrySource === "env_default" ? now : null,
    user_id: userId,
  };
  const { data: savedProfile, error: saveError } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id,country,country_source,country_detected_at,country_updated_at")
    .single<UserProfileRow>();

  if (saveError) {
    return Response.json({ error: "Furvise could not save account profile." }, { status: 500 });
  }

  return Response.json({ profile: savedProfile });
}

async function loadAccountRequestContext(request: Request): Promise<
  | { response: Response }
  | {
      supabase: SupabaseClient;
      userId: string;
    }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: Response.json({ error: "Supabase is not configured." }, { status: 503 }) };

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData.user) return { response: Response.json({ error: "Your session has expired." }, { status: 401 }) };

  return { supabase, userId: userData.user.id };
}
