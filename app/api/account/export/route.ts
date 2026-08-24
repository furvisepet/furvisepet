import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";
import { emitOperationalEvent } from "../../../lib/operations/events";
import { buildSupportReference } from "../../../lib/operations/support-reference";
import { buildUserDataExport } from "../../../lib/operations/user-data-export";
import { beginIdempotentRateLimitedOperation } from "../../../lib/security/idempotency";
import { requireRecentInteractiveAuthentication } from "../../../lib/security/recent-auth";

export async function POST(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const requestId = request.headers.get("idempotency-key") || crypto.randomUUID();
  const recentAuth = await requireRecentInteractiveAuthentication(context);
  if (!recentAuth.allowed) return safeError(recentAuth.code, "Sign in again before exporting your data.", requestId, 401);
  const gate = await beginIdempotentRateLimitedOperation({ operationType: "account.data.export", payload: { version: 1 }, policy: "DATA_EXPORT", request, route: "/api/account/export", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const started = Date.now();
    emitOperationalEvent({ actorId: context.userId, eventType: "data_export_started", requestId, route: "/api/account/export", severity: "info" });
    try {
      const body = await buildUserDataExport(createOperationsAdminClient(), context.user);
      emitOperationalEvent({ actorId: context.userId, durationMs: Date.now() - started, eventType: "data_export_completed", requestId, route: "/api/account/export", severity: "info" });
      return new Response(body, { headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": `attachment; filename="furvise-data-${new Date().toISOString().slice(0, 10)}.json"`, "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
    } catch (error) {
      const code = error instanceof Error && error.message === "EXPORT_TOO_LARGE" ? "EXPORT_TOO_LARGE" : "EXPORT_FAILED";
      emitOperationalEvent({ actorId: context.userId, durationMs: Date.now() - started, errorCode: code, eventType: "application_error", requestId, route: "/api/account/export", severity: "high" });
      return safeError(code, code === "EXPORT_TOO_LARGE" ? "Your export is too large for immediate download. Contact support for an assisted export." : "Your export could not be prepared.", requestId, code === "EXPORT_TOO_LARGE" ? 413 : 503);
    }
  });
}

function safeError(code: string, error: string, requestId: string, status: number) {
  return Response.json({ code, error, supportReference: buildSupportReference({ code, requestId }) }, { headers: { "Cache-Control": "private, no-store, max-age=0" }, status });
}
