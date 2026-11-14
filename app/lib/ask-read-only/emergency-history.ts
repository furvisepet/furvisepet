import "server-only";
import { isDeepStrictEqual } from "node:util";

type JsonRecord = Record<string, unknown>;
type Input = { userId:string; petId:string; conversationId:string; requestId:string; question:string; responseData:JsonRecord; saveMetadata:JsonRecord; contextUsed:JsonRecord; signal?:AbortSignal };
type Exchange = { data:unknown; error:unknown };
type Lease = { release:()=>Promise<unknown> };
type Common = { userId:string;requestId:string;preview:string;userText:string;responseData:JsonRecord;saveMetadata:JsonRecord;contextUsed:JsonRecord;signal:AbortSignal };
type Deps = {
 claim:()=>Promise<Lease>;
 conversation:(id:string,owner:string,signal:AbortSignal)=>Promise<{id:string;pet_profile_id:string}|null>;
 create:(input:Common & {petId:string;title:string})=>Promise<Exchange>;
 append:(input:Common & {conversationId:string})=>Promise<Exchange>;
};
export type EmergencyHistoryReceipt = { conversationId:string; userMessageId:string; assistantMessageId:string };
export type EmergencyHistoryResult = { status:"confirmed";receipt:EmergencyHistoryReceipt } | { status:"skipped"|"unconfirmed";reason:"invalid_scope"|"not_owned"|"unavailable"|"deadline" };
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
function receipt(data:unknown,input:Input):EmergencyHistoryReceipt|null{
 if(!Array.isArray(data)||data.length!==2)return null;
 const rows=data as JsonRecord[],user=rows.find(r=>r.message_role==="user"),assistant=rows.find(r=>r.message_role==="furvise");
 if(!user||!assistant||!uuid(user.message_id)||!uuid(assistant.message_id)||user.message_id===assistant.message_id
  ||rows.some(r=>r.message_request_id!==input.requestId)
  ||user.message_user_text!==input.question||!Number.isSafeInteger(user.message_sequence_number)
  ||assistant.message_sequence_number!==(user.message_sequence_number as number)+1
  ||!isDeepStrictEqual(assistant.message_response_data,JSON.parse(JSON.stringify(input.responseData)))
  ||!isDeepStrictEqual(assistant.message_save_metadata,JSON.parse(JSON.stringify(input.saveMetadata)))
  ||!isDeepStrictEqual(assistant.message_context_used,JSON.parse(JSON.stringify(input.contextUsed))))return null;
 const conversationId=input.conversationId||user.conversation_id;
 if(!uuid(conversationId)||!input.conversationId&&rows.some(r=>r.conversation_id!==conversationId))return null;
 return {conversationId,userMessageId:user.message_id,assistantMessageId:assistant.message_id};
}
/** Optional Ask-chat publication, never a clinical read, care write, model call or
 * credit decision. Existing service-only atomic RPCs enforce current ownership
 * and request idempotency. A timeout is UNCONFIRMED, not a claim nothing saved. */
export async function persistEmergencyHistory(input:Input,deps:Deps,budgetMs=1000):Promise<EmergencyHistoryResult>{
 const trace=input.responseData.turn as JsonRecord|undefined;
 if(!trace||trace.logicalTurnId!==input.requestId||trace.routeType!=="emergency"||trace.executionMode!=="deterministic"||trace.providerCallCount!==0||trace.finalStage!=="COMPLETED"
  ||!["not_required","not_reserved"].includes(String(trace.creditState))||input.responseData.urgency!=="urgent"
  ||Array.isArray(input.responseData.applicationActions)&&input.responseData.applicationActions.length
  ||input.saveMetadata.reason!=="deterministic_emergency_preflight"||input.saveMetadata.persistenceEligible!==false
  ||input.contextUsed.petName!==null||!Array.isArray(input.contextUsed.usedSources)||input.contextUsed.usedSources.length)return {status:"skipped",reason:"invalid_scope"};
 if(!uuid(input.userId)||!uuid(input.petId)||!uuid(input.requestId)||input.conversationId&&!uuid(input.conversationId)
  ||!input.question.trim()||input.question.length>1200)return {status:"skipped",reason:"invalid_scope"};
 const controller=new AbortController(),stop=()=>controller.abort();
 input.signal?.addEventListener("abort",stop,{once:true});
 if(input.signal?.aborted)controller.abort();
 let lease:Lease|undefined,confirmed:EmergencyHistoryReceipt|null=null;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const limit=Math.min(1000,Math.max(1,Number.isFinite(budgetMs)?budgetMs:1000));
 const work=(async():Promise<EmergencyHistoryResult>=>{
  try{
   if(controller.signal.aborted)return {status:"unconfirmed",reason:"deadline"};
   lease=await deps.claim();
   if(controller.signal.aborted)return {status:"unconfirmed",reason:"deadline"};
   if(input.conversationId){
    const row=await deps.conversation(input.conversationId,input.userId,controller.signal);
    if(!row||row.id!==input.conversationId||row.pet_profile_id!==input.petId)return {status:"skipped",reason:"not_owned"};
   }
   if(controller.signal.aborted)return {status:"unconfirmed",reason:"deadline"};
   const common={userId:input.userId,requestId:input.requestId,preview:String(input.responseData.directAnswer??"").slice(0,220).replace(/[\uD800-\uDBFF]$/,""),
    userText:input.question,responseData:input.responseData,saveMetadata:input.saveMetadata,contextUsed:input.contextUsed,signal:controller.signal};
   const result=input.conversationId?await deps.append({...common,conversationId:input.conversationId})
    :await deps.create({...common,petId:input.petId,title:"Emergency guidance"});
   if(controller.signal.aborted)return {status:"unconfirmed",reason:"deadline"};
   if(result.error)return {status:"unconfirmed",reason:"unavailable"};
   confirmed=receipt(result.data,input);
   return confirmed?{status:"confirmed",receipt:confirmed}:{status:"unconfirmed",reason:"unavailable"};
  }catch{return {status:"unconfirmed",reason:controller.signal.aborted?"deadline":"unavailable"};}
  finally{try{await lease?.release();}catch{/* Lease cleanup never removes immediate guidance or a verified receipt. */}}
 })();
 const deadline=new Promise<EmergencyHistoryResult>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({status:"unconfirmed",reason:"deadline"});},limit);});
 try{
  const result=await Promise.race([work,deadline]);
  // A verified atomic receipt is already authoritative even if lease cleanup
  // is slow. Late receipts after returning an unconfirmed result cannot edit it.
  return confirmed?{status:"confirmed",receipt:confirmed}:result;
 }finally{if(timer)clearTimeout(timer);input.signal?.removeEventListener("abort",stop);}
}
