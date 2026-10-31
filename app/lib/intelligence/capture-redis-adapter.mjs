import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(x).digest('hex');
export function captureStore({env=process.env, principal, requestId, expiresAt, fetcher=fetch}={}){
 if(env.VERCEL_ENV!=='preview'||env.FURVISE_PREVIEW_CAPTURE_ENABLED!=='true')return null;
 if(!principal?.authenticated||!principal?.captureOperator||!principal.tenantId||!requestId||!Number.isInteger(expiresAt)||expiresAt<=Date.now()/1000||expiresAt>Date.now()/1000+3600)throw Error('CAPTURE_BINDING_DENIED');
 const tenant=principal.tenantId, key='furvise:preview-capture:v1:'+digest(JSON.stringify([tenant,requestId]));
 const url=env.FURVISE_PREVIEW_CAPTURE_KV_REST_API_URL, token=env.FURVISE_PREVIEW_CAPTURE_KV_REST_API_TOKEN;
 if(!url||new URL(url).protocol!=='https:'||!token)throw Error('CAPTURE_STORAGE_UNCONFIGURED');
 async function command(cmd){let r;try{r=await fetcher(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(cmd),signal:AbortSignal.timeout(8000)});}catch{throw Error('CAPTURE_STORAGE_UNAVAILABLE');}if(!r.ok)throw Error('CAPTURE_STORAGE_DENIED');const x=await r.json();if(x.error)throw Error('CAPTURE_STORAGE_FAILED');return x.result;}
 return {
 async write(sequence,payload){if(!Number.isInteger(sequence)||sequence<0||sequence>63||typeof payload!=='string'||Buffer.byteLength(payload)>4194304)throw Error('CAPTURE_BOUND');const record=JSON.stringify({tenantHash:digest(tenant),requestId,payload,payloadSha256:digest(payload)});if(await command(['SET',key+':'+sequence,record,'NX','EXAT',expiresAt])!=='OK')throw Error('CAPTURE_COLLISION');return digest(payload);},
 async read(sequence,reader){if(!reader?.authenticated||!reader?.captureOperator||reader.tenantId!==tenant)throw Error('CAPTURE_READ_DENIED');const raw=await command(['GET',key+':'+sequence]);if(raw===null)return null;const x=JSON.parse(raw);if(x.tenantHash!==digest(tenant)||x.requestId!==requestId||digest(x.payload)!==x.payloadSha256)throw Error('CAPTURE_INTEGRITY');return x;},
 key
 };
}