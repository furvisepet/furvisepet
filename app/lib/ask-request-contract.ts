export const ASK_REQUEST_KEYS = [
  "conversationId",
  "petId",
  "message",
  "logicalTurnId",
  "locale",
] as const;

export type AskRequestPayload = {
  conversationId: string | null;
  locale: string;
  logicalTurnId: string;
  message: string;
  petId: string;
};

export function buildAskRequestPayload(payload: AskRequestPayload): AskRequestPayload {
  return {
    conversationId: payload.conversationId,
    locale: payload.locale,
    logicalTurnId: payload.logicalTurnId,
    message: payload.message,
    petId: payload.petId,
  };
}

export function hasOnlyAskRequestKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const allowed = new Set<string>(ASK_REQUEST_KEYS);
  return Object.keys(value).every((key) => allowed.has(key));
}
