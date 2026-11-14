import {selectionFixture,answerFixture,sdkFixture} from "./ask-read-only-wire-fixtures.mjs";
import assert from "node:assert/strict";
import {readOnlyFailureRouteFixture,note} from "./ask-read-only-failure-route.mjs";
import {admitAiOperation} from "../../app/lib/ai/usage-guard/admission.ts";
import {MemoryAiGuardTestStore} from "../../app/lib/ai/usage-guard/memory-test-store.ts";
/** Actual POST, core, SDK accounting, publication and finalization; only auth/DB/provider IO is mocked. */
export function readOnlySuccessRouteFixture(options={}){
 const wire=[],admitted=[],store=new MemoryAiGuardTestStore();let admission;
 const client={responses:{async create(request){
  wire.push(structuredClone(request));
  assert.ok(wire.length<=2,"no hidden physical provider call");
  if(options.providerCreate)return options.providerCreate(request,wire.length);
  const text=options.answer??"I can read saved information, but I can’t cancel actions or change records through Ask.";
  return sdkFixture(request,wire.length===1?selectionFixture({draft:text}):answerFixture({text,replyType:options.replyType??"refusal"}));
 }}};
 const f=readOnlyFailureRouteFixture(()=>{throw Error("native SDK fixture must handle provider IO");},options.records??[note],{
  ...options,model:"gpt-5.4-mini",nativeClient:client,
  admitAiOperation:async input=>{
   admission=await admitAiOperation({...input,store,env:{NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",FURVISE_AI_DAILY_COST_LIMIT_USD:"1",FURVISE_RATE_LIMIT_HASH_SECRET:"native-route-offline-fixture-secret"}});
   const begin=admission.beginProviderCall.bind(admission);
   admission.beginProviderCall=async input=>{admitted.push(structuredClone(input.input));return begin(input);};
   return admission;
  }
 });
 return {...f,wire,admitted,store,release:async()=>{if(admission)await admission.release();}};
}
