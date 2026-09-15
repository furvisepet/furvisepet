export const ASK_REQUEST_KEYS = [
  "conversationId",
  "petId",
  "message",
  "logicalTurnId",
  "locale",
  "timeZone",
  "mode",
] as const;

export type AskRequestPayload = {
  conversationId: string | null;
  locale: string;
  timeZone?: string;
  mode?: "note";
  logicalTurnId: string;
  message: string;
  petId: string;
};

export function buildAskRequestPayload(payload: AskRequestPayload): AskRequestPayload {
  return {
    conversationId: payload.conversationId,
    ...(payload.mode ? { mode: payload.mode } : {}),
    locale: payload.locale,
    ...(payload.timeZone ? { timeZone: payload.timeZone } : {}),
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
