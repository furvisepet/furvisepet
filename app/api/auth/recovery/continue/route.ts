import { NextResponse } from "next/server";
import { applyPrivateCacheHeaders } from "../../../../lib/security/private-routes";
import { validatePublicAuthOrigin } from "../../../../lib/security/auth-abuse";
import { RECOVERY_CONFIRMATION_LIMITS, parseRecoveryConfirmationUrl } from "../../../../lib/security/auth-abuse/recovery-confirmation.mjs";
import { claimRecoveryContinuationToken } from "../../../../lib/security/auth-abuse/recovery-continuation";

const ERROR_PATH = "/reset-password/confirm?error=invalid";

export async function POST(request: Request) {
  const originFailure = validatePublicAuthOrigin(request);
  if (originFailure) return protect(originFailure);

  let confirmationUrl = "";
  try {
    confirmationUrl = await readConfirmationUrl(request);
  } catch {
    return errorRedirect(request);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const parsed = parseRecoveryConfirmationUrl(confirmationUrl, supabaseUrl, new URL(request.url).origin);
  if (!parsed) return errorRedirect(request);

  try {
    const claim = await claimRecoveryContinuationToken(parsed.token);
    if (claim !== "claimed") return errorRedirect(request);
  } catch {
    return errorRedirect(request);
  }

  return privateRedirect(parsed.url);
}

export function GET() {
  return methodNotAllowed();
}

export function HEAD() {
  return new Response(null, { headers: privateHeaders({ Allow: "POST" }), status: 405 });
}

async function readConfirmationUrl(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") throw new Error("INVALID_FORM");
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > RECOVERY_CONFIRMATION_LIMITS.bodyBytes) throw new Error("PAYLOAD_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_FORM");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > RECOVERY_CONFIRMATION_LIMITS.bodyBytes) {
        await reader.cancel();
        throw new Error("PAYLOAD_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  const form = new URLSearchParams(text);
  if ([...form.keys()].length !== 1 || form.getAll("confirmation_url").length !== 1) throw new Error("INVALID_FORM");
  return form.get("confirmation_url") || "";
}

function methodNotAllowed() {
  return Response.json(
    { code: "METHOD_NOT_ALLOWED", error: "Use the Continue button to reset your password." },
    { headers: privateHeaders({ Allow: "POST" }), status: 405 },
  );
}

function errorRedirect(request: Request) {
  return privateRedirect(new URL(ERROR_PATH, request.url));
}

function privateRedirect(url: URL) {
  const response = NextResponse.redirect(url, 303);
  applyPrivateCacheHeaders(response.headers);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function protect(response: Response) {
  applyPrivateCacheHeaders(response.headers);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function privateHeaders(extra: Record<string, string> = {}) {
  return {
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Expires: "0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    ...extra,
  };
}
