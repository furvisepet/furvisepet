import { providerFixturePlan } from "./helpers/provider-wire-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fixture,id} from "./helpers/ask-staged-route-fixture.mjs";
import {prepareAskInterpretationRequest} from "../app/lib/intelligence/interpret-ask.ts";
import {admitAiOperation} from "../app/lib/ai/usage-guard/admission.ts";
import {MemoryAiGuardTestStore} from "../app/lib/ai/usage-guard/memory-test-store.ts";
const seed=JSON.parse(readFileSync(new URL("./fixtures/ask-catalog-proof-seed.json",import.meta.url),"utf8"));
const intent={ownerScope:null,...JSON.parse(seed.sent[1].input).intent},question=intent.instructionQuote;
test("actual offline route publishes and persists the source-window omission notice",async t=>{
 t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});
 let prepared,admission,providerFailure,calls=0;
 const f=fixture({creditLedger:true,fullCatalogPipeline:true,
  admitAiOperation:async input=>admission=await admitAiOperation({...input,store:new MemoryAiGuardTestStore(),env:{NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",FURVISE_AI_DAILY_COST_LIMIT_USD:"10",FURVISE_RATE_LIMIT_HASH_SECRET:"offline-route-source-window-test-secret-1234567890"}}),
  onContext:ctx=>{prepared=prepareAskInterpretationRequest(ctx,"gpt-5.4-mini");},
  providerCreate:async request=>{try{
   calls++;assert.ok(calls<=1);const input=JSON.parse(request.input);
   assert.equal(input.userSources.find(s=>s.id===input.currentSourceId).text,question);
   assert.ok(input.sourceWindow.omittedPriorUserTurns>0);
   return {status:"completed",output_text:JSON.stringify(providerFixturePlan(prepared).encode({request:intent})),usage:{input_tokens:100,output_tokens:20,total_tokens:120}};
  }catch(error){providerFailure=error;throw error;}}});
 for(let i=0;i<4;i++)f.rows.dog_profiles.push({...f.rows.dog_profiles[0],id:id(12+i),name:["Aster","Birch","Dahlia","Elm"][i]});
 for(let i=0;i<39;i++)f.rows.ask_conversation_messages.push({id:id(100+i),user_id:id(1),conversation_id:id(21),role:"user",user_text:("Prior message "+i+". "+"Whole prior user text. ".repeat(80)).slice(0,1200),created_at:"2026-09-19T12:"+String(i).padStart(2,"0")+":00Z"});
 const before=structuredClone(f.rows.pet_care_entries);
 try{
  const response=await f.send(question),body=await response.json();
  if(providerFailure)throw providerFailure;
  assert.equal(response.status,200,JSON.stringify(f.state.errors.map(x=>({stage:x.stage,error:x.error?.message,diagnostics:x.error?.diagnostics}))));
  const notice=prepared.context.planningSourceWindow.disclosure;
  assert.ok(notice);assert.ok(body.response.missingUsefulDetails.includes(notice));
  const persisted=f.rows.ask_conversation_messages.find(row=>row.role==="furvise");
  assert.ok(persisted.response_data.missingUsefulDetails.includes(notice));
  assert.deepEqual(f.rows.pet_care_entries,before);assert.equal(calls,1);assert.equal(f.state.permits?.length||0,0);
 }finally{if(admission)await admission.release();}
});
