export const FURVISE_TURN_AUTHORITY_VERSION = "furvise-turn-authority.v1" as const;

export type FurviseIntent =
  | "conversation"
  | "question"
  | "observation"
  | "save"
  | "correction"
  | "lifecycle"
  | "navigation"
  | "creative"
  | "unknown";

export type MemoryDepth = "none" | "working" | "targeted" | "lifetime";

export type SubjectBasis =
  | "selected_pet"
  | "explicit_user"
  | "conversation"
  | "clarification"
  | "account"
  | "none";

export type MutationKind =
  | "owner_note"
  | "care_event"
  | "care_state"
  | "profile"
  | "lifecycle"
  | "memory";

export type MutationAuthorizationBasis =
  | "transport"
  | "explicit_user"
  | "confirmed_capability";

export type MutationAuthorization = {
  basis: MutationAuthorizationBasis;
  messageId: string;
  quote: string | null;
  capabilityId: string | null;
};

export type MutationAuthority = {
  requested: boolean;
  kind: MutationKind | null;
  state: "forbidden" | "proposed" | "authorized";
  authorization: MutationAuthorization | null;
  confirmationRequired: boolean;
};

export type TurnSubject = {
  petIds: readonly string[];
  basis: SubjectBasis;
  requiresClarification: boolean;
};

export type FurviseTurnAuthority = {
  version: typeof FURVISE_TURN_AUTHORITY_VERSION;
  turnId: string;
  messageId: string;
  subject: TurnSubject;
  intent: FurviseIntent;
  memory: MemoryDepth;
  mutation: MutationAuthority;
  response: {
    owner: "brain";
    requiresValidation: true;
  };
};

export type TurnAuthorityInput = Omit<FurviseTurnAuthority, "version" | "response">;

/**
 * The canonical per-turn authority object.
 *
 * Organs may propose facts, evidence, actions, or classifications, but they do
 * not get to expand this object's permissions. The object is deliberately
 * JSON-serializable so it can be persisted with a turn and compared on retry.
 */
export function issueTurnAuthority(input: TurnAuthorityInput): FurviseTurnAuthority {
  const authority: FurviseTurnAuthority = {
    version: FURVISE_TURN_AUTHORITY_VERSION,
    turnId: requiredId(input.turnId, "turnId"),
    messageId: requiredId(input.messageId, "messageId"),
    subject: normalizeSubject(input.subject),
    intent: input.intent,
    memory: input.memory,
    mutation: normalizeMutation(input.mutation),
    response: { owner: "brain", requiresValidation: true },
  };
  assertTurnAuthority(authority);
  return deepFreeze(authority);
}

/**
 * A clarification is allowed to fill a missing subject only. It is not a new
 * source of mutation consent. This is the invariant that prevents a reply like
 * "I mean Pebble" from turning an earlier observation into an authorized save.
 */
export function applySubjectClarification(
  authority: FurviseTurnAuthority,
  input: { petIds: readonly string[]; basis?: Extract<SubjectBasis, "clarification" | "explicit_user"> },
): FurviseTurnAuthority {
  if (!authority.subject.requiresClarification) {
    throw new Error("FURVISE_AUTHORITY_SUBJECT_ALREADY_RESOLVED");
  }
  const next = issueTurnAuthority({
    turnId: authority.turnId,
    messageId: authority.messageId,
    intent: authority.intent,
    memory: authority.memory,
    subject: {
      petIds: input.petIds,
      basis: input.basis || "clarification",
      requiresClarification: input.petIds.length !== 1,
    },
    mutation: structuredClone(authority.mutation),
  });
  if (!sameMutationAuthority(authority.mutation, next.mutation)) {
    throw new Error("FURVISE_AUTHORITY_CLARIFICATION_CHANGED_MUTATION");
  }
  return next;
}

/**
 * Commit is a deterministic executive-control decision. A model proposal alone
 * is never sufficient. Subject-bound writes require one resolved subject, and
 * actions whose policy requires confirmation require a confirmed capability.
 */
export function canCommitMutation(authority: FurviseTurnAuthority): boolean {
  if (authority.mutation.state !== "authorized" || !authority.mutation.authorization) return false;
  if (authority.subject.requiresClarification || authority.subject.petIds.length !== 1) return false;
  if (authority.mutation.confirmationRequired
    && authority.mutation.authorization.basis !== "confirmed_capability") return false;
  return true;
}

export function assertMutationCommitAllowed(authority: FurviseTurnAuthority): void {
  if (!canCommitMutation(authority)) throw new Error("FURVISE_MUTATION_NOT_AUTHORIZED");
}

export function assertTurnAuthority(authority: FurviseTurnAuthority): void {
  requiredId(authority.turnId, "turnId");
  requiredId(authority.messageId, "messageId");
  if (authority.version !== FURVISE_TURN_AUTHORITY_VERSION) throw new Error("FURVISE_AUTHORITY_VERSION");
  if (authority.response.owner !== "brain" || authority.response.requiresValidation !== true) {
    throw new Error("FURVISE_AUTHORITY_RESPONSE_OWNER");
  }
  if (authority.subject.petIds.length > 1 && !authority.subject.requiresClarification
    && authority.subject.basis !== "account") {
    throw new Error("FURVISE_AUTHORITY_AMBIGUOUS_SUBJECT");
  }
  const mutation = authority.mutation;
  if (mutation.state === "authorized") {
    if (!mutation.requested || !mutation.kind || !mutation.authorization) {
      throw new Error("FURVISE_AUTHORITY_INVALID_MUTATION_GRANT");
    }
    requiredId(mutation.authorization.messageId, "authorization.messageId");
    if (mutation.authorization.basis === "confirmed_capability") {
      requiredId(mutation.authorization.capabilityId || "", "authorization.capabilityId");
    } else if (mutation.authorization.capabilityId !== null) {
      throw new Error("FURVISE_AUTHORITY_UNEXPECTED_CAPABILITY");
    }
  } else if (mutation.authorization !== null) {
    throw new Error("FURVISE_AUTHORITY_UNAUTHORIZED_PROOF");
  }
  if (mutation.state === "proposed" && !mutation.kind) {
    throw new Error("FURVISE_AUTHORITY_PROPOSAL_WITHOUT_KIND");
  }
}

function normalizeSubject(subject: TurnSubject): TurnSubject {
  const petIds = [...new Set(subject.petIds.map((id) => requiredId(id, "subject.petId")))];
  return { petIds, basis: subject.basis, requiresClarification: Boolean(subject.requiresClarification) };
}

function normalizeMutation(mutation: MutationAuthority): MutationAuthority {
  return {
    requested: Boolean(mutation.requested),
    kind: mutation.kind,
    state: mutation.state,
    authorization: mutation.authorization ? {
      basis: mutation.authorization.basis,
      messageId: mutation.authorization.messageId,
      quote: mutation.authorization.quote,
      capabilityId: mutation.authorization.capabilityId,
    } : null,
    confirmationRequired: Boolean(mutation.confirmationRequired),
  };
}

function sameMutationAuthority(left: MutationAuthority, right: MutationAuthority): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requiredId(value: string, field: string): string {
  const id = value.trim();
  if (!id) throw new Error(`FURVISE_AUTHORITY_REQUIRED:${field}`);
  return id;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
