import { createHash } from "node:crypto";
import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { prepareBillingForAccountDeletion } from "../../../lib/billing/account-deletion";
import { getBillingAccountForUser, recordBillingDeletionTombstones } from "../../../lib/billing/billing-admin";
import { getStripeServerClient } from "../../../lib/billing/stripe-server";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";
import { emitOperationalEvent } from "../../../lib/operations/events";
import { buildSupportReference } from "../../../lib/operations/support-reference";
import { resolveIdempotencyKey } from "../../../lib/security/idempotency/request-key";
import { beginRateLimitedRequest } from "../../../lib/security/rate-limit";
import { hasRecentAuthentication } from "../../../lib/security/recent-auth";
import { API_BODY_LIMITS, hasOnlyKeys, readBoundedJson } from "../../../lib/security/request";

export async function POST(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const key = resolveIdempotencyKey(request);
  const requestId = "key" in key ? key.key : crypto.randomUUID();
  if ("error" in key) return safeError("IDEMPOTENCY_KEY_REQUIRED", "Refresh the page and try again.", requestId, 400);
  if (!hasRecentAuthentication(context.user.last_sign_in_at)) return safeError("RECENT_AUTH_REQUIRED", "Sign in again before deleting your account.", requestId, 401);
  let body: unknown;
  try { body = await readBoundedJson(request, API_BODY_LIMITS.standard); } catch { return safeError("INVALID_REQUEST", "Type DELETE to confirm account deletion.", requestId, 400); }
  if (!hasOnlyKeys(body, ["confirmation"]) || (body as { confirmation?: unknown }).confirmation !== "DELETE") return safeError("CONFIRMATION_REQUIRED", "Type DELETE to confirm account deletion.", requestId, 400);
  const rate = await beginRateLimitedRequest({ idempotencyKey: key.key, payload: { confirmation: "DELETE", version: 1 }, policy: "DESTRUCTIVE_WRITE", request, requestId, route: "/api/account/delete", userId: context.userId });
  if (!rate.allowed) return rate.response;
  try {
    const admin = createOperationsAdminClient();
    emitOperationalEvent({ actorId: context.userId, eventType: "account_deletion_started", operationId: key.key, requestId, route: "/api/account/delete", severity: "high" });
    const payloadHash = createHash("sha256").update(`account-delete:v1:${context.userId}:DELETE`).digest("hex");
    try {
      const billingAccount = await getBillingAccountForUser(admin, context.userId);
      if (billingAccount) {
        await prepareBillingForAccountDeletion({
          account: billingAccount,
          idempotencyKey: key.key,
          recordTombstones: (termination) => recordBillingDeletionTombstones({ admin, ...termination }),
          stripe: getStripeServerClient(),
          userId: context.userId,
        });
      }
    } catch {
      emitOperationalEvent({ actorId: context.userId, errorCode: "BILLING_TERMINATION_FAILED", eventType: "account_deletion_failed", operationId: key.key, requestId, route: "/api/account/delete", severity: "critical" });
      return safeError("BILLING_TERMINATION_FAILED", "Furvise could not safely end billing. Your account was not deleted. Try again or contact support.", requestId, 503);
    }
    const { data, error } = await admin.rpc("prepare_account_deletion", { p_idempotency_key: key.key, p_payload_hash: payloadHash, p_user_id: context.userId });
    if (error || !Array.isArray(data) || !data[0]) return recoverableDeletionFailure(requestId, "APPLICATION_DELETE_FAILED", context.userId, key.key);
    if (data[0].outcome === "conflict") return safeError("IDEMPOTENCY_CONFLICT", "This deletion request conflicts with an earlier request.", requestId, 409);
    if (data[0].deletion_status === "completed") return Response.json({ deleted: true, requestId }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    const { error: authError } = await admin.auth.admin.deleteUser(context.userId, false);
    if (authError) return irreversibleDeletionFailure(admin, context.userId, key.key, requestId, "AUTH_DELETE_FAILED");
    const { error: markError } = await admin.rpc("mark_account_deletion_result", { p_completed: true, p_error_code: null, p_idempotency_key: key.key, p_user_id: context.userId });
    emitOperationalEvent({ actorId: context.userId, errorCode: markError ? "DELETION_LEDGER_UPDATE_FAILED" : undefined, eventType: markError ? "account_deletion_failed" : "account_deletion_completed", operationId: key.key, requestId, route: "/api/account/delete", severity: markError ? "critical" : "high" });
    return Response.json({ deleted: true, requestId }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } finally {
    await rate.release();
  }
}

function recoverableDeletionFailure(requestId: string, code: string, userId: string, operationId: string) {
  emitOperationalEvent({ actorId: userId, errorCode: code, eventType: "account_deletion_failed", operationId, requestId, route: "/api/account/delete", severity: "high" });
  return safeError("ACCOUNT_DELETION_RETRY_REQUIRED", "Your account was not deleted. Try again in a moment.", requestId, 503);
}

async function irreversibleDeletionFailure(admin: ReturnType<typeof createOperationsAdminClient>, userId: string, key: string, requestId: string, code: string) {
  try { await admin.rpc("mark_account_deletion_result", { p_completed: false, p_error_code: code, p_idempotency_key: key, p_user_id: userId }); } catch { /* Reconciliation event remains critical. */ }
  await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" }).catch(() => null);
  emitOperationalEvent({ actorId: userId, errorCode: code, eventType: "account_deletion_failed", requestId, route: "/api/account/delete", severity: "critical" });
  return safeError("ACCOUNT_DELETION_RECONCILIATION_REQUIRED", "Account deletion needs operator reconciliation. Normal account use has been disabled.", requestId, 503);
}

function safeError(code: string, error: string, requestId: string, status: number) {
  return Response.json({ code, error, supportReference: buildSupportReference({ code, requestId }) }, { headers: { "Cache-Control": "private, no-store, max-age=0" }, status });
}
