import type { SupabaseClient } from "@supabase/supabase-js";
import { serializeGovernedSemanticTurnV2 } from "./serialize.ts";
import type { GovernedSemanticTurn } from "../types.ts";

/** Phase 1 verification helper. Production Ask must not call this module. */
export async function persistGovernedSemanticTurnV2Shadow(input: {
  supabase: SupabaseClient;
  turn: GovernedSemanticTurn;
  sourceMessage: string;
  idempotencyKey: string;
}) {
  return input.supabase.rpc("persist_governed_semantic_turn_v2", {
    p_source_message_id: input.turn.sourceMessageId,
    p_idempotency_key: input.idempotencyKey,
    p_frame_schema_version: input.turn.frameSchemaVersion,
    p_governance_policy_version: input.turn.governancePolicyVersion,
    p_governed_turn: serializeGovernedSemanticTurnV2(input.turn, input.sourceMessage),
  });
}

