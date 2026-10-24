import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { isFurviseOwner } from "../../../lib/operations/owner-access";
import { observeReleaseConfiguration } from "../../../lib/operations/release-config-observation";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { ...PRIVATE_CACHE_HEADERS, "X-Content-Type-Options": "nosniff", Vary: "Authorization, Cookie" };

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedApiContext(request);
    if ("response" in auth) return Response.json({ error: "Authentication required." }, { status: auth.response.status, headers });
    if (!isFurviseOwner(auth.user)) return Response.json({ error: "Not found." }, { status: 404, headers });
    // No caller-selected environment, deployment, keys or probe targets.
    if (new URL(request.url).search) return Response.json({ error: "Unsupported request." }, { status: 400, headers });
    const observation = observeReleaseConfiguration();
    if (!observation) return Response.json({ error: "Release configuration observation unavailable." }, { status: 503, headers });
    return Response.json(observation, { status: observation.status === "blocked" ? 503 : 200, headers });
  } catch {
    // No error serialization or logging: auth/provider exceptions may be sensitive.
    return Response.json({ error: "Release configuration observation unavailable." }, { status: 503, headers });
  }
}
