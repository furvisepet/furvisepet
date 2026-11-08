import { getAuthenticatedApiContext } from "../../../../lib/authenticated-api-server";
import { isUuid } from "../../../../lib/security/request";

type RouteContext = { params: Promise<{ messageId: string }> };

/** Read-only Ask cannot execute even a previously issued mutation capability. */
export async function POST(request: Request, routeContext: RouteContext) {
  const { messageId } = await routeContext.params;
  if (!isUuid(messageId)) return unavailable();
  const auth = await getAuthenticatedApiContext(request);
  if ("response" in auth) return auth.response;
  return unavailable();
}
function unavailable() {
  return Response.json({ error: "That action is no longer available." },
    { status: 404, headers: { "Cache-Control": "private, no-store" } });
}
