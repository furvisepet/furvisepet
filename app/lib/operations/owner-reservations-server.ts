import "server-only";
import { FURVISE_OWNER_ID } from "./owner-access";
import { getRateLimitBackendConfig } from "../security/rate-limit/config";
import { getConfiguredAiGuardStore } from "../ai/usage-guard/daily-usage-store";
import { deriveAiGuardOwnerScope } from "../ai/usage-guard/operation-identity";
import { unavailableOwnerReservations } from "../ai/usage-guard/owner-reservation-observation";

/** Caller identity is supplied only by the existing owner-authenticated route. */
export async function readOwnerProviderReservations(userId: string) {
  if (userId !== FURVISE_OWNER_ID) throw new Error("OWNER_RESERVATION_SCOPE_DENIED");
  try {
    const backend = getRateLimitBackendConfig();
    const store = getConfiguredAiGuardStore();
    if (!backend.configured || !store) return unavailableOwnerReservations("backend_unavailable");
    const ownerScope = deriveAiGuardOwnerScope({ userId, secret: backend.hashSecret });
    return await store.readOwnerReservations({ ownerScope, limit: 50 });
  } catch { return unavailableOwnerReservations("backend_observation_unavailable"); }
}
