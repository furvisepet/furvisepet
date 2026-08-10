import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateSensitiveRequestOriginResponse } from "../security/headers/origin-policy";
import type { PlanId } from "../billing/plan-limits";
import { resolveEffectiveEntitlements } from "../billing/entitlements";
import { parseVetBriefDocument } from "./schema";

export async function getVetBriefRequestContext(request: Request): Promise<
  | { response: Response }
  | { monthlyAiCredits: number; planId: PlanId; supabase: SupabaseClient; userId: string }
> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { response: Response.json({ error: "Vet Visit Briefs are temporarily unavailable." }, { status: 503 }) };
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return { response: Response.json({ error: "Your session has expired." }, { status: 401 }) };
  const originResponse = validateSensitiveRequestOriginResponse(request);
  if (originResponse) return { response: originResponse };
  const entitlements = await resolveEffectiveEntitlements(supabase);
  return { monthlyAiCredits: entitlements.limits.monthlyAiCredits, planId: entitlements.effectivePlan, supabase, userId: data.user.id };
}

export type VetBriefDatabaseRow = {
  id: string;
  user_id: string;
  pet_profile_id: string;
  previous_version_id: string | null;
  version: number;
  generated_at: string;
  date_range_start: string;
  date_range_end: string;
  source_entry_ids: string[];
  document_version: number;
  confirmed_title: string;
  status: "confirmed" | "archived";
  confirmed_data: unknown;
};

export function toPublicVetBriefRecord(row: VetBriefDatabaseRow) {
  const document = parseVetBriefDocument(row.confirmed_data);
  if (!document) return null;
  return {
    id: row.id,
    petProfileId: row.pet_profile_id,
    generatedAt: row.generated_at,
    dateRange: { from: row.date_range_start, to: row.date_range_end },
    version: row.version,
    status: row.status,
    previousVersionId: row.previous_version_id,
    document,
  };
}
