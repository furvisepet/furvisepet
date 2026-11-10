import { directFixturePlan } from "./recursive-wire-fixture.mjs";
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {admitAiOperation} from '../../app/lib/ai/usage-guard/admission.ts';
import {MemoryAiGuardTestStore} from '../../app/lib/ai/usage-guard/memory-test-store.ts';
import {interpretAskQuestion,prepareAskInterpretationRequest} from '../../app/lib/intelligence/interpret-ask.ts';
import {hydratePlanningCatalog,verifyPlanningCatalogSource} from '../../app/lib/intelligence/hydrate-planning-catalog.ts';
const seed=JSON.parse(readFileSync(new URL('../fixtures/ask-catalog-proof-seed.json',import.meta.url),'utf8'));
const defaults=JSON.parse(seed.sent[1].input).intent.request;
export function sourceFixtureDb(context,db){
 const source={id:context.currentTurn.id,user_id:context.owner.userId,conversation_id:context.conversationId,role:'user',user_text:context.currentMessage,created_at:context.currentTurn.createdAt};
 return {from(table){
  if(table!=='ask_conversation_messages')return db.from(table);
  const filters=[];const q={select(){return q},eq(k,v){filters.push(row=>row[k]===v);return q},
   maybeSingle:async()=>({data:filters.every(f=>f(source))?source:null,error:null})};return q;
 }};
}
export async function stagedOperation({context,purpose,request,db,initial=()=>{},catalog=()=>{}}){
 const p={draftAnswer:null,...structuredClone(defaults),writeJob:null,removeJob:null,stateTransitionJob:null,lifecyclePlan:null,storedRead:null,
  appendJob:null,fieldMutationJob:null,readTicket:null,calculatePlan:null,task:null,frame:null,mutationIntent:null,
  profileFields:[],evidenceNeeds:[],requirements:[],referenceTurnIds:[],excludedPetNames:[],...request,question:context.currentMessage};
 if(purpose==='concern')p.premiseQuotes=null;
 const ownerScope=purpose==='receipt'&&p.storedRead.scope==='owner';
 const intent={version:'ask-catalog-intent.v1',purpose,sourceTurnId:context.currentTurn.id,instructionQuote:context.currentMessage.trim(),
  authorizationQuote:context.currentMessage,scope:ownerScope?'owner_receipt':'subjects',
  ownerScope:ownerScope?{basis:'explicit_owner_receipts',sourceTurnId:context.currentTurn.id,quote:context.currentMessage}:null,
  subjects:ownerScope?[]:p.petNames.map(petName=>({petName,sourceTurnId:context.currentTurn.id,quote:context.currentMessage,basis:petName===context.pet.name?'selected':'named'})),request:p};
 const admission=await admitAiOperation({feature:'ask',userId:context.owner.userId,requestId:crypto.randomUUID(),payload:{fixture:purpose},intendedModel:'gpt-5.4-mini',env:{NODE_ENV:'test',FURVISE_AI_DAILY_CALL_LIMIT:'20',FURVISE_AI_DAILY_COST_LIMIT_USD:'1'},store:new MemoryAiGuardTestStore()});
 let calls=0,hydrated;
 try{return await admission.run(async()=>{
  const prepared=prepareAskInterpretationRequest(context,'gpt-5.4-mini');
  const encoded=directFixturePlan(prepared.transport).encode({request:intent});
  const result=await interpretAskQuestion({context,model:'gpt-5.4-mini',catalogService:{requestId:'fixture-'+purpose,capability:()=>({available:true}),
   hydrate:async permit=>{hydrated=await hydratePlanningCatalog(permit,prepared.context,db);return hydrated;},verify:permit=>verifyPlanningCatalogSource(permit,db)},
   client:{responses:{create:async wire=>{
    calls++;const input=JSON.parse(wire.input);
    if(calls===1){initial(input,wire);return{output_text:JSON.stringify(encoded),usage:{input_tokens:1,output_tokens:1}};}
    assert.equal(calls,2);assert.equal(purpose==='lifecycle',false);catalog(input,wire);
    assert.ok(input.catalog.evidence.length);return{output_text:JSON.stringify({version:'ask-catalog-selection.v1',disposition:'selected',reference:input.catalog.evidence[0].reference}),usage:{input_tokens:1,output_tokens:1}};
   }}}
  });
  assert.equal(calls,purpose==='lifecycle'?1:2);
  return{result,context:hydrated.context,calls,catalog:hydrated.catalog};
 });}catch(error){throw new Error(JSON.stringify(error.diagnostics||error.message),{cause:error});}finally{await admission.release();}
}
