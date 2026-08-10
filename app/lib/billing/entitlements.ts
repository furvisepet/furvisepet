import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseEffectiveEntitlements, type EffectiveEntitlements } from "./entitlement-types";

export type { AccountAccessRole, EffectiveEntitlements } from "./entitlement-types";

export class EntitlementResolutionError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Furvise could not verify account access.");
    this.name = "EntitlementResolutionError";
    this.cause = cause;
  }
}

export async function resolveEffectiveEntitlements(supabase: SupabaseClient): Promise<EffectiveEntitlements> {
  const { data, error } = await supabase.rpc("get_my_entitlements");
  if (error) throw new EntitlementResolutionError(error);
  const row = Array.isArray(data) ? data[0] : data;
  const parsed = parseEffectiveEntitlements(row);
  if (!parsed) throw new EntitlementResolutionError(new Error("INVALID_ENTITLEMENT_RESPONSE"));
  return parsed;
}
