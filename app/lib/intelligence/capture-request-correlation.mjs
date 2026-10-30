import 'server-only';
import {captureStore} from './capture-redis-adapter.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const keys=['version','tenantId','ownerId','applicationRequestId','captureRequestId','sourceSha256','deploymentId','sequence','snapshotSha256'];
function validate(m,principal,applicationRequestId,binding){
 if(!m||Array.isArray(m)||Object.keys(m).sort().join()!==[...keys].sort().join()||m.version!==1||
 m.tenantId!==principal.tenantId||m.ownerId!==principal.tenantId||m.applicationRequestId!==applicationRequestId||
 !uuid(m.applicationRequestId)||!uuid(m.captureRequestId)||m.sourceSha256!==binding.sourceSha256||
 m.deploymentId!==binding.deploymentId||!/^[a-f0-9]{64}$/.test(m.sourceSha256)||
 typeof m.deploymentId!=='string'||!m.deploymentId||!Number.isInteger(m.sequence)||m.sequence<0||m.sequence>63||
 !/^[a-f0-9]{64}$/.test(m.snapshotSha256))throw Error('CAPTURE_MAPPING_INVALID');
}
function index(options,id){return captureStore({...options,requestId:'application:'+id});}
export function correlatedCaptureSink({store,principal,requestId,sourceSha256,deploymentId,...options}){
 return async record=>{
  const snapshotSha256=await store.write(record.sequence,JSON.stringify(record));
  if(record.stage!=='route_request')return;
  const payload=JSON.parse(record.payload);
  if(!Object.hasOwn(payload,'applicationRequestId')||payload.applicationRequestId==='')return;
  const applicationRequestId=payload.applicationRequestId;
  const m={version:1,tenantId:principal.tenantId,ownerId:principal.tenantId,applicationRequestId,captureRequestId:requestId,sourceSha256,deploymentId,sequence:record.sequence,snapshotSha256};
  validate(m,principal,applicationRequestId,{sourceSha256,deploymentId});
  if(record.requestId!==requestId||record.sourceSha256!==sourceSha256||record.deploymentId!==deploymentId)throw Error('CAPTURE_MAPPING_INVALID');
  const s=index({...options,principal},applicationRequestId);
  if(!s)throw Error('CAPTURE_MAPPING_DISABLED');
  await s.write(0,JSON.stringify(m)); // NX: a repeated/ambiguous application ID never replaces an earlier mapping.
 };
}
export async function readApplicationCapture({principal,reader,applicationRequestId,sourceSha256,deploymentId,...options}){
 if(!principal?.authenticated||!principal.captureOperator||!reader?.authenticated||!reader.captureOperator||reader.tenantId!==principal.tenantId||!uuid(applicationRequestId))throw Error('CAPTURE_READ_DENIED');
 const s=index({...options,principal},applicationRequestId);
 if(!s)throw Error('CAPTURE_MAPPING_DISABLED');
 const entry=await s.read(0,reader);
 if(!entry)throw Error('CAPTURE_MAPPING_MISSING');
 let m;try{m=JSON.parse(entry.payload);}catch{throw Error('CAPTURE_MAPPING_INVALID');}
 validate(m,principal,applicationRequestId,{sourceSha256,deploymentId});
 const store=captureStore({...options,principal,requestId:m.captureRequestId});
 const snapshot=await store.read(m.sequence,reader);
 if(!snapshot||snapshot.payloadSha256!==m.snapshotSha256)throw Error('CAPTURE_MAPPING_BINDING');
 let r,p;try{r=JSON.parse(snapshot.payload);p=JSON.parse(r.payload);}catch{throw Error('CAPTURE_MAPPING_BINDING');}
 if(r.requestId!==m.captureRequestId||r.sourceSha256!==sourceSha256||r.deploymentId!==deploymentId||r.sequence!==m.sequence||r.stage!=='route_request'||p.applicationRequestId!==applicationRequestId)throw Error('CAPTURE_MAPPING_BINDING');
 return {mapping:m,snapshot};
}
