import { parseConfirmedTemporalScope, type ConfirmedTemporalScope } from "./ask-request-contract.ts";

/**
 * A proposed read-back check, NOT authentication, user confirmation or evidence.
 * The caller must obtain the row through an owner-filtered trusted server read.
 * Scoped execution remains blocked until persistence and confirmation are reviewed.
 */
export type TemporalScopeTurnIdentity = Readonly<{
  ownerId: string; petId: string; conversationId: string; requestId: string;
  messageId: string; message: string; confirmedTemporalScope?: ConfirmedTemporalScope;
}>;
export type StoredTemporalScopeTurn = Readonly<{
  ownerId: string; petId: string; conversationId: string; requestId: string;
  messageId: string; role: "user"; message: string;
  temporalScopeState: "legacy_unscoped" | "scoped";
  confirmedTemporalScope: unknown;
}>;
export type TemporalScopeReceiptAssessment =
  | Readonly<{ status: "legacy_match" | "scope_match_unverified" }>
  | Readonly<{ status: "mismatch" | "unavailable" }>;

const keys = ["ownerId", "petId", "conversationId", "requestId", "messageId", "message"] as const;

/** Does not widen scope, grant read/write authority, or authenticate confirmation. */
export function assessTemporalScopeReceipt(
  expected: TemporalScopeTurnIdentity, stored: StoredTemporalScopeTurn | null | undefined,
): TemporalScopeReceiptAssessment {
  if (!stored || !expected || typeof stored !== "object" || typeof expected !== "object")
    return { status: "unavailable" };
  if (stored.role !== "user" || keys.some(key => typeof expected[key] !== "string" || !expected[key]
      || typeof stored[key] !== "string" || !stored[key] || stored[key] !== expected[key]))
    return { status: "mismatch" };
  if (!Object.hasOwn(stored, "temporalScopeState") || !Object.hasOwn(stored, "confirmedTemporalScope"))
    return { status: "unavailable" };
  if (stored.temporalScopeState === "legacy_unscoped")
    return stored.confirmedTemporalScope === null && expected.confirmedTemporalScope === undefined
      ? { status: "legacy_match" } : { status: "mismatch" };
  if (stored.temporalScopeState !== "scoped" || expected.confirmedTemporalScope === undefined)
    return { status: "mismatch" };
  try {
    const left = parseConfirmedTemporalScope(expected.confirmedTemporalScope);
    const right = parseConfirmedTemporalScope(stored.confirmedTemporalScope);
    if (!left || !right) return { status: "mismatch" };
    const same = left.role === right.role && left.from === right.from && left.to === right.to
      && left.timeZone === right.timeZone && left.source === right.source;
    return { status: same ? "scope_match_unverified" : "mismatch" };
  } catch { return { status: "mismatch" }; }
}

/** All scoped retries remain disabled until durable confirmation is authoritative. */
export function assertScopedReplayDisabled(
  payload: { confirmedTemporalScope?: unknown },
  persisted: { confirmedTemporalScope?: unknown } | null,
): void {
  if (payload.confirmedTemporalScope !== undefined || persisted?.confirmedTemporalScope !== undefined)
    throw new Error("ASK_TEMPORAL_SCOPE_DURABILITY_UNAVAILABLE");
}
