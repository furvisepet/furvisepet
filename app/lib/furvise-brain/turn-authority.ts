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

export type FurviseSubjectKind =
  | "pet"
  | "multi_pet"
  | "external_animal"
  | "person"
  | "owner"
  | "other"
  | "unresolved";

export type FurviseMutationKind =
  | "record_care"
  | "correct_record"
  | "delete_record"
  | "mark_deceased"
  | "restore_living"
  | "archive_pet"
  | "cancel_pending"
  | "other";

export type FurviseAuthorizationSource =
  | "current_turn"
  | "transport"
  | "durable_capability";

export type FurviseTurnSubject = Readonly<{
  petIds: readonly string[];
  kind: FurviseSubjectKind;
  label: string | null;
  source: FurviseSubjectSource;
  unresolved: boolean;
}>;

export type FurviseMutationAuthority = Readonly<{
  allowed: boolean;
  kind: FurviseMutationKind | null;
  userAuthorizationVerified: boolean;
  authorizationSource: FurviseAuthorizationSource | null;
  authorizationTurnId: string | null;
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
const inferSubjectKind = (petIds: readonly string[], unresolved: boolean): FurviseSubjectKind =>
  unresolved ? "unresolved" : petIds.length > 1 ? "multi_pet" : petIds.length === 1 ? "pet" : "other";

export function createFurviseTurnAuthority(input: CreateFurviseTurnAuthorityInput): FurviseTurnAuthority {
  const petIds = unique(input.subject?.petIds || []);
  const unresolved = input.subject?.unresolved ?? petIds.length === 0;
  return Object.freeze({
    version: FURVISE_BRAIN_TURN_VERSION,
    logicalTurnId: input.logicalTurnId,
    subject: Object.freeze({
      petIds: Object.freeze(petIds),
      kind: input.subject?.kind || inferSubjectKind(petIds, unresolved),
      label: input.subject?.label || null,
      source: input.subject?.source || (petIds.length ? "selected_pet" : "unresolved"),
      unresolved,
    }),
    intent: input.intent || "conversation",
    memoryNeed: input.memoryNeed || "working",
    mutation: Object.freeze({
      allowed: false,
      kind: null,
      userAuthorizationVerified: false,
      authorizationSource: null,
      authorizationTurnId: null,
      confirmationRequired: false,
      confirmationSatisfied: false,
    }),
    referenceTurnIds: Object.freeze(unique(input.referenceTurnIds || [])),
  });
}

export function clarifyFurviseTurnSubject(
  turn: FurviseTurnAuthority,
  petIds: readonly string[],
  label: string | null = null,
): FurviseTurnAuthority {
  const uniquePetIds = unique(petIds);
  return Object.freeze({
    ...turn,
    subject: Object.freeze({
      petIds: Object.freeze(uniquePetIds),
      kind: uniquePetIds.length > 1 ? "multi_pet" as const : uniquePetIds.length === 1 ? "pet" as const : "unresolved" as const,
      label,
      source: "clarified" as const,
      unresolved: uniquePetIds.length === 0,
    }),
  });
}

export type GrantFurviseMutationInput = {
  kind: FurviseMutationKind;
  userAuthorizationVerified: boolean;
  authorizationSource: FurviseAuthorizationSource;
  authorizationTurnId: string;
  confirmationRequired?: boolean;
  confirmationSatisfied?: boolean;
};

export function grantFurviseMutationAuthority(
  turn: FurviseTurnAuthority,
  input: GrantFurviseMutationInput,
): FurviseTurnAuthority {
  if (!input.userAuthorizationVerified || !input.authorizationTurnId.trim()) return turn;
  const confirmationRequired = input.confirmationRequired === true;
  const confirmationSatisfied = input.confirmationSatisfied === true;
  const allowed = !confirmationRequired || confirmationSatisfied;

  return Object.freeze({
    ...turn,
    mutation: Object.freeze({
      allowed,
      kind: input.kind,
      userAuthorizationVerified: true,
      authorizationSource: input.authorizationSource,
      authorizationTurnId: input.authorizationTurnId,
      confirmationRequired,
      confirmationSatisfied,
    }),
  });
}

export function assertFurviseMutationAllowed(turn: FurviseTurnAuthority, expectedKind?: FurviseMutationKind) {
  if (!turn.mutation.allowed || !turn.mutation.userAuthorizationVerified
    || !turn.mutation.authorizationSource || !turn.mutation.authorizationTurnId) {
    throw new Error("FURVISE_MUTATION_NOT_AUTHORIZED");
  }
  if (turn.mutation.confirmationRequired && !turn.mutation.confirmationSatisfied) {
    throw new Error("FURVISE_MUTATION_CONFIRMATION_REQUIRED");
  }
  if (expectedKind && turn.mutation.kind !== expectedKind) {
    throw new Error("FURVISE_MUTATION_KIND_MISMATCH");
  }
}
