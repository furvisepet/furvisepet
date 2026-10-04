import assert from 'node:assert/strict';
import {admitAiOperation} from '../../app/lib/ai/usage-guard/admission.ts';
import {MemoryAiGuardTestStore} from '../../app/lib/ai/usage-guard/memory-test-store.ts';
import {bindCatalogIntent,beginCatalogContinuation,consumeCatalogContinuationToken,bindCatalogSelection} from '../../app/lib/intelligence/catalog-intent.ts';
import {hydratePlanningCatalog} from '../../app/lib/intelligence/hydrate-planning-catalog.ts';
import {validateAskRequest} from '../../app/lib/intelligence/ask-request-contract.ts';
export async function stagedContext(f){
 const context=await f.context();
 assert.equal(context.storedReadReferences,undefined);
 const a=await admitAiOperation({feature:'ask',userId:f.owner,payload:{audit:'receipt'},requestId:crypto.randomUUID(),intendedModel:'gpt-5.4-mini',env:{NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1'},store:new MemoryAiGuardTestStore()});
 try{return await a.run(async()=>{
  const c=await a.beginProviderCall({model:'gpt-5.4-mini',maxOutputTokens:100,input:{x:1},stage:'interpretation'});await a.recordProviderUsage(c.reservation,'gpt-5.4-mini',{inputTokens:0,outputTokens:0});
  const request={calculatePlan:null,storedRead:{operation:'read',domain:'operation_receipt',scope:'owner',reference:null,projection:'records'},removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:null,task:null,writeJob:null,temporalScope:null,profileFields:[],mutationIntent:null,recordSelection:null,projection:null,evidenceNeeds:[],version:'ask-request.v2',mode:'read',question:context.currentMessage,requirements:[],referenceTurnIds:[],evidenceBasis:'stored',outputFormat:null,premiseQuotes:[],excludedPetNames:[],scope:'none',petNames:[],operation:'recall',selection:'summary',quantity:null,topic:'operation receipts',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null};
  const intent={version:'ask-catalog-intent.v1',purpose:'receipt',sourceTurnId:context.currentTurn.id,instructionQuote:context.currentMessage,authorizationQuote:context.currentMessage,scope:'owner_receipt',ownerScope:{basis:'explicit_owner_receipts',sourceTurnId:context.currentTurn.id,quote:context.currentMessage},subjects:[],request};
  const {permit}=bindCatalogIntent(intent,context,'audit-'+crypto.randomUUID(),Date.now()+25000);
  const h=await hydratePlanningCatalog(permit,context,f.db);
  const token=beginCatalogContinuation(permit,h.catalog);consumeCatalogContinuationToken(token);
  const continuation=await a.beginProviderCall({model:'gpt-5.4-mini',maxOutputTokens:100,input:{selection:h.refs[0]??null},stage:'catalog_continuation',purpose:'catalog_continuation'});await a.recordProviderUsage(continuation.reservation,'gpt-5.4-mini',{inputTokens:0,outputTokens:0});
  const selected=bindCatalogSelection(permit,h.catalog,{version:'ask-catalog-selection.v1',disposition:h.refs.length?'selected':'unavailable',reference:h.refs[0]??null},h.refs);
  if(selected)assert.equal(validateAskRequest(selected,h.context).request.storedRead.reference.ref,h.refs[0]);
  return h.context;
 });}finally{await a.release();}
}
export async function stagedReferences(f){return (await stagedContext(f)).storedReadReferences;}
