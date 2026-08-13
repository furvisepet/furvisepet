import type { SupabaseClient } from "@supabase/supabase-js";

export type IdempotencyClaimOutcome = "new" | "retry" | "in_progress" | "completed" | "failed_final" | "conflict";

export type IdempotencyClaimRow = {
  claim_outcome: IdempotencyClaimOutcome;
  operation_id: string;
  owner_token: string | null;
  response_status: number | null;
  response_body: unknown;
  retry_after_seconds: number;
  error_code: string | null;
};

export type IdempotencyRetention = "ordinary" | "ai" | "destructive" | "financial";

export type ClaimIdempotencyInput = {
  candidateKey?: unknown;
  leaseSeconds?: number;
  operationType: string;
  payload: unknown;
  request: Request;
  retention?: IdempotencyRetention;
  supabase: SupabaseClient;
  userId: string;
};

export type IdempotencyOperation = {
  claimOutcome: "new" | "retry";
  id: string;
  key: string;
  operationType: string;
  ownerToken: string;
  payloadHash: string;
  supabase: SupabaseClient;
  userId: string;
  execute: (callback: () => Promise<Response>) => Promise<Response>;
  abandon: (errorCode: string) => Promise<void>;
};
