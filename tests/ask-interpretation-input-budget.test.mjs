// Register tests with Node's worker context intact. Disable only the legacy
// canonical-fixture seam during each native-transport case, then restore it.
import {beforeEach,afterEach} from 'node:test';
const originalTestContext=process.env.NODE_TEST_CONTEXT;
beforeEach(()=>{delete process.env.NODE_TEST_CONTEXT;});
afterEach(()=>{if(originalTestContext===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=originalTestContext;});
import { actualTransportFixturePlan } from "./helpers/recursive-wire-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareAskInterpretationRequest, projectAskInterpretationContext, interpretAskQuestion, recoverAskInterpretation, ASK_INTERPRETATION_LIMITS } from "../app/lib/intelligence/interpret-ask.ts";
import { askRequestFitsInputBudget, askSourceWindows, askUserSourceInput, assertAskSourceWindowProposal } from "../app/lib/intelligence/ask-interpretation-sources.ts";
import { bindUserSourceSpan } from "../app/lib/furvise-brain/append-job.ts";
import { admitAiOperation } from "../app/lib/ai/usage-guard/admission.ts";
import { MemoryAiGuardTestStore } from "../app/lib/ai/usage-guard/memory-test-store.ts";
import { AI_FEATURE_POLICIES } from "../app/lib/ai/usage-guard/features.ts";
import { estimateInputTokens } from "../app/lib/ai/usage-guard/cost-estimator.ts";
import { beginCatalogHydration, sealCatalog } from "../app/lib/intelligence/catalog-intent.ts";
const corpus=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json",import.meta.url),"utf8"));
const profileTemplate=corpus.fixtures.find(f=>f.canonical.request.evidenceBasis==="saved_profile").canonical.request;
const pets=["Aster","Birch","Cedar","Dahlia","Elm"].map((name,i)=>({id:"pet-"+i,user_id:"owner",name,species:"dog",sex:i%2?"female":"male"}));
const model="gpt-5.4-mini";
const turn=(id,text)=>({id,role:"user",text,createdAt:"2026-10-06T00:00:00Z"});
function context(count=0,numeric=false){
 const text=((numeric?"Compare 17 kg and 9 kg for ":"Compare the notes for ")+"Aster, Birch, Cedar, Dahlia and Elm. "+"Keep the original uncertainty and details. ".repeat(40)).slice(0,1200);
 const current=turn("current",text),prior=Array.from({length:count},(_,i)=>turn("prior-"+i,("Earlier user turn "+i+". "+"Whole original text remains intact. ".repeat(45)).slice(0,1200)));
 return {owner:{userId:"owner"},pet:pets[0],eligiblePets:structuredClone(pets),currentMessage:text,currentTurn:current,
  conversationTurns:[...prior,current],conversationId:"conversation",timeZone:"UTC",
  ownerNoteSpans:[{id:"current:0:1200",sourceMessageId:"current",start:0,end:1200,text,role:"source"}]};
}
function proposal(ctx){return {...structuredClone(profileTemplate),question:ctx.currentMessage,scope:"named",petNames:["Aster"],topic:"profile"};}
const usage={input_tokens:100,output_tokens:20};
const env={NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",FURVISE_AI_DAILY_COST_LIMIT_USD:"10",FURVISE_RATE_LIMIT_HASH_SECRET:"offline-v24-input-budget-fixture"};
const quiet=t=>{t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});};
async function admitted(ctx,fn){
 const store=new MemoryAiGuardTestStore(),a=await admitAiOperation({env,store,feature:"ask",intendedModel:model,
  userId:"owner",requestId:crypto.randomUUID(),payload:{fixture:"source-window"},now:new Date("2039-01-01T00:00:00Z")});
 try{return await a.run(()=>fn(a,store));}finally{await a.release();}
}

for(const numeric of [false,true])for(const count of [0,2,8,39])
 test("final request: five pets, 1200 exact characters, "+count+" prior turns, numeric="+numeric,async t=>{
  quiet(t);const ctx=context(count,numeric),p=prepareAskInterpretationRequest(ctx,model),input=JSON.parse(p.request.input);
  assert.equal(input.currentSourceId,"current");assert.equal(input.userSources.filter(s=>s.id==="current").length,1);
  assert.equal(input.userSources.find(s=>s.id==="current").text,ctx.currentMessage);
  assert.equal(input.ownedPets.length,5);assert.deepEqual(input.ownedPets.map(p=>p.name),pets.map(p=>p.name));
  for(const key of ["currentMessage","currentTurn","ownerNoteSources","recentUserMessages","recentDialogueForReferencesOnly","olderUserReferenceCandidates"])assert.equal(Object.hasOwn(input,key),false,key);
  assert.ok(input.userSources.length<=9);assert.equal(p.context.conversationTurns.some(s=>s.id==="current"),false);
  assert.equal(input.sourceWindow.omittedPriorUserTurns,count-p.context.conversationTurns.length);
  assert.equal(input.sourceSpans.some(s=>Object.hasOwn(s,"text")),false);
  for(const source of input.userSources)assert.deepEqual(source,(({id,text,createdAt})=>({id,text,createdAt}))(ctx.conversationTurns.find(t=>t.id===source.id)));
  assert.ok(askRequestFitsInputBudget(p.request));assert.ok(estimateInputTokens(p.request)<=45000);
  assert.ok(JSON.stringify(p.request).length<=135000);assert.equal(p.request.max_output_tokens,8192);
  const omitted=ctx.conversationTurns.filter(t=>t.id!=="current"&&!p.context.conversationTurns.some(x=>x.id===t.id));
  for(const source of omitted)assert.equal(JSON.stringify(p.request.text.format.schema).includes('"'+source.id+'"'),false);
  if(omitted.length)assert.match(input.sourceWindow.disclosure,/omitted/);
  let calls=0;await admitted(ctx,async a=>{
   const snapshots=[],begin=a.beginProviderCall.bind(a);a.beginProviderCall=async x=>{snapshots.push(JSON.stringify(x.input));return begin(x);};
   const result=await interpretAskQuestion({context:ctx,model,client:{responses:{create:async request=>{
    calls++;assert.equal(JSON.stringify(request),snapshots.at(-1));assert.ok(Object.isFrozen(request));
    assert.equal(JSON.stringify(request).length,JSON.stringify(p.request).length);
    return {status:"completed",output_text:JSON.stringify(actualTransportFixturePlan(p).encode({request:proposal(ctx)})),usage};
   }}}});
   assert.deepEqual(result.petIds,["pet-0"]);
  });assert.equal(calls,1);
  console.log(JSON.stringify({kind:"input_budget_measurement",numeric,priorTurns:count,retained:p.context.conversationTurns.length,
   finalCharacters:JSON.stringify(p.request).length,estimatedInput:estimateInputTokens(p.request)}));
 });

test("pinned antecedents survive; conflicting, missing, or unfit mandatory sources fail",()=>{
 const ctx=context(39),old=ctx.conversationTurns[0];old.text="Birch is the subject. 🐾 cafe\u0301";ctx.pinnedUserSourceIds=[old.id];
 const p=prepareAskInterpretationRequest(ctx,model);
 assert.deepEqual(p.context.conversationTurns.find(t=>t.id===old.id),old);assert.ok(p.input.userSources.some(t=>t.id===old.id));
 assert.equal(p.input.conversationSubject,"Birch");
 assert.throws(()=>prepareAskInterpretationRequest({...ctx,pinnedUserSourceIds:["missing"]},model),/source_pin_missing/);
 assert.throws(()=>prepareAskInterpretationRequest({...ctx,conversationTurns:[...ctx.conversationTurns,{...ctx.currentTurn,text:"different"}]},model),/source_identity/);
 const huge=structuredClone(ctx);huge.conversationTurns[0].text="x".repeat(60001);
 assert.throws(()=>prepareAskInterpretationRequest(huge,model),e=>e.reason==="feature_token_budget_exceeded");
 assert.throws(()=>[...askSourceWindows({...ctx,pinnedUserSourceIds:ctx.conversationTurns.slice(0,9).map(t=>t.id)})],e=>e.reason==="feature_token_budget_exceeded");
});

test("exact UTF-16 source quotes and offsets survive windowing without normalization",()=>{
 const ctx=context(8);ctx.currentMessage="For Aster: 🐾 cafe\u0301 was calm. Keep the emoji and combining mark.";
 ctx.currentTurn.text=ctx.currentMessage;ctx.ownerNoteSpans=[{id:"current:0:"+ctx.currentMessage.length,sourceMessageId:"current",start:0,end:ctx.currentMessage.length,text:ctx.currentMessage,role:"source"}];
 const p=prepareAskInterpretationRequest(ctx,model),source=p.input.userSources.find(s=>s.id==="current");
 assert.throws(()=>askUserSourceInput({...p.context,ownerNoteSpans:[{...ctx.ownerNoteSpans[0],end:ctx.currentMessage.length+1}]}),/source_span/);
 assert.equal(source.text,ctx.currentMessage);const quote="cafe\u0301 was calm.",span=bindUserSourceSpan(p.context.currentTurn,quote);
 assert.equal(span.start,ctx.currentMessage.indexOf(quote));assert.equal(span.end,span.start+quote.length);
 assert.equal(source.text.slice(span.start,span.end),quote);
 assert.throws(()=>bindUserSourceSpan(p.context.currentTurn,quote.normalize("NFC")),/append_span/);
});

test("omitted IDs and selected-pet guesses are rejected by the actual Binder, including repair proposals",()=>{
 const ctx=context(39);ctx.currentMessage="What was his last recorded weight?";ctx.currentTurn.text=ctx.currentMessage;ctx.ownerNoteSpans=[];
 const p=prepareAskInterpretationRequest(ctx,model),omitted=ctx.conversationTurns.find(t=>!p.context.conversationTurns.some(x=>x.id===t.id)&&t.id!=="current");
 assert.ok(omitted);const bad=proposal(ctx);bad.referenceTurnIds=[omitted.id];
 assert.throws(()=>actualTransportFixturePlan(p).encode({request:bad}),e=>e.message==="ASK_OPERATION_CANONICAL_SCHEMA");
 const unavailable=recoverAskInterpretation(bad,p.context);assert.match(unavailable.planningRecovery,/REFERENCE/);assert.deepEqual(unavailable.petIds,[]);assert.equal(unavailable.request,undefined);
 const guessed={...proposal(ctx),scope:"selected",petNames:[]};
 assert.throws(()=>recoverAskInterpretation(guessed,p.context),/OMITTED_SUBJECT_REFERENCE/);
 assert.throws(()=>assertAskSourceWindowProposal({version:"ask-catalog-intent.v1",subjects:[{basis:"selected",petName:"Aster",sourceTurnId:"current"}],request:guessed},p.context),/omitted_subject_reference/);
 const clarified={...guessed,mode:"clarify",scope:"none",evidenceBasis:null,profileFields:[],temporalScope:null,operation:"clarify"};
 assert.doesNotThrow(()=>assertAskSourceWindowProposal(clarified,p.context));
});

test("no safe fit causes no SDK invocation and releases unstarted accounting",async t=>{
 quiet(t);
 for(const fixtureKind of ["oversized_current","too_many_mandatory_sources"]){
   const ctx=context(fixtureKind==="too_many_mandatory_sources"?39:0);
   if(fixtureKind==="oversized_current"){ctx.currentMessage="x".repeat(AI_FEATURE_POLICIES.ask.maxInputCharacters+1);ctx.currentTurn.text=ctx.currentMessage;ctx.ownerNoteSpans=[];}
   else ctx.pinnedUserSourceIds=ctx.conversationTurns.slice(0,9).map(source=>source.id);
  let calls=0;const store=new MemoryAiGuardTestStore(),a=await admitAiOperation({env,store,feature:"ask",intendedModel:model,userId:"owner",requestId:crypto.randomUUID(),payload:{},now:new Date("2039-01-01T00:00:00Z")});
  try{await assert.rejects(a.run(()=>interpretAskQuestion({context:ctx,model,client:{responses:{create:async()=>{calls++;throw Error("UNEXPECTED_SDK");}}}})),e=>e.reason==="feature_token_budget_exceeded");}finally{await a.release();}
  assert.equal(calls,0);assert.deepEqual(store.getSnapshot("2039-01-01"),{calls:0,costMicrodollars:0});
 }
});

test("repair uses identical retained sources and real final-request admission",async t=>{
 quiet(t);const ctx=context(0);ctx.currentMessage="What name is saved for Aster?";ctx.currentTurn.text=ctx.currentMessage;ctx.ownerNoteSpans=[];
 ctx.conversationTurns.unshift(turn("pinned","Birch was the earlier subject."));ctx.pinnedUserSourceIds=["pinned"];
 const p=prepareAskInterpretationRequest(ctx,model),good=proposal(ctx),bad={...good,petNames:["Unowned subject"]};
 let calls=0;await admitted(ctx,async a=>{
  const snapshots=[],begin=a.beginProviderCall.bind(a);a.beginProviderCall=async x=>{snapshots.push(JSON.stringify(x.input));return begin(x);};
  const result=await interpretAskQuestion({context:ctx,model,client:{responses:{create:async request=>{
   assert.equal(JSON.stringify(request),snapshots[calls]);const input=JSON.parse(request.input);
   assert.deepEqual(input.userSources,p.input.userSources);assert.deepEqual(input.sourceWindow,p.input.sourceWindow);
   assert.deepEqual(request.text.format.schema,JSON.parse(JSON.stringify(p.request.text.format.schema)));
   const candidate=calls++?good:bad;return {status:"completed",output_text:JSON.stringify(actualTransportFixturePlan(p).encode({request:candidate})),usage};
  }}}});assert.deepEqual(result.petIds,["pet-0"]);assert.equal(snapshots.length,2);
 });assert.equal(calls,2);
});

for(const numeric of [false,true])
test("native semantic repair preserves exact sources; numeric="+numeric+" has the actual admission outcome",async t=>{
 quiet(t);const ctx=context(39,numeric),p=prepareAskInterpretationRequest(ctx,model);
 const requirements=Array.from({length:8},(_,i)=>(i+" extra obligation ").padEnd(240,"x"));
 const bad={...proposal(ctx),excludedPetNames:["Aster"],requirements},good={...proposal(ctx),requirements},before=structuredClone(bad);
 assert.throws(()=>recoverAskInterpretation(bad,p.context),e=>e.category==="semantic"&&e.reason==="ASK_REQUEST_CONTRACT_CONFLICTING_SUBJECTS");
 let calls=0;await admitted(ctx,async a=>{
  const snapshots=[],begin=a.beginProviderCall.bind(a);a.beginProviderCall=async x=>{snapshots.push(JSON.stringify(x.input));return begin(x);};
  const execute=()=>interpretAskQuestion({context:ctx,model,client:{responses:{create:async request=>{
   assert.equal(JSON.stringify(request),snapshots[calls]);
   const input=JSON.parse(request.input);
   assert.deepEqual(input.userSources,p.input.userSources);assert.deepEqual(input.sourceWindow,p.input.sourceWindow);
   assert.deepEqual(request.text.format.schema,JSON.parse(JSON.stringify(p.request.text.format.schema)));
   const candidate=calls++?good:bad;
   return {status:"completed",output_text:JSON.stringify(actualTransportFixturePlan(p).encode({request:candidate})),usage};
  }}}});
  if(numeric)await assert.rejects(execute(),e=>e.reason==="feature_token_budget_exceeded");
  else assert.deepEqual((await execute()).petIds,["pet-0"]);
  assert.equal(snapshots.length,numeric?1:2);
 });assert.equal(calls,numeric?1:2);assert.deepEqual(bad,before);
});

test("catalog hydration cannot replace the chosen current text, prior sources, or owned identities",async t=>{
 quiet(t);const ctx=context(39);ctx.currentMessage="Aster passed away.";ctx.currentTurn.text=ctx.currentMessage;ctx.ownerNoteSpans=[];
 const p=prepareAskInterpretationRequest(ctx,model),request={...proposal(ctx),mode:"update",operation:"general",evidenceBasis:null,temporalScope:null,profileFields:[],outputFormat:null,premiseQuotes:[],
  lifecyclePlan:{pendingDisposition:"keep",transition:{targetPetName:"Aster",toState:"deceased"},requiredSubjectState:null,authorizationQuote:ctx.currentMessage}};
 const intent={version:"ask-catalog-intent.v1",purpose:"lifecycle",scope:"subjects",ownerScope:null,sourceTurnId:"current",instructionQuote:ctx.currentMessage,authorizationQuote:ctx.currentMessage,
  subjects:[{basis:"named",petName:"Aster",sourceTurnId:"current",quote:"Aster"}],request};
 const encodedIntent=actualTransportFixturePlan(p).encode({request:intent});
 let calls=0,hydrates=0;
 await admitted(ctx,async()=>{
  const result=await interpretAskQuestion({context:ctx,model,client:{responses:{create:async()=>{calls++;return {status:"completed",output_text:JSON.stringify(encodedIntent),usage};}}},
   catalogService:{requestId:"snapshot",capability:()=>({available:true}),verify:async()=>{},hydrate:async permit=>{
    hydrates++;beginCatalogHydration(permit);const catalog=sealCatalog(permit,{evidence:{states:[{id:"pet-0",user_id:"owner",lifecycle_status:"active"}],pending:[]}});
    return {catalog,refs:[],context:{...ctx,currentMessage:"Birch is alive.",currentTurn:turn("injected","Birch is alive."),
     conversationTurns:[turn("omitted-injected","Elm is the subject.")],eligiblePets:[pets[1]],pet:pets[1]}};
   }}});
  assert.deepEqual(result.petIds,["pet-0"]);assert.equal(result.request.lifecyclePlan.transition.petId,"pet-0");
  assert.equal(result.sourceWindow.omittedPriorUserTurns,p.context.planningSourceWindow.omittedPriorUserTurns);
 });assert.equal(calls,1);assert.equal(hydrates,1);
});

test("reviewed release input allowance and unchanged output/call ceilings remain enforced",()=>{
 assert.equal(AI_FEATURE_POLICIES.ask.maxInputTokens,45000);assert.equal(AI_FEATURE_POLICIES.ask.maxInputCharacters,135000);
 assert.equal(AI_FEATURE_POLICIES.ask.maxOutputTokens,100000);assert.equal(AI_FEATURE_POLICIES.ask.maximumProviderCalls,6);
 assert.equal(ASK_INTERPRETATION_LIMITS.outputTokens,8192);
});

test("pending antecedents absent from recent rows stay pinned in their earlier position",()=>{
 const ctx=context(0),older=turn("older","Birch was discussed first."),recent=turn("recent","Cedar is the recent subject.");
 const projected=projectAskInterpretationContext({...ctx,conversationTurns:[recent,ctx.currentTurn],pendingTask:{source:older,request:ctx.currentTurn}});
 const chosen=[...askSourceWindows(projected)].at(-1);
 assert.deepEqual(chosen.conversationTurns.map(turn=>turn.id),["older","recent"]);
 assert.ok(chosen.planningSourceWindow.pinnedSourceIds.includes("older"));
 assert.ok(chosen.planningSourceWindow.pinnedSourceIds.includes("current"));
 assert.equal(chosen.currentTurn.text,ctx.currentMessage);
 assert.notEqual(projected.ownerNoteSpans,ctx.ownerNoteSpans);
 ctx.ownerNoteSpans[0].text="changed after snapshot";
 assert.equal(projected.ownerNoteSpans[0].text,chosen.currentTurn.text);
});

test("formerly over-budget numeric-density context now fits without rewriting its 1200 characters",()=>{
 const ctx=context(0),text=Array.from({length:200},(_,i)=>i+" kg").join(" ").slice(0,1200).padEnd(1200,"x");
 ctx.currentMessage=text;ctx.currentTurn.text=text;ctx.ownerNoteSpans=[];
 const p=prepareAskInterpretationRequest(ctx,model);
 assert.ok(askRequestFitsInputBudget(p.request));
 assert.equal(p.input.userSources.find(source=>source.id==="current").text,text);
});

test("unowned native names are preserved but ORIGINAL Binder rejects ownership",()=>{
 const ctx=context(0),p=prepareAskInterpretationRequest(ctx,model),bad={...proposal(ctx),petNames:["Unowned subject"]},before=structuredClone(bad);
 const transport=actualTransportFixturePlan(p);
 assert.deepEqual(transport.decode(transport.encode({request:bad})),{request:bad});
 assert.throws(()=>recoverAskInterpretation(bad,p.context),e=>e.category==="semantic"&&e.reason==="ASK_REQUEST_CONTRACT_OWNERSHIP");
 assert.deepEqual(bad,before);
});
