import { readBoundedRawBody } from "../../../lib/security/bounded-raw-body";
import { requireDashboardOwner } from "../../../lib/operations/owner-dashboard-server";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";
export async function POST(request: Request) {
 const owner=await requireDashboardOwner(request); if("response" in owner)return owner.response;
 let body;try{body=JSON.parse(new TextDecoder().decode(await readBoundedRawBody(request,300)));}catch{return new Response(null,{status:400,headers:PRIVATE_CACHE_HEADERS});}
 if(!body || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId) || typeof body.excluded!=="boolean" || Object.keys(body).sort().join()!=="excluded,userId")return Response.json({error:"Invalid request."},{status:400,headers:PRIVATE_CACHE_HEADERS});
 const db=createOperationsAdminClient();
 const result=body.excluded ? await db.from("owner_dashboard_exclusions").upsert({user_id:body.userId}) : await db.from("owner_dashboard_exclusions").delete().eq("user_id",body.userId);
 return Response.json(result.error?{error:"Could not change the filter."}:{ok:true},{status:result.error?503:200,headers:PRIVATE_CACHE_HEADERS});
}
