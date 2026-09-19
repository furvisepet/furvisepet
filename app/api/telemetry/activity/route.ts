import { readBoundedRawBody } from "../../../lib/security/bounded-raw-body";
import { getAuthenticatedApiContext } from "../../../lib/authenticated-api-server";
import { createOperationsAdminClient } from "../../../lib/operations/admin-client";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";
const features=new Set(["today","pets","history","ask","vet-brief","account","membership","products","settings","other"]);
export async function POST(request:Request){
 const auth=await getAuthenticatedApiContext(request);if("response" in auth)return new Response(null,{status:auth.response.status,headers:PRIVATE_CACHE_HEADERS});
 let body;try{body=JSON.parse(new TextDecoder().decode(await readBoundedRawBody(request,250)));}catch{return new Response(null,{status:400,headers:PRIVATE_CACHE_HEADERS});}
 if(!body || !features.has(body.feature) || !["heartbeat","browser_error"].includes(body.kind))return new Response(null,{status:400,headers:PRIVATE_CACHE_HEADERS});
 const {error}=await createOperationsAdminClient().rpc("owner_record_activity",{p_user:auth.userId,p_feature:body.feature,p_error:body.kind==="browser_error"});
 return new Response(null,{status:error?503:204,headers:PRIVATE_CACHE_HEADERS});
}
