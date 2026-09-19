import { requireDashboardOwner, readOwnerDashboard } from "../../../lib/operations/owner-dashboard-server";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const owner = await requireDashboardOwner(request);
  if ("response" in owner) return owner.response;
  const params = new URL(request.url).searchParams;
  const days = Number(params.get("days") || 7);
  if (![1,7,30,90].includes(days)) return Response.json({error:"Invalid date range."},{status:400,headers:PRIVATE_CACHE_HEADERS});
  try { return Response.json(await readOwnerDashboard(days, params.get("includeTests") === "true"), {headers:PRIVATE_CACHE_HEADERS}); }
  catch { return Response.json({error:"Metrics are temporarily unavailable. Try refreshing."},{status:503,headers:PRIVATE_CACHE_HEADERS}); }
}
