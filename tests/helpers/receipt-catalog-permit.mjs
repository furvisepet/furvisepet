import assert from 'node:assert/strict';
import {admitAiOperation} from '../../app/lib/ai/usage-guard/admission.ts';
import {MemoryAiGuardTestStore} from '../../app/lib/ai/usage-guard/memory-test-store.ts';
import {bindCatalogIntent,beginCatalogHydration} from '../../app/lib/intelligence/catalog-intent.ts';
import {loadStoredReadReferences} from '../../app/lib/furvise-brain/stored-read-organ.ts';
export async function admittedReceiptCatalog({db,owner,pet,now}){
 const text='Show my operation receipts.',source={id:'receipt-query',role:'user',text,createdAt:now.toISOString()};
 const context={owner:{userId:owner},pet,eligiblePets:[pet],currentMessage:text,currentTurn:source,conversationId:'receipt-audit',conversationTurns:[]};
 const request={version:'ask-request.v2',mode:'read',scope:'none',petNames:[],excludedPetNames:[],requirements:[],storedRead:{operation:'read',domain:'operation_receipt',scope:'owner',reference:null,projection:'records'}};
 const intent={version:'ask-catalog-intent.v1',purpose:'receipt',sourceTurnId:source.id,instructionQuote:text,authorizationQuote:text,scope:'owner_receipt',ownerScope:{basis:'explicit_owner_receipts',sourceTurnId:source.id,quote:text},subjects:[],request};
 const admission=await admitAiOperation({feature:'ask',userId:owner,requestId:crypto.randomUUID(),payload:{fixture:'receipt-catalog'},intendedModel:'gpt-5.4-mini',env:{NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1'},store:new MemoryAiGuardTestStore()});
 try{return await admission.run(async()=>{
  const call=await admission.beginProviderCall({model:'gpt-5.4-mini',input:{fixture:'interpretation accounting'},maxOutputTokens:8192,stage:'interpretation'});
  await admission.recordProviderUsage(call.reservation,'gpt-5.4-mini',{inputTokens:1,outputTokens:1});
  const {permit}=bindCatalogIntent(intent,context,'receipt-audit',Date.now()+25000);beginCatalogHydration(permit);
  const result=await loadStoredReadReferences(permit,db);
  await assert.rejects(loadStoredReadReferences({...permit},db),/permit_identity_phase_or_expiry/);
  return result;
 });}finally{await admission.release();}
}
