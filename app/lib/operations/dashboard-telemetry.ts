import "server-only";
import { after } from "next/server.js";
import { createOperationsAdminClient } from "./admin-client";
// Only safe, structured operational fields enter these tables. No prompts,
// answers, cookies, headers, stack traces or pet history are copied here.
export function scheduleDashboardWrite(task: () => Promise<unknown>) {
  if (process.env.NODE_ENV === "test") return;
  const work = async () => { try { await task(); } catch { console.warn("[Owner monitoring] telemetry write unavailable"); } };
  try { after(work); } catch { /* No request lifecycle in scripts/tests. */ }
}
export function persistDashboardEvent(event: Record<string, unknown>) {
 if(event.eventType !== "ask_turn" && event.eventType !== "application_action" && event.severity === "info")return;
 scheduleDashboardWrite(()=>writeDashboardEvent(event));
}
export async function writeDashboardEvent(event: Record<string, unknown>) {
  const db=createOperationsAdminClient();
  const {error}=await db.from("owner_operational_events").upsert({
   event_key:`${event.requestId === "missing" ? event.timestamp : event.requestId}:${event.eventType}:${event.errorCode || ""}`.slice(0,300),
   event_type:event.eventType,feature:String(event.feature || "app").slice(0,80),
   severity:event.severity,error_code:event.errorCode || null,route:String(event.route || "").split("?")[0].slice(0,160),
   request_id:event.requestId,actor_hash:event.actor || null,duration_ms:event.durationMs || null,
   metadata:event.metadata || {},created_at:event.timestamp,
  },{onConflict:"event_key"});
  if(error)throw error;
}
export function persistDashboardCost(event: string,input: {operationId:string;callNumber?:number;feature:string;model?:string;reservedCostMicrodollars?:number;reconciledCostMicrodollars?:number;}) {
 if(!["provider call reserved","provider call reconciled"].includes(event) || !input.callNumber)return;
 scheduleDashboardWrite(async()=>{
  const {error}=await createOperationsAdminClient().rpc("owner_record_provider_cost",{
   p_operation:input.operationId,p_call:input.callNumber,p_feature:input.feature,p_model:input.model || "unknown",
   p_reserved:input.reservedCostMicrodollars || 0,p_actual:input.reconciledCostMicrodollars ?? null,
  });if(error)throw error;
 });
}
