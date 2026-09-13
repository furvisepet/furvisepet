import "server-only";

import {
  originRejectionResponse,
  validateRecoveryContinuationOrigin,
  validateSensitiveRequestOrigin,
} from "../headers/origin-policy";

export function validatePublicAuthOrigin(request: Request, options: { recoveryContinuation?: boolean } = {}) {
  const result = options.recoveryContinuation
    ? validateRecoveryContinuationOrigin(request)
    : validateSensitiveRequestOrigin(request);
  if (result.allowed && (result.mode === "browser-origin" || result.mode === "same-origin-referer")) return null;
  if (!result.allowed) return originRejectionResponse(result, request);
  return Response.json(
    { code: "ORIGIN_NOT_ALLOWED", error: "This request could not be verified. Refresh Furvise and try again." },
    { headers: { "Cache-Control": "private, no-store, max-age=0" }, status: 403 },
  );
}
