export const ASK_REQUEST_KEYS = [
  "conversationId",
  "petId",
  "previousResponse",
  "message",
  "question",
  "requestId",
  "locale",
] as const;

export type AskRequestPayload = {
  conversationId: string | null;
  locale: string;
  message: string;
  petId: string;
  previousResponse: unknown;
  question: string;
  requestId: string;
};

export function buildAskRequestPayload(payload: AskRequestPayload): AskRequestPayload {
  return {
    conversationId: payload.conversationId,
    locale: payload.locale,
    message: payload.message,
    petId: payload.petId,
    previousResponse: payload.previousResponse,
    question: payload.question,
    requestId: payload.requestId,
  };
}

export function hasOnlyAskRequestKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const allowed = new Set<string>(ASK_REQUEST_KEYS);
  return Object.keys(value).every((key) => allowed.has(key));
}
