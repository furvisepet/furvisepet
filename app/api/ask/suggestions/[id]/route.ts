import { getAuthenticatedApiContext } from "../../../../lib/authenticated-api-server";

/** Retain the public denial contract without loading privileged write authority. */
export async function PATCH(request: Request) {
  const requestId = globalThis.crypto.randomUUID();
  const auth = await getAuthenticatedApiContext(request);
  if ("response" in auth) {
    if (auth.response.status === 401) return Response.json({ code: "SUGGESTION_FORBIDDEN",
      error: "Your session expired. Sign in again to continue.", ok: false, requestId },
      { status: 401, headers: { "Cache-Control": "private, no-store" } });
    return auth.response;
  }
  return Response.json({ code: "SUGGESTION_CONFLICT",
    error: "Ask suggestions cannot change saved information in the public beta.", ok: false, requestId },
    { status: 409, headers: { "Cache-Control": "private, no-store" } });
}
