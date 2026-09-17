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

type MaybePromise<T> = T | Promise<T>;

type PostReviewSnapshot<
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
 * Every effect stage is explicit and ordered. A durable replay exits before a
 * second publication path can synthesize new success metadata or rerun effects.
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
  persistReviewedAnswer: () => MaybePromise<TPersisted>;
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
  invalidateCommittedState: (snapshot: PostReviewSnapshot<TPersisted, TCapabilities, TIntelligence, TActions, TCare, TAssessment, TSettlement, TDurableReceipt>) => MaybePromise<void>;
  publishSuccess: (snapshot: PostReviewSnapshot<TPersisted, TCapabilities, TIntelligence, TActions, TCare, TAssessment, TSettlement, TDurableReceipt>) => MaybePromise<TResponse>;
}): Promise<TResponse> {
  const persisted = await operations.persistReviewedAnswer();
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

  if (durable.kind === "replay") return durable.response;

  const snapshot = {
    persisted,
    capabilities,
    intelligence,
    actions,
    care,
    assessment,
    settlement,
    durableReceipt: durable.receipt,
  };
  await operations.invalidateCommittedState(snapshot);
  return operations.publishSuccess(snapshot);
}
