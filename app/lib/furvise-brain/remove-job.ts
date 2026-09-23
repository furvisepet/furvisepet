import { isDeepStrictEqual } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bindCareRecordSelector, careRecordSelectorProviderSchema, resolveCareRecordSelector,
  validExactTarget, CARE_RECORD_UUID, type CareRecordSelector, type CareRecordReference } from "./care-record-target.ts";
export type RemovePlan = Readonly<{operation:"remove";domain:"care_history";target:CareRecordSelector;
  petId:string;sourceMessageId:string;asOf:string;instruction:Readonly<{start:number;end:number;text:string}>}>;
export type RemoveJob = RemovePlan & Readonly<{resolvedTarget:Readonly<{recordId:string;updatedAt:string}>}>;
export function removeJobSchema(references:readonly CareRecordReference[] = []) {
 return {anyOf:[{type:"null"},{type:"object",additionalProperties:false,
  required:["operation","domain","target","petName","instructionQuote"],properties:{
   operation:{type:"string",enum:["remove"]},domain:{type:"string",enum:["care_history"]},
   target:careRecordSelectorProviderSchema(references),petName:{type:"string",minLength:1,maxLength:100},
   instructionQuote:{type:"string",minLength:1,maxLength:1600}}}]};
}
export function bindRemovePlan(value:unknown, source:{id:string;role:string;text:string;createdAt:string;recoveredReceiptReference?:boolean},
 subject:{id:string;name:string},authority:{ownerId:string;references:readonly CareRecordReference[]}):RemovePlan {
 const fail=(field:string):never=>{throw Error("ASK_REQUEST_INVALID:remove_job",{cause:{field}});};
 if(!value||typeof value!=="object"||Array.isArray(value))return fail("shape");
 const p=value as Record<string,unknown>;
 if(Object.keys(p).sort().join()!=="domain,instructionQuote,operation,petName,target"||p.operation!=="remove"||p.domain!=="care_history")return fail("fields");
 if(source.role!=="user"||source.recoveredReceiptReference||!source.id||!Number.isFinite(Date.parse(source.createdAt))
   ||!subject.id||p.petName!==subject.name)return fail("source_scope");
 if(typeof p.instructionQuote!=="string"||!p.instructionQuote||p.instructionQuote.length>1600||p.instructionQuote!==source.text.trim())return fail("instruction");
 const start=source.text.indexOf(p.instructionQuote);
 const target=bindCareRecordSelector(p.target,source,subject,authority,fail);
 return Object.freeze({operation:"remove",domain:"care_history",target,petId:subject.id,sourceMessageId:source.id,asOf:source.createdAt,
  instruction:Object.freeze({start,end:start+p.instructionQuote.length,text:p.instructionQuote})});
}
/** Resolve once, then persist identity/version alongside the semantic selector. */
export async function resolveRemovePlan(plan:RemovePlan,db:SupabaseClient,userId:string):Promise<RemoveJob> {
 const {target,version}=await resolveCareRecordSelector(plan,db,userId);
 if(!Number.isFinite(Date.parse(version)))throw Error("REMOVE_TARGET_VERSION_INVALID");
 return Object.freeze({...plan,resolvedTarget:Object.freeze({recordId:target.id.slice(5),updatedAt:version})});
}
export function readBoundRemoveJob(value:unknown):RemoveJob|null {
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const j=value as RemoveJob,s=j.instruction,r=j.resolvedTarget;
 if(Object.keys(j).sort().join()!=="asOf,domain,instruction,operation,petId,resolvedTarget,sourceMessageId,target"
 ||j.operation!=="remove"||j.domain!=="care_history"||!j.petId||!j.sourceMessageId||!Number.isFinite(Date.parse(j.asOf))
 ||(j.target!=="last_event_for_subject"&&!validExactTarget(j.target))
 ||!s||Object.keys(s).sort().join()!=="end,start,text"||typeof s.text!=="string"||!s.text.trim()||s.text.length>1600
 ||!Number.isInteger(s.start)||s.start<0||s.end!==s.start+s.text.length
 ||!r||Object.keys(r).sort().join()!=="recordId,updatedAt"||!CARE_RECORD_UUID.test(r.recordId)||!Number.isFinite(Date.parse(r.updatedAt))
 ||(typeof j.target!=="string"&&(j.target.recordId!==r.recordId||j.target.updatedAt!==r.updatedAt)))return null;
 return Object.freeze(structuredClone(j));
}
export function rebindRemoveJob(job:RemoveJob,source:{id:string;text:string;createdAt:string},subject:{id:string;name:string},ownerId:string):RemoveJob {
 if(!readBoundRemoveJob(job))throw Error("REMOVE_JOB_INVALID");
 const plan=bindRemovePlan({operation:job.operation,domain:job.domain,petName:subject.name,instructionQuote:job.instruction.text,
  target:typeof job.target==="string"?job.target:{kind:job.target.kind,ref:job.target.ref}}, {...source,role:"user"},subject,{ownerId,
  references:typeof job.target==="string"?[]:[{...job.target,ownerId,petId:job.petId,createdAt:job.asOf,body:"",eventAt:""}]});
 const rebound={...plan,resolvedTarget:job.resolvedTarget};
 if(!isDeepStrictEqual(rebound,job))throw Error("REMOVE_SOURCE_CHANGED");
 return Object.freeze(rebound);
}
export function removeJobActionMatches(job:RemoveJob,action:{kind:string;petId:string;sourceMessageId?:string|null;explicitIntent:boolean;
 targetSourceId?:string|null;input:{field:unknown;value:unknown;title:unknown;detail:unknown;category:unknown;target:unknown}}) {
 return !!readBoundRemoveJob(job)&&action.kind==="care_history.remove"&&action.petId===job.petId&&action.sourceMessageId===job.sourceMessageId
 &&action.explicitIntent===false&&action.targetSourceId==="care:"+job.resolvedTarget.recordId&&!!action.input&&action.input.target==="specified"
 &&[action.input.field,action.input.value,action.input.title,action.input.detail,action.input.category].every(v=>v===null);
}
