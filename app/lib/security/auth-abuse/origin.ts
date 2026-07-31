import "server-only";

import { originRejectionResponse, validateSensitiveRequestOrigin } from "../headers/origin-policy";

export function validatePublicAuthOrigin(request: Request) {
  const result = validateSensitiveRequestOrigin(request);
  if (result.allowed && result.mode === "browser-origin") return null;
  if (!result.allowed) return originRejectionResponse(result, request);
  return Response.json(
    { code: "ORIGIN_NOT_ALLOWED", error: "This request could not be verified. Refresh Furvise and try again." },
    { headers: { "Cache-Control": "private, no-store, max-age=0" }, status: 403 },
  );
}
