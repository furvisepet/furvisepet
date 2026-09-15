import "server-only";
import { getAuthenticatedApiContext } from "../authenticated-api-server";
import { PRIVATE_CACHE_HEADERS } from "../security/private-routes";
import { isFurviseOwner, FURVISE_OWNER_ID } from "./owner-access";
import { createOperationsAdminClient } from "./admin-client";
import { safeOperationalIdentifier } from "./events/redaction";

export async function requireDashboardOwner(request: Request) {
  const auth = await getAuthenticatedApiContext(request);
  if ("response" in auth) return { response: Response.json({ error: "Authentication required." }, { status: auth.response.status, headers: PRIVATE_CACHE_HEADERS }) };
  if (!isFurviseOwner(auth.user)) return { response: Response.json({ error: "Not found." }, { status: 404, headers: PRIVATE_CACHE_HEADERS }) };
  return { userId: auth.userId };
}
export async function readOwnerDashboard(days: number, includeTests: boolean) {
  const { data, error } = await createOperationsAdminClient().rpc("owner_dashboard_snapshot", {
    p_days: days, p_include_tests: includeTests, p_owner: FURVISE_OWNER_ID,
    p_owner_hash: safeOperationalIdentifier(FURVISE_OWNER_ID) || "",
  });
  if (error || !data) throw new Error("OWNER_DASHBOARD_UNAVAILABLE");
  return data;
}
