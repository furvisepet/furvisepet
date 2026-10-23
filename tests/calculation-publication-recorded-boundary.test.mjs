import assert from "node:assert/strict";
import test,{after} from "node:test";
import {writeFileSync,readFileSync,appendFileSync} from "node:fs";
const {database}=await import("../scripts/audits/helpers/lifetime-harness.mjs");
const {ownerId,pets:templates}=await import("../scripts/audits/fixtures/ask-lifetime-history.mjs");
const {buildFurviseContext}=await import("../app/lib/intelligence/retrieve-context.ts");
const {requestProposal}=await import("../scripts/audits/helpers/request-proposal.mjs");
const {prepareAskInterpretationRequest,interpretAskQuestion}=await import("../app/lib/intelligence/interpret-ask.ts");
const {generateAskHistoryAnswer}=await import("../app/lib/intelligence/generate-ask-history.ts");
const {readHistoryReviewDiagnostic}=await import("../app/lib/intelligence/history-review-state.ts");
const {PUBLIC_V1_CAPABILITIES}=await import("../app/lib/public-v1-capabilities.ts");
const {admitAiOperation}=await import("../app/lib/ai/usage-guard/admission.ts");
const {MemoryAiGuardTestStore}=await import("../app/lib/ai/usage-guard/memory-test-store.ts");
const {OperationDeadline}=await import("../app/lib/ai/execution-deadline.ts");
const id=n=>"30000000-0000-4000-8000-"+String(n).padStart(12,"0");
const pets=["Iris","Onyx"].map((name,i)=>({...templates[i],id:id(i+1),name,user_id:ownerId}));
const verified=[],measurements=[],failures=[],traces=[];
const check=(name,kind,fn)=>name.startsWith('FG ')?test(name,async t=>{const began=performance.now();const report=event=>appendFileSync(process.env.FB_REPORT_PATH+".progress.jsonl",JSON.stringify({name,kind,event,at:new Date().toISOString(),elapsedMs:performance.now()-began})+"\n");report("begin");try{t.mock.method(console,"info",()=>{});await fn(t);verified.push({name,kind});report("pass");}catch(e){failures.push({name,stage:e.stage??null,error:e.message,code:e.code??null,diagnostics:e.diagnostics??null});report("failed");throw e;}}):undefined;
after(()=>writeFileSync(process.env.FB_REPORT_PATH,JSON.stringify({verified,failures,measurements,traces,synthetic:true,networkCalls:0,paidCalls:0,publicGate:PUBLIC_V1_CAPABILITIES.calculationExecution},null,2)));
function policy(on=true,owner=ownerId,deploy="preview"){
 process.env.VERCEL_ENV=deploy;process.env.FURVISE_PREVIEW_RECORDED_DIFFERENCE=on?"1":"0";
 process.env.FURVISE_PREVIEW_RECORDED_DIFFERENCE_OWNER_ID=owner;
 process.env.FURVISE_PREVIEW_RECORDED_ANCHOR="1";process.env.FURVISE_PREVIEW_RECORDED_MEASUREMENT="1";
}
policy();
const sourceSeed=JSON.parse(readFileSync(new URL("./fixtures/ask-catalog-proof-seed.json",import.meta.url),"utf8"));
const defaults=JSON.parse(sourceSeed.sent[1].input).intent.request;
const guardEnv={NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",FURVISE_AI_DAILY_COST_LIMIT_USD:"10",FURVISE_RATE_LIMIT_HASH_SECRET:"offline-em-scoped-test-secret-000000000"};
async function admitted(fn,{deadline=new OperationDeadline(90000)}={}){
 const store=new MemoryAiGuardTestStore(),day=new Date().toISOString().slice(0,10);
 const a=await admitAiOperation({env:guardEnv,store,feature:"ask",intendedModel:"gpt-5.4",userId:ownerId,requestId:crypto.randomUUID(),payload:{test:"em"},deadline});
 let outcome;
 try{outcome=await a.run(()=>fn(a,store));await a.complete();return outcome;}
 catch(e){await a.fail(e);throw e;}
 finally{await a.release();assert.equal([...store.calls.values()].some(c=>c.state==="reserved"),false,"No queued reservation may survive terminal fixture");}
}
async function seed({measurement=false,extraRows=[],literal=[],predicateIndexes=[],targetTitle=null,anchor=false,reverse=false,targetUnit='kg',referenceUnit='kg',resultUnit='kg',eventLabel='Baseline examination',target="Recorded mass 9.8 kg.",reference="Recorded mass 10 kg.",subject=0}={}){
 const pet=pets[subject],rows=[reference,target].map((note,i)=>({id:id(100+i),user_id:ownerId,pet_profile_id:pet.id,note,title:null,category:"general",deleted_at:null,occurred_at:"2024-01-0"+(i+1)+"T00:00:00Z",created_at:"2024-01-0"+(i+1)+"T01:00:00Z",updated_at:"2024-01-0"+(i+1)+"T01:00:00Z"}));
 if(anchor)rows[0].title=eventLabel;
 rows[1].occurred_at="2024-01-04T00:00:00Z";rows[1].created_at=rows[1].updated_at="2024-01-04T01:00:00Z";
 if(targetTitle)rows[1].title=targetTitle;
 for(const [i,x]of extraRows.entries())rows.push({...rows[1],id:id(110+i),note:x.note,title:x.title??null,occurred_at:"2024-01-"+String(x.day).padStart(2,"0")+"T00:00:00Z",created_at:"2024-01-"+String(x.day).padStart(2,"0")+"T01:00:00Z",updated_at:"2024-01-"+String(x.day).padStart(2,"0")+"T01:00:00Z"});
 const db=database(rows,{fixturePets:pets,graph:{sourceSemanticsPage:{claims:[],sources:[],targets:[],complete:false,limit:76}}});
 const question="What is the signed change between "+pet.name+"'s two saved measurements? Show the recorded inputs.";
 const context=await buildFurviseContext({supabase:db,userId:ownerId,petId:pet.id,conversationId:null,conversationPetId:null,currentMessage:question});
 context.currentTurn={id:id(800),role:"user",text:question,createdAt:new Date().toISOString()};
 context.currentMessage=question;context.conversationTurns=[];
 const readTicket={authority:"stored_report",subjectScope:"named",operation:"read",episode:null,probes:[],searchHints:[],temporal:{from:null,to:null,anchor:null,calendar:null},predicates:[],selection:{groupBy:["subject"],union:["asc","desc"].map(direction=>({orderBy:[{field:"event_at",direction}],take:{count:1,per:"group"}}))},outputs:{completeness:"sufficient",ordering:"asc",limit:null}};
 if(measurement)readTicket.predicates=[...literal.map(terms=>({kind:"text_any",terms})),{kind:"measurement",unit:targetUnit,predicateIndexes}];
 const plan={operation:"calculate",resultSelection:null,calculations:[{id:"change",operator:"difference",operands:[{kind:"recorded",role:"target",petName:pet.name,clause:1,item:0,unit:"kg"},{kind:"recorded",role:"reference",petName:pet.name,clause:0,item:0,unit:"kg"}],resultUnit:"kg",precision:null}]};
 if(anchor){
  readTicket.operation="read_since_event";readTicket.temporal.anchor={concept:eventLabel,relation:"after"};
  readTicket.selection.union=[{orderBy:[{field:"event_at",direction:"asc"}],take:{count:1,per:"group"}}];
  plan.calculations[0].operands=[{kind:"recorded",role:reverse?"reference":"target",petName:pet.name,clause:0,item:0,unit:targetUnit},
   {kind:"recorded",source:"anchor",role:reverse?"target":"reference",petName:pet.name,unit:referenceUnit}];
  plan.calculations[0].resultUnit=resultUnit;
 }

 const proposal=requestProposal({...structuredClone(defaults),writeJob:null,removeJob:null,stateTransitionJob:null,lifecyclePlan:null,storedRead:null,appendJob:null,fieldMutationJob:null,task:null,recordSelection:null,mutationIntent:null,profileFields:[],temporalScope:"historical",version:"ask-request.v2",mode:"read",question,requirements:[],referenceTurnIds:[],scope:"named",petNames:[pet.name],excludedPetNames:[],operation:"recall",selection:"summary",quantity:"measurement",topic:"measurements",terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:"saved_history",premiseQuotes:[],calculatePlan:plan,readTicket,outputFormat:"prose",projection:null,evidenceNeeds:[]},question);
 const trace={subject:pet.name,stages:["fixture_context"],sourceQueries:[],providerGenerationAttempts:0};traces.push(trace);
 return{pet,rows,db,context,proposal,plan,readTicket,trace};
}
function instrumentSources(f){
 const base=f.db.from.bind(f.db);
 f.db.from=table=>{
  const q=base(table);if(table!=="pet_care_entries")return q;
  const eq=q.eq.bind(q),limit=q.limit.bind(q),then=q.then.bind(q);const filters={};let cap;
  q.eq=(key,value)=>{filters[key]=value;return eq(key,value);};
  q.limit=value=>{cap=value;return limit(value);};
  q.then=(resolve,reject)=>then(result=>{
   if(cap!==2||!filters.id||!filters.user_id||!filters.pet_profile_id)return resolve(result);
   assert.equal(filters.user_id,ownerId);assert.equal(filters.pet_profile_id,f.pet.id);
   const index=f.trace.sourceQueries.length+1;f.trace.sourceQueries.push({index,recordId:filters.id,ownerId:filters.user_id,subjectId:filters.pet_profile_id});
   f.trace.stages.push("authorized_source_reload");
   if(f.sourceError)return resolve({data:null,error:{code:"SYNTHETIC_READ_FAILURE"}});
   const data=result.data.map(row=>f.sourceFault?f.sourceFault(structuredClone(row),index):row);
   return resolve({...result,data});
  },reject);
  return q;
 };
}
async function journey(options={},alter=()=>{}){
 const f=await seed(options);policy();instrumentSources(f);
 return admitted(async(a,store)=>{
  const p=prepareAskInterpretationRequest(f.context,"gpt-5.4");
  const encoded=p.transport.encode({request:f.proposal},()=>{});assert.deepEqual(p.transport.decode(encoded,()=>{}),{request:f.proposal});let dispatches=0;
  const prior=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;
  try{
   f.context.askInterpretation=await interpretAskQuestion({context:f.context,model:"gpt-5.4",client:{responses:{create:async()=>{dispatches++;return{status:"completed",output_text:JSON.stringify(encoded),usage:{input_tokens:50,output_tokens:20}};}}}});
  }finally{if(prior===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=prior;}
  assert.equal(dispatches,1);f.trace.stages.push("original_decoder_binder");
  await alter(f,a,store);
  globalThis.__historyAuditClient={responses:{create:async()=>{f.trace.providerGenerationAttempts++;throw Error("EXTRA_GENERATION_PROVIDER_FORBIDDEN");}}};
  globalThis.__historyAuditAfterGeneration=result=>{f.generatedReasoning=result;f.trace.stages.push("execution:"+result.model);f.afterGeneration?.(result);};
  try{
   const result=await generateAskHistoryAnswer({supabase:f.db,context:f.context,requestId:"en-normal-request",sourceMessageId:f.context.currentTurn.id,authoritativePetIds:[f.pet.id],signal:f.signal,onStage:stage=>f.trace.stages.push(stage)});
   f.trace.stages.push("attributed_publication_returned");
   assert.equal(f.trace.providerGenerationAttempts,0);
   return{...f,...result,store};
  }catch(error){error.routeTrace=f.trace;error.historyDiagnostic=f.generatedReasoning?readHistoryReviewDiagnostic(f.generatedReasoning):null;throw error;}
  finally{globalThis.__historyAuditAfterGeneration=undefined;}
 });
}

check("FG GO original recorded difference normal entry remains proof-bound and attributed","GO-positive",async()=>{
 const f=await journey(),r=f.intelligenceResult.reasoning;
 assert.equal(r.model,"server-calculation-labs");assert.equal(r.calculationLabs.execution.authority,"recorded_contents");
 assert.equal(r.calculationLabs.execution.results[0].value,-0.2);
 assert.equal(f.intelligenceResult.answerValidation.valid,true);
 assert.equal(new Set(r.relevantContextIds).size,2);
 assert.equal(f.trace.providerGenerationAttempts,0);
});
for(const missing of ["absent","null","partial"])check("FG GO recorded-context malformed snapshot "+missing+" is declined before return","GO-negative",async()=>{
 let error;
 try{await journey({},f=>{f.afterGeneration=r=>{
  if(missing==="absent")r.calculationLabs={};
  if(missing==="null")r.calculationLabs={execution:null};
  if(missing==="partial")r.calculationLabs={execution:{}};
 };});}catch(e){error=e;}
 assert.ok(error);assert.ok(!String(error).includes("TypeError"));
 assert.equal(error.message,"FURVISE_ANSWER_VALIDATION_FAILED:unsupported_public_v1,calculation_review_required");
 assert.deepEqual(error.historyDiagnostic,{status:"declined",reason:"unsupported_public_v1"});
 assert.ok(error.routeTrace.stages.includes("execution:server-calculation-labs"));
 assert.equal(error.routeTrace.stages.includes("attributed_publication_returned"),false);
 assert.equal(error.routeTrace.providerGenerationAttempts,0);
});
for(const [name,setup,reason]of[
 ["stale source",f=>{f.sourceFault=(r,n)=>n>=2?{...r,updated_at:"2025-01-01T00:00:00Z"}:r;},"stale_or_changed"],
 ["foreign tenant",f=>{f.sourceFault=r=>({...r,user_id:"foreign"});},"source_scope"],
])check("FG GO recorded source rejection "+name+" remains before publication","GO-negative",async()=>{
 let error;try{await journey({},setup);}catch(e){error=e;}
 assert.ok(error);assert.match(error.message,new RegExp("RECORDED_NUMERIC_PREMISE_INVALID:"+reason));
 assert.equal(error.routeTrace.stages.includes("attributed_publication_returned"),false);
 assert.equal(error.routeTrace.providerGenerationAttempts,0);
});
check("FG GO expired request denies before source use or publication","GO-negative",async()=>{
 let error;try{await journey({},f=>{const controller=new AbortController();controller.abort(Error("controlled cancelled"));f.signal=controller.signal;});}catch(e){error=e;}
 assert.ok(error);assert.match(error.message,/cancelled|abort/i);
 assert.equal(error.routeTrace.stages.includes("attributed_publication_returned"),false);
});
