type AskIdentityPayload = { conversationId: string; locale: string; petId: string; question: string };
type OwnedPersistedTurn = { conversationId: string; question: string | null; userSequence: number };

/** Restore only the transport origin of an owned first turn. Both attempts use
 * the same key and the ordinary full-payload hash check; no identity is waived. */
export async function claimWithRestoredAskOrigin<T extends object>({ claim, payload, persisted }: {
  claim: (payload: AskIdentityPayload) => Promise<T>;
  payload: AskIdentityPayload;
  persisted: OwnedPersistedTurn | null;
}): Promise<T> {
  const result = await claim(payload);
  if (!persisted || persisted.userSequence !== 1 || !payload.conversationId
    || persisted.conversationId !== payload.conversationId || persisted.question !== payload.question
    || !("response" in result) || !(result.response instanceof Response) || result.response.status !== 409) return result;
  const body = await result.response.clone().json().catch(() => null);
  if (body?.code !== "IDEMPOTENCY_CONFLICT") return result;
  // A new question originally had no conversation ID. The saved conversation
  // exists after admission even when generation fails. Let the canonical claim
  // verify that original payload; changed text, locale, pet or key still fails.
  return claim({ ...payload, conversationId: "" });
}
