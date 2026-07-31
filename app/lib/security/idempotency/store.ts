import "server-only";

import { createIdempotencyAdminClient } from "./admin-client";
import type { IdempotencyClaimRow, IdempotencyRetention } from "./types";

const RETENTION_SECONDS: Record<IdempotencyRetention, number> = {
  ordinary: 7 * 24 * 60 * 60,
  ai: 45 * 24 * 60 * 60,
  destructive: 90 * 24 * 60 * 60,
  financial: 90 * 24 * 60 * 60,
};

export async function claimStoredOperation(input: { key: string; leaseSeconds: number; operationType: string; payloadHash: string; retention: IdempotencyRetention; userId: string }) {
  const { data, error } = await createIdempotencyAdminClient().rpc("claim_idempotency_operation", {
    p_idempotency_key: input.key,
    p_lease_seconds: input.leaseSeconds,
    p_operation_type: input.operationType,
    p_payload_hash: input.payloadHash,
    p_retention_seconds: RETENTION_SECONDS[input.retention],
    p_user_id: input.userId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as IdempotencyClaimRow | null;
}

export async function completeStoredOperation(input: { body: unknown; key: string; operationType: string; ownerToken: string; resourceId?: string | null; resourceType?: string | null; status: number; userId: string }) {
  const { data, error } = await createIdempotencyAdminClient().rpc("complete_idempotency_operation", {
    p_idempotency_key: input.key, p_operation_type: input.operationType, p_owner_token: input.ownerToken,
    p_resource_id: input.resourceId || null, p_resource_type: input.resourceType || null,
    p_response_body: input.body ?? null, p_response_status: input.status,
    p_user_id: input.userId,
  });
  if (error || data !== true) throw error || new Error("IDEMPOTENCY_COMPLETION_LOST");
}

export async function failStoredOperation(input: { body?: unknown; errorCode: string; key: string; operationType: string; ownerToken: string; retryable: boolean; status?: number; userId: string }) {
  const { error } = await createIdempotencyAdminClient().rpc("fail_idempotency_operation", {
    p_error_code: input.errorCode, p_idempotency_key: input.key, p_operation_type: input.operationType,
    p_owner_token: input.ownerToken, p_response_body: input.body ?? null, p_response_status: input.status ?? null,
    p_retryable: input.retryable,
    p_user_id: input.userId,
  });
  if (error) throw error;
}

export async function abandonStoredOperation(input: { errorCode: string; key: string; operationType: string; ownerToken: string; userId: string }) {
  const { error } = await createIdempotencyAdminClient().rpc("abandon_idempotency_operation", {
    p_error_code: input.errorCode, p_idempotency_key: input.key, p_operation_type: input.operationType, p_owner_token: input.ownerToken, p_user_id: input.userId,
  });
  if (error) throw error;
}
