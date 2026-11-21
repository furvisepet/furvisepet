import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";
import { emitOperationalEvent } from "../../../lib/operations/events";
import { buildSupportReference } from "../../../lib/operations/support-reference";
import { buildUserDataExport, encodeUserDataExport, MAX_EXPORT_DOWNLOAD_BYTES, readPetRecordsForExport } from "../../../lib/operations/user-data-export";
import { beginIdempotentRateLimitedOperation } from "../../../lib/security/idempotency";
import { beginRateLimitedRequest } from "../../../lib/security/rate-limit";
import { requireRecentInteractiveAuthentication } from "../../../lib/security/recent-auth";

export async function POST(request: Request) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  const requestId = request.headers.get("idempotency-key") || crypto.randomUUID();
  const recentAuth = await requireRecentInteractiveAuthentication(context);
  if (!recentAuth.allowed) return safeError(recentAuth.code, "Sign in again before exporting your data.", requestId, 401);

  const params = new URL(request.url).searchParams;
  const wantsPetRecords = params.get("format") === "pet-records-pdf";
  const timeZone = safeExportTimeZone(params.get("tz"));
  const payload = wantsPetRecords ? { version: 1, format: "pet-records-pdf", timeZone } : { version: 1 };

  const prepareDownload = async () => {
    const started = Date.now();
    emitOperationalEvent({ actorId: context.userId, eventType: "data_export_started", requestId, route: "/api/account/export", severity: "info" });
    try {
      const date = new Date();
      const stamp = date.toISOString().slice(0, 10);
      let file: { body: BodyInit; contentType: string; name: string };
      if (wantsPetRecords) {
        const { renderPetRecordsPdf } = await import("../../../lib/operations/pet-records-pdf");
        const records = await readPetRecordsForExport(context.supabase, context.user);
        const bytes = await renderPetRecordsPdf(records, { date, timeZone });
        if (bytes.byteLength > MAX_EXPORT_DOWNLOAD_BYTES) throw new Error("EXPORT_TOO_LARGE");
        file = { body: Buffer.from(bytes), contentType: "application/pdf", name: "furvise-pet-care-records-" + stamp + ".pdf" };
      } else {
        const body = await buildUserDataExport(createOperationsAdminClient(), context.user, context.supabase);
        const encoded = await encodeUserDataExport(body);
        file = { body: encoded.body, contentType: encoded.contentType, name: "furvise-data-" + stamp + encoded.suffix };
      }
      emitOperationalEvent({ actorId: context.userId, durationMs: Date.now() - started, eventType: "data_export_completed", requestId, route: "/api/account/export", severity: "info" });
      return new Response(file.body, { headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": 'attachment; filename="' + file.name + '"', "Content-Type": file.contentType, "X-Content-Type-Options": "nosniff" } });
    } catch (error) {
      if (wantsPetRecords && error instanceof Error && error.name === "UnsupportedBriefPdfTextError") {
        return safeError("PDF_TEXT_UNSUPPORTED", "Some characters cannot be printed in this report. Download all account data to get the original text.", requestId, 422);
      }
      const code = error instanceof Error && error.message === "EXPORT_TOO_LARGE" ? "EXPORT_TOO_LARGE" : "EXPORT_FAILED";
      const diagnostic = error instanceof Error && /^EXPORT_(QUERY_FAILED_[A-Z_]+|COUNT_UNAVAILABLE|INCOMPLETE|CHANGED_DURING_READ|TOO_LARGE)$/.test(error.message) ? error.message : code;
      emitOperationalEvent({ actorId: context.userId, durationMs: Date.now() - started, errorCode: diagnostic, eventType: "application_error", requestId, route: "/api/account/export", severity: "high" });
      return safeError(code, code === "EXPORT_TOO_LARGE" ? "Your export is too large for immediate download. Contact support for an assisted export." : "Your export could not be prepared.", requestId, code === "EXPORT_TOO_LARGE" ? 413 : 503);
    }
  };

  const gate = await beginIdempotentRateLimitedOperation({
    operationType: "account.data.export", payload, policy: "DATA_EXPORT",
    request, route: "/api/account/export", supabase: context.supabase, userId: context.userId,
    reconcilePersistedReplay: async ({ claimOutcome, storedResponse }) => {
      if (claimOutcome !== "completed" || !storedResponse.ok) return null;
      // Replays still require recent auth and regenerate a private attachment.
      // Charge the read against the export quota using a fresh rate-limit key.
      const replayId = crypto.randomUUID();
      const rate = await beginRateLimitedRequest({
        idempotencyKey: replayId, request, requestId: replayId,
        payload, policy: "DATA_EXPORT", route: "/api/account/export", userId: context.userId,
      });
      if (!rate.allowed) return rate.response;
      const replay = await prepareDownload();
      replay.headers.set("Idempotency-Replayed", "true");
      return replay;
    },
  });
  if ("response" in gate) return gate.response;

  let download: Response | undefined;
  const settled = await gate.operation.execute(async () => {
    download = await prepareDownload();
    // Persist a receipt for successful exports. The private document is never replayed from storage.
    return download.ok ? Response.json({ ok: true }) : download;
  });
  if (!settled.ok || !download) return settled;
  download.headers.set("Idempotency-Replayed", "false");
  return download;
}

function safeError(code: string, error: string, requestId: string, status: number) {
  return Response.json({ code, error, supportReference: buildSupportReference({ code, requestId }) }, { headers: { "Cache-Control": "private, no-store, max-age=0" }, status });
}

function safeExportTimeZone(value: string | null) {
  if (!value || value.length > 64) return "UTC";
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
