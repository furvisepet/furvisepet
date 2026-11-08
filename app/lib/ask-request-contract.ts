import { isCompleteInstant } from "./furvise-brain/complete-instant.ts";

export type ConfirmedTemporalScope = Readonly<{
  role: "event_time" | "report_recorded_time";
  from: string;
  to: string;
  timeZone: string;
  source: "client_user_confirmed";
}>;

/** Client assertion only: this marker is not proof of interpretation or data authority.
 * Exact instants are supplied by the client, never inferred here.
 */
export function parseConfirmedTemporalScope(value: unknown): ConfirmedTemporalScope | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_TEMPORAL_SCOPE");
  const scope = value as Record<string, unknown>;
  const keys = ["role", "from", "to", "timeZone", "source"];
  if (Object.keys(scope).length !== keys.length || keys.some(key => !Object.hasOwn(scope, key))
      || scope.role !== "event_time" && scope.role !== "report_recorded_time"
      || scope.source !== "client_user_confirmed"
      || !isCompleteInstant(scope.from) || !isCompleteInstant(scope.to)
      || !Number.isFinite(Date.parse(scope.from)) || !Number.isFinite(Date.parse(scope.to))
      || Date.parse(scope.from) >= Date.parse(scope.to)
      || typeof scope.timeZone !== "string" || !scope.timeZone || scope.timeZone.length > 100)
    throw new Error("INVALID_TEMPORAL_SCOPE");
  try { new Intl.DateTimeFormat("en", { timeZone: scope.timeZone }).format(0); }
  catch { throw new Error("INVALID_TEMPORAL_SCOPE"); }
  return Object.freeze({ role: scope.role as ConfirmedTemporalScope["role"], from: scope.from,
    to: scope.to, timeZone: scope.timeZone, source: "client_user_confirmed" });
}

export const ASK_REQUEST_KEYS = [
  "conversationId",
  "petId",
  "message",
  "logicalTurnId",
  "locale",
  "timeZone",
  "confirmedTemporalScope",
  "mode",
] as const;

export type AskRequestPayload = {
  conversationId: string | null;
  locale: string;
  timeZone?: string;
  confirmedTemporalScope?: ConfirmedTemporalScope;
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
    ...(payload.confirmedTemporalScope !== undefined ? { confirmedTemporalScope: parseConfirmedTemporalScope(payload.confirmedTemporalScope) } : {}),
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
