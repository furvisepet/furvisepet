import 'server-only';
import {randomUUID} from 'node:crypto';
import {captureStore} from './capture-redis-adapter.mjs';
import {correlatedCaptureSink} from './capture-request-correlation.mjs';
import {withPreviewCapture,capturePreviewEvidence,flushPreviewEvidence,flushHistoryPublication} from './ask-preview-capture.mjs';
export async function withAuthenticatedPreviewCapture(authentication,action){
 const env=process.env;
 if(env.VERCEL_ENV!=='preview')return action();
 const raw=env.FURVISE_PREVIEW_CAPTURE_ENABLED==='true', semantic=env.FURVISE_PREVIEW_SEMANTIC_ENABLED==='true';
 if(raw&&semantic)throw Error('ASK_CAPTURE_MODE_CONFLICT');
 if(!raw&&!semantic)return action();
 const mode=semantic?'semantic':'raw';
 if(!authentication||'response' in authentication||!authentication.userId||!authentication.supabase)throw Error('ASK_CAPTURE_AUTH_REQUIRED');
 if(authentication.userId!==env.FURVISE_PREVIEW_CAPTURE_USER_ID)return action();
 const sourceSha256=env.FURVISE_PREVIEW_CAPTURE_SOURCE_SHA256, deploymentId=env.VERCEL_DEPLOYMENT_ID;
 if(!/^[a-f0-9]{64}$/.test(sourceSha256||'')||!deploymentId)throw Error('ASK_CAPTURE_BINDING');
 const requestId=randomUUID();
 const principal={authenticated:true,captureOperator:true,tenantId:authentication.userId};
 const expiresAt=Math.floor(Date.now()/1000)+3600;
 const store=captureStore({principal,requestId,expiresAt,mode});
 return withPreviewCapture({requestId,deploymentId,sourceSha256,mode},correlatedCaptureSink({store,principal,requestId,sourceSha256,deploymentId,expiresAt,mode}),async()=>{
  capturePreviewEvidence('route_request',{captureRequestId:requestId});
  await flushPreviewEvidence();
  try{
   const result=await action();
   capturePreviewEvidence('request_exit',{status:result instanceof Response?result.status:null});
   return result;
  }catch(error){
   capturePreviewEvidence('error_exit',{kind:'route_rejected'});
   throw error;
  }finally{await flushPreviewEvidence();await flushHistoryPublication();}
 });
}
