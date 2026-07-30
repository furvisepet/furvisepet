import "server-only";

import { idempotencyErrorResponse, replayResponse } from "./errors";
import { logIdempotencyEvent } from "./logging";
import { hashIdempotencyPayload } from "./payload-hash";
import { resolveIdempotencyKey } from "./request-key";
import { abandonStoredOperation, claimStoredOperation, completeStoredOperation, failStoredOperation } from "./store";
import type { ClaimIdempotencyInput, IdempotencyOperation } from "./types";
import { beginRateLimitedRequest, type RateLimitPolicyName } from "../rate-limit";

export async function claimIdempotentOperation(input: ClaimIdempotencyInput): Promise<{ response: Response } | { operation: IdempotencyOperation }> {
  const started = Date.now();
  const key = resolveIdempotencyKey(input.request, input.candidateKey);
  const requestId = "key" in key ? key.key : crypto.randomUUID();
  if ("error" in key) {
    const code = key.error === "required" ? "IDEMPOTENCY_KEY_REQUIRED" : key.error === "invalid" ? "IDEMPOTENCY_KEY_INVALID" : "IDEMPOTENCY_CONFLICT";
    return { response: idempotencyErrorResponse(code, requestId) };
  }
  const payloadHash = hashIdempotencyPayload(input.operationType, input.payload);
  let claim;
  try {
    claim = await claimStoredOperation({ key: key.key, leaseSeconds: input.leaseSeconds || 120, operationType: input.operationType, payloadHash, retention: input.retention || "ordinary", userId: input.userId });
  } catch {
    logIdempotencyEvent({ elapsedMs: Date.now() - started, errorCode: "BACKEND_UNAVAILABLE", operationType: input.operationType, outcome: "unavailable", requestId });
    return { response: idempotencyErrorResponse("IDEMPOTENCY_UNAVAILABLE", requestId, 1) };
  }
  if (!claim) return { response: idempotencyErrorResponse("IDEMPOTENCY_UNAVAILABLE", requestId, 1) };
  logIdempotencyEvent({ elapsedMs: Date.now() - started, operationType: input.operationType, outcome: claim.claim_outcome, requestId });
  if (claim.claim_outcome === "completed" || claim.claim_outcome === "failed_final") return { response: replayResponse(claim.response_status, claim.response_body) };
  if (claim.claim_outcome === "conflict") return { response: idempotencyErrorResponse("IDEMPOTENCY_CONFLICT", requestId) };
  if (claim.claim_outcome === "in_progress") return { response: idempotencyErrorResponse("REQUEST_IN_PROGRESS", requestId, claim.retry_after_seconds || 1) };
  if (!claim.owner_token) return { response: idempotencyErrorResponse("IDEMPOTENCY_UNAVAILABLE", requestId, 1) };

  const operation: IdempotencyOperation = {
    id: claim.operation_id, key: key.key, operationType: input.operationType, ownerToken: claim.owner_token, payloadHash, supabase: input.supabase, userId: input.userId,
    abandon: async (errorCode) => { try { await abandonStoredOperation({ errorCode, key: key.key, operationType: input.operationType, ownerToken: claim.owner_token!, userId: input.userId }); } catch { /* The lease prevents immediate duplicate execution. */ } },
    execute: async (callback) => {
      let response: Response;
      try {
        response = await callback();
      } catch (error) {
        try { await failStoredOperation({ errorCode: "UNHANDLED_FAILURE", key: key.key, operationType: input.operationType, ownerToken: claim.owner_token!, retryable: true, userId: input.userId }); } catch { /* Preserve the primary error. */ }
        throw error;
      }
      const body = await responseBody(response);
      if (response.status >= 500) {
        await failStoredOperation({ body, errorCode: "RETRYABLE_RESPONSE", key: key.key, operationType: input.operationType, ownerToken: claim.owner_token!, retryable: true, status: response.status, userId: input.userId });
        return response;
      }
      try {
        await completeStoredOperation({ body, key: key.key, operationType: input.operationType, ownerToken: claim.owner_token!, status: response.status, userId: input.userId });
        const headers = new Headers(response.headers); headers.set("Idempotency-Replayed", "false");
        return new Response(response.body, { headers, status: response.status, statusText: response.statusText });
      } catch {
        try { await failStoredOperation({ body: { code: "IDEMPOTENCY_RECONCILIATION_REQUIRED", error: "This update is being reconciled. Please contact support before repeating it." }, errorCode: "POST_MUTATION_RECONCILIATION", key: key.key, operationType: input.operationType, ownerToken: claim.owner_token!, retryable: false, status: 503, userId: input.userId }); } catch { /* The unexpired lease still blocks immediate duplication. */ }
        return idempotencyErrorResponse("IDEMPOTENCY_UNAVAILABLE", key.key, 1);
      }
    },
  };
  return { operation };
}

export async function beginIdempotentRateLimitedOperation(input: ClaimIdempotencyInput & {
  policy: RateLimitPolicyName;
  route: string;
  userId: string;
}) {
  const claimed = await claimIdempotentOperation(input);
  if ("response" in claimed) return claimed;
  const rate = await beginRateLimitedRequest({
    idempotencyKey: claimed.operation.key,
    payload: input.payload,
    policy: input.policy,
    request: input.request,
    requestId: claimed.operation.key,
    route: input.route,
    userId: input.userId,
  });
  if (!rate.allowed) {
    await claimed.operation.abandon(rate.response.status === 429 ? "RATE_LIMITED" : "RATE_LIMIT_UNAVAILABLE");
    return { response: rate.response };
  }
  return { operation: claimed.operation, rate };
}

async function responseBody(response: Response) {
  if (response.status === 204) return null;
  const text = await response.clone().text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { ok: response.ok }; }
}
