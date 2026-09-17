import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AI_USAGE_EVENTS_TABLE,
  AiCreditLedgerError,
  getAiCreditEventsForLogicalRequest,
  getRemainingAiCredits,
  isAiCreditIntegrityError,
  reconcileAiCredit,
  setAiCreditDisposition,
  type AiCreditStatus,
} from "./usage-ledger.ts";

type AskCreditSettlementLoggers = {
  logAskServerError: (stage: string, error: unknown, context: Record<string, unknown>, httpStatus: number) => void;
  logAskStage: (message: string, context: Record<string, unknown>) => void;
};

/**
 * Owns terminal Ask-credit release and replay reconciliation.
 *
 * A persisted message is not a billing receipt. Reconciliation trusts only
 * durable ledger disposition and terminal ledger state for the same logical
 * request + payload identity.
 */
export function createAskCreditSettlement({ logAskServerError, logAskStage }: AskCreditSettlementLoggers) {
  async function safeReleaseAiCredit({
    logicalRequestId,
    payloadHash,
    requestId,
    userId,
  }: {
    logicalRequestId: string;
    payloadHash: string;
    requestId: string;
    userId: string;
  }) {
    await setAiCreditDisposition({
      disposition: "release",
      feature: "ask",
      logicalRequestId,
      payloadHash,
      requestId,
      userId,
    });
    try {
      await reconcileAiCredit({ feature: "ask", logicalRequestId, payloadHash, requestId, userId });
      logAskStage("AI credit released", { requestId });
      return true;
    } catch (error) {
      if (isAiCreditIntegrityError(error)) throw error;
      logAskServerError("credit_release_failed", error, { requestId }, 200);
      return false;
    }
  }

  async function reconcilePersistedAskCredit({
    logicalRequestId,
    payloadHash,
    supabase,
    usage,
    userId,
  }: {
    logicalRequestId: string;
    payloadHash: string;
    supabase: SupabaseClient;
    usage: AiCreditStatus;
    userId: string;
  }) {
    if (usage.ledgerMode === "development_missing_migration") return usage;
    const states = await getAiCreditEventsForLogicalRequest({ feature: "ask", logicalRequestId, payloadHash, supabase, userId });
    for (const state of states) {
      if (state.disposition !== null) continue;
      await setAiCreditDisposition({
        disposition: "release",
        feature: "ask",
        logicalRequestId,
        payloadHash,
        requestId: state.requestId,
        userId,
      });
      state.disposition = "release";
    }
    if (states.filter((state) => state.disposition === "complete").length > 1) {
      throw new AiCreditLedgerError(
        "reconciliation_failed",
        new Error("AI_CREDIT_DISPOSITION_CONFLICT"),
        AI_USAGE_EVENTS_TABLE,
        "select",
      );
    }
    try {
      for (const state of states) {
        if (state.status !== "reserved") continue;
        await reconcileAiCredit({
          feature: "ask",
          logicalRequestId,
          payloadHash,
          requestId: state.requestId,
          userId,
        });
      }
      return await getRemainingAiCredits({
        feature: "ask",
        monthlyAiCredits: usage.limit,
        planId: usage.planId,
        supabase,
        userId,
      });
    } catch (error) {
      if (isAiCreditIntegrityError(error)) throw error;
      logAskServerError("optional_credit_reconciliation", error, { requestId: logicalRequestId }, 200);
      return usage;
    }
  }

  return { reconcilePersistedAskCredit, safeReleaseAiCredit };
}
