export const ASK_POST_REVIEW_FINALIZATION_STAGES = [
  "persist_reviewed_answer",
  "mint_action_capabilities",
  "persist_authorized_intelligence",
  "execute_authorized_actions",
  "resolve_care_presentation",
  "assess_task_completion",
  "settle_credit_disposition",
  "finalize_durable_answer",
  "invalidate_committed_state",
  "publish_success",
] as const;

export type AskPostReviewFinalizationStage = typeof ASK_POST_REVIEW_FINALIZATION_STAGES[number];

export type DurableAskFinalization<TDurableReceipt, TResponse> =
  | { kind: "committed"; receipt: TDurableReceipt }
  | { kind: "replay"; response: TResponse };

export type EarlyAskPostReviewResponse<TResponse> = {
  kind: "early_response";
  response: TResponse;
};

function isEarlyAskPostReviewResponse<TResponse>(value: unknown): value is EarlyAskPostReviewResponse<TResponse> {
  return Boolean(value && typeof value === "object" && (value as { kind?: unknown }).kind === "early_response" && "response" in value);
}

type MaybePromise<T> = T | Promise<T>;

type PostReviewEffectSnapshot<
  TPersisted,
  TCapabilities,
  TIntelligence,
  TActions,
  TCare,
  TAssessment,
  TSettlement,
  TDurableReceipt,
  TResponse,
> = {
  persisted: TPersisted;
  capabilities: TCapabilities;
  intelligence: TIntelligence;
  actions: TActions;
  care: TCare;
  assessment: TAssessment;
  settlement: TSettlement;
  durable: DurableAskFinalization<TDurableReceipt, TResponse>;
};

type PostReviewPublicationSnapshot<
  TPersisted,
  TCapabilities,
  TIntelligence,
  TActions,
  TCare,
  TAssessment,
  TSettlement,
  TDurableReceipt,
> = {
  persisted: TPersisted;
  capabilities: TCapabilities;
  intelligence: TIntelligence;
  actions: TActions;
  care: TCare;
  assessment: TAssessment;
  settlement: TSettlement;
  durableReceipt: TDurableReceipt;
};

/**
 * Executive-control boundary for a reviewed Ask answer.
 *
 * Every effect stage is explicit and ordered. Durable readback still publishes
 * cache freshness because committed state exists, but it exits before a second
 * success serializer can synthesize metadata or any effect can rerun.
 */
export async function finalizeAskPostReview<
  TPersisted,
  TCapabilities,
  TIntelligence,
  TActions,
  TCare,
  TAssessment,
  TSettlement,
  TDurableReceipt,
  TResponse,
>(operations: {
  persistReviewedAnswer: () => MaybePromise<TPersisted | EarlyAskPostReviewResponse<TResponse>>;
  mintActionCapabilities: (persisted: TPersisted) => MaybePromise<TCapabilities>;
  persistAuthorizedIntelligence: (input: { persisted: TPersisted; capabilities: TCapabilities }) => MaybePromise<TIntelligence>;
  executeAuthorizedActions: (input: { persisted: TPersisted; capabilities: TCapabilities; intelligence: TIntelligence }) => MaybePromise<TActions>;
  resolveCarePresentation: (input: { persisted: TPersisted; capabilities: TCapabilities; intelligence: TIntelligence; actions: TActions }) => MaybePromise<TCare>;
  assessTaskCompletion: (input: { actions: TActions; care: TCare; intelligence: TIntelligence }) => MaybePromise<TAssessment>;
  settleCreditDisposition: (input: { assessment: TAssessment; actions: TActions; care: TCare; intelligence: TIntelligence }) => MaybePromise<TSettlement>;
  finalizeDurableAnswer: (input: {
    persisted: TPersisted;
    capabilities: TCapabilities;
    intelligence: TIntelligence;
    actions: TActions;
    care: TCare;
    assessment: TAssessment;
    settlement: TSettlement;
  }) => MaybePromise<DurableAskFinalization<TDurableReceipt, TResponse>>;
  invalidateCommittedState: (snapshot: PostReviewEffectSnapshot<TPersisted, TCapabilities, TIntelligence, TActions, TCare, TAssessment, TSettlement, TDurableReceipt, TResponse>) => MaybePromise<void>;
  publishSuccess: (snapshot: PostReviewPublicationSnapshot<TPersisted, TCapabilities, TIntelligence, TActions, TCare, TAssessment, TSettlement, TDurableReceipt>) => MaybePromise<TResponse>;
}): Promise<TResponse> {
  const persistence = await operations.persistReviewedAnswer();
  if (isEarlyAskPostReviewResponse<TResponse>(persistence)) return persistence.response;
  const persisted = persistence as TPersisted;
  const capabilities = await operations.mintActionCapabilities(persisted);
  const intelligence = await operations.persistAuthorizedIntelligence({ persisted, capabilities });
  const actions = await operations.executeAuthorizedActions({ persisted, capabilities, intelligence });
  const care = await operations.resolveCarePresentation({ persisted, capabilities, intelligence, actions });
  const assessment = await operations.assessTaskCompletion({ actions, care, intelligence });
  const settlement = await operations.settleCreditDisposition({ assessment, actions, care, intelligence });
  const durable = await operations.finalizeDurableAnswer({
    persisted,
    capabilities,
    intelligence,
    actions,
    care,
    assessment,
    settlement,
  });

  const effectSnapshot = {
    persisted,
    capabilities,
    intelligence,
    actions,
    care,
    assessment,
    settlement,
    durable,
  };
  await operations.invalidateCommittedState(effectSnapshot);

  if (durable.kind === "replay") return durable.response;

  return operations.publishSuccess({
    persisted,
    capabilities,
    intelligence,
    actions,
    care,
    assessment,
    settlement,
    durableReceipt: durable.receipt,
  });
}
