import type { ConfirmedTemporalScope } from "./ask-request-contract.ts";
type AskIdentityPayload = { confirmedTemporalScope?: ConfirmedTemporalScope; mode?: "note"; conversationId: string; locale: string; timeZone?: string; petId: string; question: string };
type OwnedPersistedTurn = { confirmedTemporalScope?: ConfirmedTemporalScope; conversationId: string; question: string | null; userSequence: number };

/** Recover only known transport versions of an owned turn. Every candidate
 * still passes the original full-payload hash and lease checks. */
export async function claimWithRestoredAskOrigin<T extends object>({ claim, payload, persisted }: {
  claim: (payload: AskIdentityPayload) => Promise<T>;
  payload: AskIdentityPayload;
  persisted: OwnedPersistedTurn | null;
}): Promise<T> {
  // A persisted turn cannot yet prove the original scoped request. Do not replay,
  // even if a caller supplies or omits a purported scope. Legacy unscoped turns remain supported.
  if (payload.confirmedTemporalScope !== undefined || persisted?.confirmedTemporalScope !== undefined)
    throw new Error("ASK_TEMPORAL_SCOPE_DURABILITY_UNAVAILABLE");
  let result = await claim(payload);
  if (!persisted || !payload.conversationId || persisted.conversationId !== payload.conversationId
    || persisted.question !== payload.question) return result;
  const candidates: AskIdentityPayload[] = [];
  if (persisted.userSequence === 1) candidates.push({ ...payload, conversationId: "" });
  // Pre-timezone requests were hashed without this optional field. A matching
  // legacy hash can recover those requests; it cannot alter a newer zone-bound
  // request, whose hash necessarily includes its original timezone.
  if (payload.timeZone) {
    const legacy = { ...payload }; delete legacy.timeZone;
    candidates.push(legacy);
    if (persisted.userSequence === 1) candidates.push({ ...legacy, conversationId: "" });
  }
  for (const candidate of candidates) {
    if (!("response" in result) || !(result.response instanceof Response) || result.response.status !== 409) return result;
    const body = await result.response.clone().json().catch(() => null);
    if (body?.code !== "IDEMPOTENCY_CONFLICT") return result;
    result = await claim(candidate);
  }
  return result;
}
