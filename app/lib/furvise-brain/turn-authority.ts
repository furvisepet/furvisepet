export const FURVISE_BRAIN_TURN_VERSION = "furvise-brain-turn.v1" as const;

export type FurviseTurnIntent =
  | "conversation"
  | "question"
  | "record"
  | "correct"
  | "delete"
  | "lifecycle"
  | "navigate"
  | "creative"
  | "clarify";

export type FurviseMemoryNeed = "none" | "working" | "targeted" | "lifetime";

export type FurviseSubjectSource =
  | "explicit"
  | "clarified"
  | "selected_pet"
  | "conversation"
  | "unresolved";

export type FurviseMutationKind =
  | "record_care"
  | "correct_record"
  | "delete_record"
  | "mark_deceased"
  | "restore_living"
  | "archive_pet"
  | "other";

export type FurviseTurnSubject = Readonly<{
  petIds: readonly string[];
  source: FurviseSubjectSource;
  unresolved: boolean;
}>;

export type FurviseMutationAuthority = Readonly<{
  allowed: boolean;
  kind: FurviseMutationKind | null;
  explicitUserAuthorization: boolean;
  confirmationRequired: boolean;
  confirmationSatisfied: boolean;
}>;

export type FurviseTurnAuthority = Readonly<{
  version: typeof FURVISE_BRAIN_TURN_VERSION;
  logicalTurnId: string;
  subject: FurviseTurnSubject;
  intent: FurviseTurnIntent;
  memoryNeed: FurviseMemoryNeed;
  mutation: FurviseMutationAuthority;
  referenceTurnIds: readonly string[];
}>;

export type CreateFurviseTurnAuthorityInput = {
  logicalTurnId: string;
  subject?: Partial<FurviseTurnSubject>;
  intent?: FurviseTurnIntent;
  memoryNeed?: FurviseMemoryNeed;
  referenceTurnIds?: readonly string[];
};

const unique = (values: readonly string[]) => [...new Set(values.filter(Boolean))];

/**
 * Create the one authoritative decision envelope for an Ask turn.
 *
 * This deliberately starts mutation authority CLOSED. Understanding a message,
 * resolving a pet, retrieving history, or producing a model proposal can never
 * grant write authority by itself.
 */
export function createFurviseTurnAuthority(input: CreateFurviseTurnAuthorityInput): FurviseTurnAuthority {
  return Object.freeze({
    version: FURVISE_BRAIN_TURN_VERSION,
    logicalTurnId: input.logicalTurnId,
    subject: Object.freeze({
      petIds: Object.freeze(unique(input.subject?.petIds || [])),
      source: input.subject?.source || "unresolved",
      unresolved: input.subject?.unresolved ?? true,
    }),
    intent: input.intent || "conversation",
    memoryNeed: input.memoryNeed || "working",
    mutation: Object.freeze({
      allowed: false,
      kind: null,
      explicitUserAuthorization: false,
      confirmationRequired: false,
      confirmationSatisfied: false,
    }),
    referenceTurnIds: Object.freeze(unique(input.referenceTurnIds || [])),
  });
}

/**
 * Subject clarification is intentionally narrow. It may resolve who the user
 * means, but it can never mutate intent, memory scope, write authority, or
 * confirmation state. This is the firewall for cases such as "I mean Pebble".
 */
export function clarifyFurviseTurnSubject(
  turn: FurviseTurnAuthority,
  petIds: readonly string[],
): FurviseTurnAuthority {
  return Object.freeze({
    ...turn,
    subject: Object.freeze({
      petIds: Object.freeze(unique(petIds)),
      source: "clarified" as const,
      unresolved: petIds.length === 0,
    }),
  });
}

export type GrantFurviseMutationInput = {
  kind: FurviseMutationKind;
  explicitUserAuthorization: boolean;
  confirmationRequired?: boolean;
  confirmationSatisfied?: boolean;
};

/**
 * The only primitive that can open mutation authority.
 *
 * A write requires explicit authorization from the CURRENT user turn. Prior
 * dialogue, model inference, subject clarification, retrieved evidence, or a
 * pending task are not authorization.
 */
export function grantFurviseMutationAuthority(
  turn: FurviseTurnAuthority,
  input: GrantFurviseMutationInput,
): FurviseTurnAuthority {
  if (!input.explicitUserAuthorization) return turn;
  const confirmationRequired = input.confirmationRequired === true;
  const confirmationSatisfied = input.confirmationSatisfied === true;
  const allowed = !confirmationRequired || confirmationSatisfied;

  return Object.freeze({
    ...turn,
    mutation: Object.freeze({
      allowed,
      kind: input.kind,
      explicitUserAuthorization: true,
      confirmationRequired,
      confirmationSatisfied,
    }),
  });
}

/** A second, deterministic barrier immediately before any side effect. */
export function assertFurviseMutationAllowed(turn: FurviseTurnAuthority, expectedKind?: FurviseMutationKind) {
  if (!turn.mutation.allowed || !turn.mutation.explicitUserAuthorization) {
    throw new Error("FURVISE_MUTATION_NOT_AUTHORIZED");
  }
  if (turn.mutation.confirmationRequired && !turn.mutation.confirmationSatisfied) {
    throw new Error("FURVISE_MUTATION_CONFIRMATION_REQUIRED");
  }
  if (expectedKind && turn.mutation.kind !== expectedKind) {
    throw new Error("FURVISE_MUTATION_KIND_MISMATCH");
  }
}
