import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fixture,id} from "./helpers/ask-staged-route-fixture.mjs";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {loadReadOnlyContext} from "../app/lib/ask-read-only/context.ts";
import {buildReadOnlyPublication} from "../app/lib/ask-read-only/publication.ts";
import {admitAiOperation} from "../app/lib/ai/usage-guard/admission.ts";
import {MemoryAiGuardTestStore} from "../app/lib/ai/usage-guard/memory-test-store.ts";
const question="How can I make a calming evening routine for my dog?";
test("actual offline read-only route publishes and persists bounded-dialogue omission notice",async t=>{
 t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});
 let observed,admission,calls=0;
 const f=fixture({creditLedger:true,fullCatalogPipeline:true,
  admitAiOperation:async input=>admission=await admitAiOperation({...input,store:new MemoryAiGuardTestStore(),env:{NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",FURVISE_AI_DAILY_COST_LIMIT_USD:"10",FURVISE_RATE_LIMIT_HASH_SECRET:"offline-route-source-window-test-secret-1234567890"}}),
  readOnlyAdapter:{
   runReadOnlyAsk,buildReadOnlyPublication,
   loadReadOnlyContext:async (...args)=>{observed=await loadReadOnlyContext(...args);return observed;},
   createReadOnlyDataAccess:()=>async()=>{throw Error("CONTEXT_WINDOW_MUST_NOT_READ_HISTORY");},
   readOnlyProvider:()=>async (_request,phase)=>{
    calls++;assert.ok(calls<=2);
    if(phase==="read_selection")return {calls:[],text:"Context may be incomplete."};
    return {presentation:{sourceDates:[],contextRequired:true},
     components:[{kind:"general",text:"Earlier dialogue is incomplete; please repeat any important missing context.",sources:[]}],
     sources:[],quotes:[],calculations:[],replyType:"partial"};
   },
  }});
  for(let i=0;i<4;i++)f.rows.dog_profiles.push({...f.rows.dog_profiles[0],id:id(12+i),name:["Aster","Birch","Dahlia","Elm"][i]});
 for(let i=0;i<39;i++)f.rows.ask_conversation_messages.push({id:id(100+i),user_id:id(1),conversation_id:id(21),role:"user",sequence_number:-i,user_text:("Prior message "+i+". "+"Whole prior user text. ".repeat(80)).slice(0,1200),created_at:"2026-09-19T12:"+String(i).padStart(2,"0")+":00Z"});
 const before=structuredClone(f.rows.pet_care_entries);
 try{
   const response=await f.send(question),body=await response.json();
   assert.equal(response.status,200,JSON.stringify(f.state.errors.map(x=>({stage:x.stage,error:x.error?.message}))));
   assert.equal(observed?.dialogueMayBeIncomplete,true);
   const notice=body.response?.missingUsefulDetails?.find(value=>/earlier conversation/i.test(value));
   assert.ok(notice,"The bounded dialogue window must be disclosed");
   const persisted=f.rows.ask_conversation_messages.find(row=>row.role==="furvise");
   assert.ok(persisted?.response_data?.missingUsefulDetails?.includes(notice));
   assert.deepEqual(f.rows.pet_care_entries,before);assert.equal(calls,2);assert.equal(f.state.permits?.length||0,0);
  }finally{if(admission)await admission.release();}
});
