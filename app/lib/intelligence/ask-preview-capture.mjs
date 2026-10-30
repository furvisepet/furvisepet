import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
const active=new AsyncLocalStorage();
const stages=new Set(['request','raw_provider','operation_decoded','canonical_decoded','binder_input','binder_output','capability','route_request','error_exit','request_exit','history_publication']);
const hash=s=>createHash('sha256').update(s).digest('hex');
// Server-injected sink only. No header, cookie, query, client input or environment path activates capture.
export function withPreviewCapture(binding,sink,action){
 if(process.env.VERCEL_ENV!=='preview')return action();
 if(!binding||!/^[a-f0-9]{64}$/.test(binding.sourceSha256)||typeof binding.requestId!=='string'||!binding.requestId
   ||typeof binding.deploymentId!=='string'||!binding.deploymentId||typeof sink!=='function')throw Error('ASK_CAPTURE_BINDING');
 return active.run({binding:{requestId:binding.requestId,deploymentId:binding.deploymentId,sourceSha256:binding.sourceSha256},
  sink,sequence:0,bytes:0,requestSha256:null,pending:[],failure:null,observations:[],observationBytes:0,observationIncomplete:false,observationReasons:[],observationReceiptPersisted:false},action);
}
export function capturePreviewEvidence(stage,value){
 const s=active.getStore();if(!s||process.env.VERCEL_ENV!=='preview')return;
 if(!stages.has(stage))throw Error('ASK_CAPTURE_STAGE');
 // JSON bytes are retained, not just a hash. Detach before sink code can inspect them.
 const payload=JSON.stringify(value);
 if(typeof payload!=='string'||Buffer.byteLength(payload)>4194304||s.bytes+Buffer.byteLength(payload)>33554432)throw Error('ASK_CAPTURE_BOUND');
 if(stage==='request')s.requestSha256=hash(JSON.stringify(value.request));
 if(!s.requestSha256&&!['route_request','error_exit','request_exit'].includes(stage))throw Error('ASK_CAPTURE_REQUEST_REQUIRED');
 const record=Object.freeze({...s.binding,requestSha256:s.requestSha256,sequence:s.sequence,stage,payload,payloadSha256:hash(payload)});
 s.pending.push(record);
 s.sequence++;s.bytes+=Buffer.byteLength(payload);
}

export async function flushPreviewEvidence(){
 const s=active.getStore();if(!s)return;
 if(s.failure)throw Error('ASK_CAPTURE_WRITE_FAILED');
 while(s.pending.length){
  const record=s.pending[0];
  try{await s.sink(record);}catch{s.failure=true;throw Error('ASK_CAPTURE_WRITE_FAILED');}
  s.pending.shift();
 }
}

const observationFailures=new Set(['serialization','payload_bound','cumulative_bound','sink_failure','receipt_bound']);
function observationFailure(s,reason){
 s.observationIncomplete=true;
 if(s.observationReasons.length<5&&!s.observationReasons.includes(reason))s.observationReasons.push(reason);
}
export function previewObservationStatus(){
 const s=active.getStore();
 return s?{complete:!s.observationIncomplete,reasons:[...s.observationReasons],persisted:s.observationReceiptPersisted}:null;
}
export function captureHistoryPublication(value){
 const s=active.getStore();if(!s||process.env.VERCEL_ENV!=='preview')return;
 let payload;
 try{payload=JSON.stringify(value);}catch{observationFailure(s,'serialization');return;}
 if(typeof payload!=='string'||Buffer.byteLength(payload)>4194304){observationFailure(s,'payload_bound');return;}
 const bytes=Buffer.byteLength(payload);
 if(s.observationBytes+bytes>33554432){observationFailure(s,'cumulative_bound');return;}
 s.observations.push({payload,bytes});s.observationBytes+=bytes;
}
// Called only after the original route's mandatory final flush. Never retries a sink write.
export async function flushHistoryPublication(){
 const s=active.getStore();if(!s||process.env.VERCEL_ENV!=='preview')return;
 const entries=s.observations.splice(0);s.observationBytes=0;
 async function write(payload,bytes){
  if(s.sequence>63||s.bytes+bytes>33554432){observationFailure(s,'receipt_bound');return false;}
  const record=Object.freeze({...s.binding,requestSha256:s.requestSha256,sequence:s.sequence++,stage:'history_publication',payload,payloadSha256:hash(payload)});
  s.bytes+=bytes;
  try{await s.sink(record);return true;}catch{observationFailure(s,'sink_failure');return false;}
 }
 for(const e of entries){
  // Keep a bounded slot and byte reserve for the metadata-only incomplete receipt.
  if(s.sequence>=63||s.bytes+e.bytes>33554432-1024){observationFailure(s,'cumulative_bound');continue;}
  if(!await write(e.payload,e.bytes))return; // unknown persistence: no retry or invented receipt
 }
 const payload=JSON.stringify({phase:'capture_completeness',complete:!s.observationIncomplete,reasons:s.observationReasons.filter(x=>observationFailures.has(x))});
 s.observationReceiptPersisted=await write(payload,Buffer.byteLength(payload));
}
