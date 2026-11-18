import {fixtureSemanticsPage} from '../scripts/audits/helpers/source-semantics-fixture.mjs';
import {assert,test,bindCalculatePlan,rebindCalculatePlan,calculatePlanSchema,CALCULATE_OPERATORS,bindTypedReadTicket,validateAskRequest,askRequestProviderSchema,generateContextAwareAskResponse,calculationPublicationFailure,reviewHistoricalAnswer,validateGeneratedAnswer,pets,row,rows,clause,rawTicket,slot,calculation,proposal,envelope,fixture,finish} from "./helpers/calculation-fixture.mjs";
test("difference uses certified semantic slots, exact decimal arithmetic and full deterministic finalization",async()=>{
 const f=await fixture();assert.equal(f.response.model,"server-calculation-labs");
 const r=f.response.calculationLabs.execution.results[0];assert.equal(r.value,.3);assert.deepEqual(r.exact,{numerator:"3",denominator:"10"});
 assert.deepEqual(r.operands.map(o=>o.recordId),["last","first"]);assert.deepEqual(r.sourceIds,["care:last","care:first"]);
 assert.equal((await finish(f)).assessment.outcome,"complete");
});
for(const [operator,operands,unit,expected] of [
 ["difference",[slot(0),slot(1)],"g",-300],["absolute_difference",[slot(0),slot(1)],"kg",.3],
 ["percent_change",[slot(0),slot(1)],"%",6.25],["percent_change",[slot(1),slot(0)],"%",-100/17],
 ["ratio",[slot(0),slot(1)],"scalar",1.0625],["percent_of_sum",[slot(0),slot(1)],"%",4800/99],
 ["convert",[slot(0)],"g",4800],["convert",[slot(0)],"lb",4.8*1000/453.59237],
 ["elapsed_days",[slot(0,0,pets[0].name,"event_at",null),slot(1,0,pets[0].name,"event_at",null)],"day",2],
])test(operator+" obeys ordered operands and unit "+unit+" expected "+expected,async()=>{
 const f=await fixture({calculations:[calculation(operator,operands,unit)]});
 assert.equal(f.response.model,"server-calculation-labs");assert.ok(Math.abs(f.response.calculationLabs.execution.results[0].value-expected)<1e-10);
 const v=await finish(f);assert.equal(v.assessment.outcome,"complete");
 if(operator==="elapsed_days"){assert.match(v.response.answer.summary,/Elapsed time between selected events/);assert.doesNotMatch(v.response.answer.summary,/symptom|duration/i);}
});
for(const [operator,value] of [["sum",9.9],["mean",4.95]])test(operator+" uses exactly the requested take-two slots",async()=>{
 const ticket=rawTicket();ticket.selection.union=[clause("asc",2)];
 const f=await fixture({ticket,sourceRows:[...rows(),row("extra","sample 900 kg",4)],calculations:[calculation(operator,[slot(0,0),slot(0,1)])]});
 assert.equal(f.response.calculationLabs.execution.results[0].value,value);assert.deepEqual(f.response.relevantContextIds,["care:first","care:last"]);
 await finish(f);
});
for(const [name,body] of [["none","sample none"],["ambiguous","sample 5 kg and 1 kg"],["unsupported","sample 4 widgets"],
 ["incompatible","sample 4 ml"],["nan","sample NaN kg"],["infinity","sample Infinity kg"],["overflow","sample 10000000000001 kg"],
 ["partial-token","sample 1,000 kg"],["fraction","sample 1/2 kg"]])test("extraction fails source-free: "+name,async()=>{
 const f=await fixture({sourceRows:[row("first",body),row("last","sample 5 kg",3)]});
 assert.equal(f.response.model,"server-calculation-unavailable");assert.deepEqual(f.response.relevantContextIds,[]);
 assert.equal(f.response.calculationLabs,undefined);assert.equal((await finish(f)).assessment.outcome,"limited");
});
test("zero baseline fails without alternate operands",async()=>{
 const f=await fixture({sourceRows:[row("first","sample 0 kg"),row("last","sample 5 kg",3)],calculations:[calculation("percent_change",[slot(0),slot(1)],"%")]});
 assert.equal(f.response.model,"server-calculation-unavailable");await finish(f);
});
for(const format of ["prose","bullets","table",null])test("supported presentation "+format+" preserves authority",async()=>{
 const f=await fixture({format});assert.equal(f.response.model,"server-calculation-labs");await finish(f);
 if(format==="table")assert.match(f.response.answer.summary,/^\| Calculation/);
 if(format==="bullets")assert.match(f.response.answer.summary,/^- /);
});
for(const format of ["csv","json"])test("unsupported format "+format+" never enters a provider",async()=>{
 const f=await fixture({format});assert.equal(f.response.model,"server-calculation-unavailable");assert.equal((await finish(f)).assessment.outcome,"limited");
});
test("invalid internal format fails closed",async()=>{
 const f=await fixture();f.evidence.interpretation.request.outputFormat="compact";
 const r=await generateContextAwareAskResponse(f.input);assert.equal(r.model,"server-calculation-unavailable");assert.equal(f.calls(),0);
});
for(const [name,mutate] of [
 ["result value",p=>p.calculations[0].value=99],["database source",p=>p.calculations[0].operands[0].sourceId="care:row"],
 ["foreign subject",p=>p.calculations[0].operands[0].petName="Foreign"],["clause",p=>p.calculations[0].operands[0].clause=9],
 ["position",p=>p.calculations[0].operands[0].item=2],["operator",p=>p.calculations[0].operator="expression"],
 ["dimension",p=>p.calculations[0].resultUnit="ml"],["mixed dimension",p=>p.calculations[0].operands[0].unit="ml"],
 ["field",p=>p.calculations[0].operands[0].field="body"],["DAG",p=>p.calculations[0].operands[0]={resultId:"other"}],
 ["duplicate id",p=>p.calculations.push(structuredClone(p.calculations[0]))],
 ["precision",p=>p.calculations[0].precision=11],["empty",p=>p.calculations=[]],
 ["unbounded calculations",p=>p.calculations=Array.from({length:21},(_,i)=>({...p.calculations[0],id:"c"+i}))],
])test("binder rejects "+name,()=>{
 const p=proposal([calculation()]);mutate(p);assert.throws(()=>bindCalculatePlan(p,bindTypedReadTicket(rawTicket(),[pets[0].id]),pets),/ASK_CALCULATE_INVALID/);
});
test("canonical calculation plan survives JSON with meaning intact",()=>{
 const ticket=bindTypedReadTicket(rawTicket(),[pets[0].id]),p=bindCalculatePlan(proposal([calculation()]),ticket,pets);
 assert.deepEqual(rebindCalculatePlan(JSON.parse(JSON.stringify(p)),ticket,p),p);
 assert.throws(()=>rebindCalculatePlan(JSON.parse(JSON.stringify(p)),ticket),/binding_snapshot/);
 assert.throws(()=>rebindCalculatePlan({...p,calculations:[{...p.calculations[0],value:5}]},ticket));
});
for(const patch of [{mode:"mixed"},{evidenceBasis:"saved_profile"},{readTicket:null},{writeJob:{}},{storedRead:{}},{frame:{}},{profileFields:["weight"]},{projection:{}},{evidenceNeeds:[{}]}])
 test("request rejects mixed authority "+JSON.stringify(patch),()=>{
 const p={...envelope(proposal([calculation()]),rawTicket()),...patch};
 assert.throws(()=>validateAskRequest(p,{owner:{userId:"owner"},pet:pets[0],eligiblePets:pets,currentMessage:"Calculate from saved observations.",conversationTurns:[]}),/ASK_REQUEST_INVALID/);
});
for(const [name,mutate] of [
 ["source id",l=>l.readLabs.records[0].sourceId="care:other"],["record id",l=>l.readLabs.records[0].id="other"],
 ["value",l=>l.readLabs.records[0].body="sample 800 kg"],["date",l=>l.readLabs.records[0].event_at="2020-01-01T00:00:00Z"],
 ["subject",l=>l.readLabs.records[0].petId=pets[1].id],["certificate",l=>l.readLabs.coverage.groups[0].clauses[0].ids=["other"]],
 ["computed answer",l=>l.execution.results[0].value=900],["missing row",l=>l.readLabs.records.pop()],
 ["extra row",l=>l.readLabs.records.push({...l.readLabs.records[0],id:"extra",sourceId:"care:extra"})],
 ["subject label",l=>l.petNames[pets[0].id]=pets[1].name]
])test("tampered calculation snapshot rejects "+name,async()=>{
 const f=await fixture();assert.equal(await reviewHistoricalAnswer({result:f.response,client:f.client}),true);
 mutate(f.response.calculationLabs);
 assert.notEqual(calculationPublicationFailure(f.response),null);
 assert.equal(validateGeneratedAnswer(f.response,f.context,"routine",[pets[0].id]).valid,false);assert.equal(f.calls(),0);
});
test("transport ordering does not change semantic slots",async()=>{
 const f=await fixture(),before=f.response.calculationLabs.execution;
 const r=await generateContextAwareAskResponse({...f.input,careEntries:[...f.result.records].reverse()});
 assert.deepEqual(r.calculationLabs.execution,before);
});
test("newer row cannot silently replace a frozen operand",async()=>{
 const f=await fixture(),before=structuredClone(f.response.calculationLabs);
 f.input.careEntries.push(row("newer","sample 500 kg",5));
 assert.deepEqual(f.response.calculationLabs,before);assert.equal(calculationPublicationFailure(f.response),null);await finish(f);
});
test("missing transport cannot produce a complete calculation",async()=>{
 const f=await fixture();const r=await generateContextAwareAskResponse({...f.input,careEntries:f.result.records.slice(1)});
 assert.equal(r.model,"server-calculation-unavailable");assert.deepEqual(r.relevantContextIds,[]);
});
test("lineage must close before arithmetic",async()=>{
 const f=await fixture({closed:false});assert.equal(f.response.model,"server-calculation-unavailable");await finish(f);
});
test("independent multi-subject calculations preserve subject/source binding",async()=>{
 const f=await fixture({subjects:pets,sourceRows:[...rows(),row("b-first","sample 2 kg",1,pets[1].id),row("b-last","sample 3 kg",3,pets[1].id)],
 calculations:[calculation(),calculation("difference",[slot(1,0,pets[1].name),slot(0,0,pets[1].name)],"kg","c2")]});
 assert.deepEqual(f.response.calculationLabs.execution.results.map(r=>r.value),[.3,1]);
 assert.deepEqual(f.response.calculationLabs.execution.results[1].sourceIds,["care:b-last","care:b-first"]);await finish(f);
});
for(const size of [0,2])test("count uses a real exhaustive result-set certificate size "+size,async()=>{
 const f=await fixture({sourceRows:rows().slice(0,size),ticket:rawTicket(true),calculations:[calculation("count_records",[],"records")]});
 assert.equal(f.result.coverage.resultSet.certified,true);assert.equal(f.response.calculationLabs.execution.results[0].value,size);
 await finish(f);
});
test("selected subset cannot masquerade as an exhaustive count",()=>{
 assert.throws(()=>bindCalculatePlan(proposal([calculation("count_records",[],"records")]),bindTypedReadTicket(rawTicket(),[pets[0].id]),pets),/exhaustive_count/);
});
test("incomplete result-set cannot authorize a count",async()=>{
 const f=await fixture({closed:false,ticket:rawTicket(true),calculations:[calculation("count_records",[],"records")]});
 assert.equal(f.response.model,"server-calculation-unavailable");await finish(f);
});
test("current emergency preempts calculation without retaining output or calling a provider",async()=>{
 const f=await fixture();f.context.currentMessage="My pet cannot breathe right now.";
 const v=await finish(f);assert.equal(v.response.model,"server-current-emergency");assert.equal(v.response.calculationLabs,undefined);
 assert.deepEqual(v.response.relevantContextIds,[]);assert.equal(v.assessment.outcome,"limited");assert.equal(v.assessment.checks.taskCompletion,"failed");
});
test("calculate schema has no source/result/expression fields and Muscle has no retrieval or language input",async()=>{
 const fs=await import("node:fs/promises"),source=await fs.readFile(new URL("../app/lib/furvise-brain/muscle.ts",import.meta.url),"utf8");
 assert.doesNotMatch(JSON.stringify(calculatePlanSchema),/"(?:value|sourceId|expression|subjectId)"/);
 assert.equal(CALCULATE_OPERATORS.length,10);
 assert.doesNotMatch(source,/currentMessage|requestText|question|responses[.]create|supabase|[.]from[(]|eval[(]/);
 const branches=askRequestProviderSchema({}).properties.request.anyOf;
 const c=branches.find(v=>v.properties.version?.enum?.[0]==="ask-request.v2" && v.properties.calculatePlan?.type==="object");assert.ok(c);
 for(const key of ["frame","writeJob","storedRead","appendJob","projection"])assert.equal(c.properties[key].type,"null");
});

const {calculationEffectiveStore}=await import("./helpers/calculation-effective-store.mjs");
const historyClaim=(id,source,operation="assert",body=source.note)=>({
 id,user_id:"owner",subject_id:source.pet_profile_id,subject_type:"pet",
 structured_value:{note:body,title:null,severity:null},occurred_at:source.occurred_at,
 recorded_at:operation==="assert"?source.occurred_at:"2026-01-01T00:00:00Z",
 operation_type:operation,knowledge_status:"effective",persistence_destination:"history",
 claim_kind:"observation",concept_key:"observation",canonical_concept_key:null,
 concept_resolution_status:"unresolved",provenance_classification:"owner_report"});
test("Muscle receives corrected effective endpoints from the real correction resolver",async()=>{
 const sourceRows=rows(),graph={claims:[historyClaim("old",sourceRows[1]),historyClaim("amended",sourceRows[1],"correct","sample 5.8 kg")],
 edges:[{id:"edge",user_id:"owner",from_claim_id:"amended",to_claim_id:"old",relation_type:"corrects"}],
 links:[{user_id:"owner",claim_id:"old",legacy_row_id:"last",legacy_table:"pet_care_entries",claim_role:"primary"}]};
 const f=await fixture({sourceRows,storeFactory:()=>calculationEffectiveStore(sourceRows,graph,pets.slice(0,1)).store});
 assert.equal(f.response.model,"server-calculation-labs");
 const result=f.response.calculationLabs.execution.results[0];
 assert.equal(result.value,1);assert.deepEqual(result.operands.map(o=>o.recordId),["claim-amended","first"]);
 assert.ok(!result.sourceIds.includes("care:last"));await finish(f);
});
test("tombstoned raw endpoint is never a numeric operand",async()=>{
 const sourceRows=rows();
 const f=await fixture({sourceRows,storeFactory:()=>calculationEffectiveStore(sourceRows,{removedSources:["last"]},pets.slice(0,1)).store});
 assert.equal(f.response.model,"server-calculation-labs");
 assert.equal(f.response.calculationLabs.execution.results[0].value,0);
 assert.deepEqual(f.response.relevantContextIds,["care:first"]);await finish(f);
});
test("exhaustive count follows real replacement and tombstone closure",async()=>{
 const sourceRows=[...rows(),row("removed","sample 8 kg",4)];
 const graph={claims:[historyClaim("old",sourceRows[1]),historyClaim("amended",sourceRows[1],"correct","sample 5.8 kg")],
 edges:[{id:"edge",user_id:"owner",from_claim_id:"amended",to_claim_id:"old",relation_type:"corrects"}],
 links:[{user_id:"owner",claim_id:"old",legacy_row_id:"last",legacy_table:"pet_care_entries",claim_role:"primary"}],
 removedSources:["removed"]};
 const f=await fixture({sourceRows,ticket:rawTicket(true),calculations:[calculation("count_records",[],"records")],
 storeFactory:()=>calculationEffectiveStore(sourceRows,graph,pets.slice(0,1)).store});
 assert.equal(f.result.coverage.resultSet.certified,true);
 assert.equal(f.response.calculationLabs.execution.results[0].value,2);
 assert.deepEqual(new Set(f.response.relevantContextIds),new Set(["care:first","care:claim-amended"]));await finish(f);
});
test("exhaustive count fails closed when certified transport loses a row",async()=>{
 const f=await fixture({ticket:rawTicket(true),calculations:[calculation("count_records",[],"records")]});
 const response=await generateContextAwareAskResponse({...f.input,careEntries:f.result.records.slice(1)});
 assert.equal(response.model,"server-calculation-unavailable");assert.deepEqual(response.relevantContextIds,[]);
});
for(const [body,unit,resultUnit,expected] of [
 ["sample 5000 g","kg","kg",5],["sample 2 l","ml","ml",2000],["sample 2 km","m","m",2000],
 ["sample 90 minutes","hour","hour",1.5],["sample 20 cad","cad","cad",20],
 ["sample \u22125 kg","kg","kg",-5]
])test("generic measurement dimension converts "+body,async()=>{
 const f=await fixture({sourceRows:[row("first",body)],calculations:[calculation("convert",[slot(0,0,pets[0].name,"measurement",unit)],resultUnit)]});
 assert.equal(f.response.model,"server-calculation-labs");assert.equal(f.response.calculationLabs.execution.results[0].value,expected);await finish(f);
});
for(const body of ["sample $20","sample 20 usd"])test("no inferred currency conversion: "+body,async()=>{
 const f=await fixture({sourceRows:[row("first",body)],calculations:[calculation("convert",[slot(0,0,pets[0].name,"measurement","cad")],"cad")]});
 assert.equal(f.response.model,"server-calculation-unavailable");await finish(f);
});

test("one Brain proposal reaches real memory retrieval and deterministic calculation publication",async()=>{
 const {interpretAskQuestion}=await import("../app/lib/intelligence/interpret-ask.ts");
 const {buildAskBrainTurn}=await import("../app/lib/furvise-brain/ask-runtime.ts");
 const {retrieveFurviseMemory}=await import("../app/lib/furvise-brain/memory-organ.ts");
 const {createAskEvidenceContract}=await import("../app/lib/intelligence/ask-evidence.ts");
 let brainCalls=0,generationCalls=0;const sourceRows=rows();
 const initial={owner:{userId:"owner"},pet:pets[0],eligiblePets:pets,currentMessage:"Calculate from saved observations.",
 conversationTurns:[],timeZone:"UTC",currentTurn:{id:"turn",role:"user",text:"Calculate from saved observations."},
 careEntries:[],selectedCareEntries:[],memories:[],activeConcerns:[],recentlyResolvedConcerns:[]};
 const interpretation=await interpretAskQuestion({context:initial,model:"gpt-5.4-mini",client:{responses:{create:async()=>{
 brainCalls++;return {output_text:JSON.stringify(envelope(proposal([calculation()]),rawTicket()))};}}}});
 const planned={...initial,askInterpretation:interpretation};
 const brain=buildAskBrainTurn({context:planned,logicalTurnId:"turn",authoritativePetIds:[pets[0].id]});
 const db={from(table){assert.equal(table,"pet_care_entries");let offset=0,limit=64,ascending=true;
 const q={select(){return q;},eq(){return q;},is(){return q;},gte(){return q;},lt(){return q;},
 order(field,o){if(field==="occurred_at")ascending=o.ascending;return q;},range(a,b){offset=a;limit=b-a+1;return q;},
 abortSignal(){return q;},returns(){return Promise.resolve({data:[...sourceRows].sort((a,b)=>(ascending?1:-1)*(Date.parse(a.occurred_at)-Date.parse(b.occurred_at))).slice(offset,offset+limit),error:null});}};return q;},
 rpc(name,args){if(name==='read_ask_source_semantics')return{abortSignal:async()=>fixtureSemanticsPage(sourceRows,args)};assert.equal(name,"read_ask_history_correction_page");return {abortSignal:async()=>({data:{
 claims:[],relations:[],lineage:[],sources:sourceRows.filter(r=>args.p_care_ids.includes(r.id)),truncated:false},error:null})};}};
 const read=await retrieveFurviseMemory(planned,db,brain);
 assert.deepEqual(read.askInterpretation.request.calculatePlan,interpretation.request.calculatePlan);
 assert.deepEqual(read.askInterpretation.request.readTicket,interpretation.request.readTicket);
 const evidence=createAskEvidenceContract(read,[pets[0].id]);
 const client={responses:{create:async()=>{generationCalls++;throw Error("NO_FACTUAL_PROVIDER");}}};
 const response=await generateContextAwareAskResponse({evidenceContract:evidence,profiles:[pets[0]],careEntries:read.askHistory.entries,
 memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],question:initial.currentMessage,client});
 assert.equal(response.model,"server-calculation-labs");
 assert.equal(response.calculationLabs.execution.results[0].value,.3);
 assert.deepEqual(response.calculationLabs.calculatePlan,interpretation.request.calculatePlan);
 await finish({response,context:read,subjects:[pets[0]],calls:()=>generationCalls});
 assert.equal(brainCalls,1);assert.equal(generationCalls,0);
});
test("count remains unavailable when bounded acquisition has a continuation",async()=>{
 const sourceRows=Array.from({length:1100},(_,i)=>({...row("r"+i,"sample 1 kg"),occurred_at:new Date(Date.UTC(2024,0,1,0,i)).toISOString()}));
 const f=await fixture({sourceRows,ticket:rawTicket(true),calculations:[calculation("count_records",[],"records")]});
 assert.equal(f.result.coverage.resultSet.certified,false);
 assert.equal(f.response.model,"server-calculation-unavailable");assert.deepEqual(f.response.relevantContextIds,[]);await finish(f);
});
test("one ambiguous operand prevents a false complete sum and mean",async()=>{
 const ticket=rawTicket();ticket.selection.union=[clause("asc",2)];
 for(const operator of ["sum","mean"]){
 const f=await fixture({ticket,sourceRows:[row("first","sample 2 kg"),row("last","sample 5 kg and 1 kg",3)],
 calculations:[calculation(operator,[slot(0,0),slot(0,1)])]});
 assert.equal(f.response.model,"server-calculation-unavailable");await finish(f);
 }
});
test("one unavailable calculation prevents publication of a partial requested bundle",async()=>{
 const f=await fixture({sourceRows:[row("first","sample 0 kg"),row("last","sample 5 kg",3)],
 calculations:[calculation(),calculation("percent_change",[slot(0),slot(1)],"%","c2")]});
 assert.equal(f.response.model,"server-calculation-unavailable");assert.deepEqual(f.response.relevantContextIds,[]);await finish(f);
});
for(const [name,mutate] of [
 ["text",r=>r.answer.summary+=" A factual assertion."],["sources",r=>r.relevantContextIds.push("care:other")],
 ["action",r=>r.applicationActions.push({type:"mutation"})],["reference",r=>r.referencedRecords.push({id:"care:other"})]
])test("source-free calculation limitation rejects injected "+name,async()=>{
 const f=await fixture({format:"csv"});assert.equal(await reviewHistoricalAnswer({result:f.response,client:f.client}),true);
 mutate(f.response);assert.notEqual(calculationPublicationFailure(f.response),null);
 assert.equal(validateGeneratedAnswer(f.response,f.context,"routine",[pets[0].id]).valid,false);
 assert.equal(f.calls(),0);
});

test('bounded interval certifies opposite endpoints across interior and outside measurements',async()=>{
 const ticket=rawTicket();ticket.temporal={from:'2024-01-01T00:00:00Z',to:'2024-01-04T00:00:00Z',anchor:null};
 const f=await fixture({ticket,sourceRows:[row('before','sample 1 kg',0),row('begin','sample 4 kg',1),row('interior','sample 7 kg',2),row('end','sample 9 kg',3),row('outside','sample 20 kg',4)],calculations:[calculation('difference',[slot(1),slot(0)])]});
 assert.deepEqual(f.result.records.map(r=>r.id).sort(),['begin','end']);
 assert.deepEqual(f.result.coverage.groups[0].clauses.map(c=>c.ids),[['begin'],['end']]);assert.ok(f.result.coverage.groups[0].clauses.every(c=>c.certified));
 const execution=f.response.calculationLabs.execution,r=execution.results[0];assert.equal(execution.complete,true);
 assert.deepEqual(r.operands.map(o=>o.recordId),['end','begin']);assert.deepEqual(r.exact,{numerator:'5',denominator:'1'});
 assert.equal((await finish(f)).assessment.outcome,'complete');assert.equal(f.calls(),0);
});

test('duplicate-clause Brain proposal fails once before any completed answer assessment',async()=>{
 const {interpretAskQuestion}=await import('../app/lib/intelligence/interpret-ask.ts');
 const {assessTaskExecution}=await import('../app/lib/intelligence/task-execution-contract.ts');
 const ticket=rawTicket();ticket.selection.union=[clause('asc'),clause('asc')];
 const p=envelope(proposal([calculation()]),ticket);let calls=0;
 const context={owner:{userId:'owner'},pet:pets[0],eligiblePets:pets,currentMessage:p.question,conversationTurns:[],timeZone:'UTC',currentTurn:{id:'turn',role:'user',text:p.question}};
 await assert.rejects(interpretAskQuestion({context,model:'gpt-5.4-mini',client:{responses:{create:async()=>{calls++;return {output_text:JSON.stringify(p)};}}}}),e=>e.stage==='interpretation_failed'&&/READ_TICKET|VALIDATION/.test(e.diagnostics.providerErrorCode));
 assert.equal(calls,1);
 const disposition=assessTaskExecution({assessment:null,completion:[],responseMode:'answer',actions:[],careWriteRequired:false,careReceipt:{status:'skipped',careEntryIds:[]}});
 assert.notEqual(disposition.taskOutcome,'complete');assert.notEqual(disposition.answerOutcome,'complete');assert.equal(disposition.creditDisposition,'release');
});

test("catalog intent remains a separate source-free provider branch",()=>{const branches=askRequestProviderSchema({}).properties.request.anyOf;const catalog=branches.filter(v=>v.properties.version?.enum?.[0]==="ask-catalog-intent.v1");assert.equal(catalog.length,1);assert.ok(catalog[0].properties.request);assert.equal(catalog[0].properties.calculatePlan,undefined);});
