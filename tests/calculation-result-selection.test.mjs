import {fixtureSemanticsPage} from '../scripts/audits/helpers/source-semantics-fixture.mjs';
import {assert,test,pets,row,rows,rawTicket,slot,calculation,proposal,envelope,fixture,finish,bindCalculatePlan,rebindCalculatePlan,bindTypedReadTicket,
 generateContextAwareAskResponse,calculationPublicationFailure,reviewHistoricalAnswer,validateGeneratedAnswer} from "./helpers/calculation-fixture.mjs";
const cohort=[...pets,{...pets[0],id:"owned-c",name:"Subject Three"},{...pets[0],id:"owned-d",name:"Subject Four"}];
const selection=(direction="desc",count=1,filter=null)=>({filter,orderBy:direction?{direction}:null,take:count===null?null:{count}});
const filter=(comparator,thresholdQuote)=>({comparator,thresholdQuote});
const candidates=(subjects=cohort,operator="convert",unit="kg")=>subjects.map((p,i)=>calculation(operator,
 operator==="convert"?[slot(0,0,p.name,"measurement",unit)]:[slot(0,0,p.name,"measurement",unit),slot(1,0,p.name,"measurement",unit)],
 operator==="percent_change"?"%":operator==="ratio"?"scalar":unit,"c"+i));
async function run({values=["3 kg","7 kg","5 kg","1 kg"],subjects=cohort,resultSelection=selection(),calculations=candidates(subjects),question="Compare the calculated results.",...options}={}){
 const f=await fixture({subjects,calculations,resultSelection,question,sourceRows:subjects.map((p,i)=>row("r"+i,"sample "+values[i],1,p.id)),...options});
 return f;
}
const proof=f=>f.response.calculationLabs.execution.resultSelection;
const ids=f=>proof(f).selectedCalculationIds;
test("argmax certifies every candidate and retains full transitive provenance",async()=>{
 const f=await run();assert.deepEqual(ids(f),["c1"]);assert.equal(proof(f).complete,true);
 assert.deepEqual(proof(f).subjectIds,cohort.map(p=>p.id));
 assert.deepEqual(new Set(f.response.relevantContextIds),new Set(["care:r0","care:r1","care:r2","care:r3"]));
 assert.equal(proof(f).candidates.length,4);assert.equal((await finish(f)).assessment.outcome,"complete");
});
test("argmin is the same order/take composition",async()=>{
 const f=await run({resultSelection:selection("asc")});assert.deepEqual(ids(f),["c3"]);await finish(f);
});
test("full ranking uses exact competition ranks and transport-independent membership",async()=>{
 const f=await run({values:["3 kg","7 kg","7 kg","1 kg"],resultSelection:selection("desc",null)});
 assert.deepEqual(ids(f),["c1","c2","c0","c3"]);assert.deepEqual(proof(f).groups.map(g=>g.rank),[1,3,4]);
 const reversed=await generateContextAwareAskResponse({...f.input,careEntries:[...f.result.records].reverse()});
 assert.deepEqual(reversed.calculationLabs.execution,f.response.calculationLabs.execution);await finish(f);
});
test("take one preserves tied maxima and explicitly renders the tie",async()=>{
 const f=await run({values:["7 kg","7 kg","5 kg","1 kg"]});assert.deepEqual(ids(f),["c0","c1"]);
 assert.match(f.response.answer.summary,/Rank 1 \(tied\)/);await finish(f);
});
test("top two includes every exact cutoff tie",async()=>{
 const f=await run({values:["9 kg","7 kg","7 kg","1 kg"],resultSelection:selection("desc",2)});
 assert.deepEqual(ids(f),["c0","c1","c2"]);assert.deepEqual(proof(f).takeBoundary,{numerator:"7",denominator:"1"});await finish(f);
});
test("bottom two expands a cutoff tie",async()=>{
 const f=await run({values:["1 kg","3 kg","3 kg","9 kg"],resultSelection:selection("asc",2)});
 assert.deepEqual(ids(f),["c0","c1","c2"]);await finish(f);
});
test("rounded displays cannot create an exact tie",async()=>{
 const calculations=candidates();calculations.forEach(c=>c.precision=1);
 const f=await run({values:["1.041 kg","1.049 kg","1 kg","0.9 kg"],calculations});
 assert.deepEqual(ids(f),["c1"]);assert.equal(proof(f).groups[0].calculationIds.length,1);await finish(f);
});
test("different explicit source units can produce an exact tie after normalization",async()=>{
 const f=await run({values:["1 kg","1000 g","500 g","0.2 kg"]});assert.deepEqual(ids(f),["c0","c1"]);await finish(f);
});
for(const [cmp,expected] of [["gt",["c1"]],["gte",["c1","c2"]],["lt",["c0","c3"]],["lte",["c0","c2","c3"]],["eq",["c2"]]]){
 test("source-bound threshold comparator "+cmp,async()=>{
 const f=await run({resultSelection:selection(null,null,filter(cmp,"5 kg")),question:"Use 5 kg."});
 assert.deepEqual(ids(f),expected);assert.deepEqual(proof(f).plan.resultSelection.filter.threshold.exact,{numerator:"5",denominator:"1"});
 await finish(f);
 });
}
test("explicit compatible threshold converts exactly from g to kg",async()=>{
 const f=await run({values:["0.5 kg","0.6 kg","0.4 kg","0.1 kg"],resultSelection:selection(null,null,filter("gte","500 g")),question:"Use 500 g."});
 assert.deepEqual(ids(f),["c0","c1"]);assert.deepEqual(proof(f).plan.resultSelection.filter.threshold.exact,{numerator:"1",denominator:"2"});await finish(f);
});
for(const quote of ["10%","10 percent"]){
 test("explicit percentage threshold "+quote,async()=>{
 const sourceRows=cohort.flatMap((p,i)=>[row("base"+i,"sample 100 kg",1,p.id),row("new"+i,"sample "+[110,111,109,100][i]+" kg",2,p.id)]);
 const f=await run({sourceRows,calculations:candidates(cohort,"percent_change"),resultSelection:selection("desc",null,filter("gte",quote)),question:"Use "+quote+"."});
 assert.deepEqual(ids(f),["c1","c0"]);await finish(f);
 });
}
test("scalar threshold is a bare exact literal",async()=>{
 const sourceRows=cohort.flatMap((p,i)=>[row("base"+i,"sample 2 kg",1,p.id),row("new"+i,"sample "+[2,3,4,5][i]+" kg",2,p.id)]);
 const f=await run({sourceRows,calculations:candidates(cohort,"ratio"),resultSelection:selection(null,null,filter("gt","1.5")),question:"Use 1.5."});
 assert.deepEqual(ids(f),["c2","c3"]);await finish(f);
});
test("filter then order then take uses only survivors",async()=>{
 const f=await run({resultSelection:selection("asc",1,filter("gt","3 kg")),question:"Use 3 kg."});
 assert.deepEqual(ids(f),["c2"]);assert.deepEqual(proof(f).filterSurvivors,["c2","c1"]);await finish(f);
});
for(const [quote,expected] of [["100 kg",[]],["0 kg",["c0","c1","c2","c3"]]]){
 test("complete cohort can certify "+(expected.length?"all matches":"zero matches"),async()=>{
 const f=await run({resultSelection:selection(null,null,filter("gt",quote)),question:"Use "+quote+"."});
 assert.deepEqual(ids(f),expected);assert.equal((await finish(f)).assessment.outcome,"complete");
 assert.equal(f.response.relevantContextIds.length,4);
 if(!expected.length)assert.equal(f.response.answer.summary,"No calculated subject results met the requested threshold.");
 });
}
const ticket=()=>bindTypedReadTicket(rawTicket(),cohort.map(p=>p.id));
const bound=(plan,source={id:"turn",role:"user",text:"Use 500 g."})=>bindCalculatePlan(plan,ticket(),cohort,source);
const proposed=()=>({...proposal(candidates()),resultSelection:selection(null,null,filter("gte","500 g"))});
for(const [name,change] of [
 ["omitted subject",p=>p.calculations.pop()],["duplicate subject",p=>p.calculations[3].operands=p.calculations[0].operands],
 ["cross-subject calculation",p=>{p.calculations[0].operator="sum";p.calculations[0].operands.push(slot(0,0,cohort[1].name));}],
 ["foreign subject",p=>p.calculations[0].operands[0].petName="Unowned"],
 ["different candidate unit",p=>p.calculations[0].resultUnit="g"],
 ["count candidate",p=>{p.calculations[0].operator="count_records";p.calculations[0].operands=[];p.calculations[0].resultUnit="records";}],
 ["invalid comparator",p=>p.resultSelection.filter.comparator="largest"],
 ["invented threshold",p=>p.resultSelection.filter.thresholdQuote="600 g"],
 ["model numeric threshold",p=>p.resultSelection.filter.thresholdValue=500],
 ["zero take",p=>p.resultSelection={...selection("desc",0)}],
 ["negative take",p=>p.resultSelection=selection("desc",-1)],
 ["excessive take",p=>p.resultSelection=selection("desc",5)],
 ["take without order",p=>p.resultSelection=selection(null,1)],
 ["candidate subset",p=>p.resultSelection.candidateIds=["c0"]],
 ["DAG",p=>p.calculations[0].operands=[{resultId:"c1"}]]
])test("Binder rejects "+name,()=>{
 const p=proposed();change(p);assert.throws(()=>bound(p),/ASK_CALCULATE_INVALID|ASK_REQUEST_INVALID:append_span/);
});
for(const text of ["nothing","500 g and 1 kg","5 ml","1e3 g","1,000 g","1/2 kg","NaN kg","Infinity kg","$20","5","10000000000001 kg"]){
 test("threshold rejects ambiguous or incompatible literal "+text,()=>{
 const p=proposed();p.resultSelection.filter.thresholdQuote=text;
 assert.throws(()=>bound(p,{id:"turn",role:"user",text}),/ASK_|nonfinite_or_overflow/);
 });
}
test("threshold requires a unique exact current USER span",()=>{
 const p=proposed();
 for(const source of [undefined,{id:"turn",role:"furvise",text:"Use 500 g."},{id:"turn",role:"user",text:"500 g or 500 g"}]){
 assert.throws(()=>bindCalculatePlan(p,ticket(),cohort,source),/ASK_/);
 }
});
test("trusted JSON rebind preserves the exact bound threshold and source identity",()=>{
 const original=bound(proposed()),copy=JSON.parse(JSON.stringify(original)),t=ticket();
 assert.deepEqual(rebindCalculatePlan(copy,t,original),original);
 assert.throws(()=>rebindCalculatePlan(copy,t),/binding_snapshot/);
 assert.deepEqual(original.resultSelection.filter.threshold.source,{id:"turn:4:9",sourceMessageId:"turn",start:4,end:9,text:"500 g"});
});
for(const [name,change] of [
 ["comparator",p=>p.resultSelection.filter.comparator="lt"],
 ["removed selection",p=>delete p.resultSelection],
 ["null selection",p=>p.resultSelection=null],
 ["quote",p=>p.resultSelection.filter.threshold.source.text="600 g"],
 ["threshold",p=>p.resultSelection.filter.threshold.exact.numerator="6"],
 ["result unit",p=>p.calculations[0].resultUnit="g"],
 ["cohort",p=>p.calculations.pop()]
])test("rebinding rejects changed "+name,()=>{
 const original=bound(proposed()),copy=structuredClone(original);change(copy);
 assert.throws(()=>rebindCalculatePlan(copy,ticket(),original),/binding_snapshot/);
});
test("a limited candidate prevents every ranking claim",async()=>{
 const f=await run({values:["3 kg","7 kg","5 kg and 2 kg","1 kg"]});
 assert.equal(f.response.model,"server-calculation-unavailable");assert.deepEqual(f.response.relevantContextIds,[]);
 assert.equal((await finish(f)).assessment.outcome,"limited");
});
for(const [name,change] of [
 ["ticket",l=>l.readLabs.ticket.subjects.petIds.pop()],
 ["source",l=>l.readLabs.records[0].body="sample 99 kg"],
 ["plan",l=>l.calculatePlan.calculations[0].resultUnit="g"],
 ["exact value",l=>l.execution.results[0].exact.numerator="99"],
 ["selection",l=>l.calculatePlan.resultSelection.orderBy.direction="asc"],
 ["selected IDs",l=>l.execution.resultSelection.selectedCalculationIds=["c0"]],
 ["candidate population",l=>l.execution.resultSelection.candidateIds.pop()],
 ["candidate provenance",l=>l.execution.resultSelection.sourceIds.pop()],
 ["rank",l=>l.execution.resultSelection.groups[0].rank=9]
])test("publication rejects tampered "+name,async()=>{
 const f=await run();assert.equal(await reviewHistoricalAnswer({result:f.response,client:f.client}),true);
 f.response.calculationLabs.calculatePlan=structuredClone(f.response.calculationLabs.calculatePlan);
 change(f.response.calculationLabs);assert.notEqual(calculationPublicationFailure(f.response),null);
 assert.equal(validateGeneratedAnswer(f.response,f.context,"routine",cohort.map(p=>p.id)).valid,false);
 assert.equal(f.calls(),0);
});
test("publication rejects tampered bound threshold snapshot",async()=>{
 const f=await run({resultSelection:selection("desc",1,filter("gt","3 kg")),question:"Use 3 kg."});
 f.response.calculationLabs.calculatePlan=structuredClone(f.response.calculationLabs.calculatePlan);
 f.response.calculationLabs.calculatePlan.resultSelection.filter.threshold.exact.numerator="1";
 assert.notEqual(calculationPublicationFailure(f.response),null);
});
for(const format of [null,"prose","bullets","table"])test("selected results fulfill deterministic "+format,async()=>{
 const f=await run({format});assert.equal(f.response.model,"server-calculation-labs");await finish(f);
 if(format==="table")assert.match(f.response.answer.summary,/^\| Calculation/);
 if(format==="bullets")assert.match(f.response.answer.summary,/^- /);
});
for(const format of ["csv","json"])test("unsupported result presentation "+format+" has no factual provider",async()=>{
 const f=await run({format});assert.equal(f.response.model,"server-calculation-unavailable");await finish(f);
});
test("canonical emergency preempts derived ranking and deletes Labs",async()=>{
 const f=await run();f.context.currentMessage="My pet cannot breathe right now.";
 const v=await finish(f);assert.equal(v.response.model,"server-current-emergency");assert.equal(v.response.calculationLabs,undefined);
 assert.deepEqual(v.response.relevantContextIds,[]);assert.equal(v.assessment.outcome,"limited");
});
test("result selection is a typed exact selector without language/retrieval/model authority",async()=>{
 const fs=await import("node:fs/promises");
 const s=await fs.readFile(new URL("../app/lib/furvise-brain/calculation-result-selection.ts",import.meta.url),"utf8");
 assert.doesNotMatch(s,/currentMessage|question|requestText|readTicket|retrieve|supabase|responses[.]create|parseFloat|Number[(]/);
 const p=await fs.readFile(new URL("../app/lib/intelligence/calculation-labs.ts",import.meta.url),"utf8");
 assert.doesNotMatch(p,/selectCalculationResults|[.]sort[(]|compare[(]/);
});

test("values equal as floating-point numbers still have an exact ordering",async()=>{
 const f=await run({values:["1.0000000000000000000001 kg","1.0000000000000000000002 kg","0 kg","0 kg"]});
 assert.equal(f.response.calculationLabs.execution.results[0].value,f.response.calculationLabs.execution.results[1].value);
 assert.deepEqual(ids(f),["c1"]);await finish(f);
});
test("threshold comparisons retain digits beyond floating-point precision",async()=>{
 const q="1.0000000000000000000001 kg";
 const f=await run({values:[q,"1.0000000000000000000002 kg","0 kg","0 kg"],
 resultSelection:selection(null,null,filter("gt",q)),question:"Use "+q+"."});
 assert.deepEqual(ids(f),["c1"]);await finish(f);
});
test("negative threshold and values retain their explicit signs",async()=>{
 const f=await run({values:["-1 kg","-0.5 kg","0 kg","1 kg"],resultSelection:selection(null,null,filter("lte","-500 g")),question:"Use -500 g."});
 assert.deepEqual(ids(f),["c0","c1"]);await finish(f);
});
test("selection metadata changes neither the read ticket nor operand acquisition",async()=>{
 const withSelection=await run(),without=await run({resultSelection:null});
 assert.deepEqual(withSelection.result.records,without.result.records);
 assert.deepEqual(withSelection.result.coverage,without.result.coverage);
 assert.deepEqual(withSelection.reads,without.reads);
});
test("full ranking includes every subject exactly once independent of candidate order",async()=>{
 const forward=await run({resultSelection:selection("desc",null)});
 const reverse=await run({calculations:candidates().reverse(),resultSelection:selection("desc",null)});
 assert.deepEqual(ids(forward),ids(reverse));assert.equal(new Set(ids(reverse)).size,cohort.length);await finish(reverse);
});
test("a newer unrequested record cannot replace a frozen candidate or winner",async()=>{
 const f=await run(),before=structuredClone(proof(f));
 f.input.careEntries.push(row("later","sample 999 kg",2,cohort[0].id));
 assert.deepEqual(proof(f),before);assert.equal(calculationPublicationFailure(f.response),null);await finish(f);
});
test("untrusted serialized Labs cannot mint a fresh selection snapshot",async()=>{
 const f=await run();f.response.calculationLabs=structuredClone(f.response.calculationLabs);
 assert.notEqual(calculationPublicationFailure(f.response),null);
});
test("requested threshold unit is explicit and currency cannot be inferred",()=>{
 const calculations=candidates(cohort,"ratio"),p={...proposal(calculations),resultSelection:selection(null,null,filter("gt","$20"))};
 assert.throws(()=>bound(p,{id:"turn",role:"user",text:"Use $20."}),/ASK_/);
});
test("provider resultSelection grammar admits only composition and source quote",async()=>{
 const {resultSelectionSchema}=await import("../app/lib/furvise-brain/calculation-result-binding.ts");
 const {default:Ajv}=await import("ajv"),validate=new Ajv({allErrors:true}).compile(resultSelectionSchema);
 assert.equal(validate(selection("desc",2,filter("gte","500 g"))),true);
 for(const patch of [{candidateIds:["c0"]},{winner:"c0"},{thresholdValue:5},{value:5}]){
 assert.equal(validate({...selection(),...patch}),false);
 }
 assert.equal(validate(selection(null,null,{...filter("gt","5 kg"),thresholdValue:5})),false);
});

test("source-bound result selection survives the real Brain and memory path",async()=>{
 const {interpretAskQuestion}=await import("../app/lib/intelligence/interpret-ask.ts");
 const {buildAskBrainTurn}=await import("../app/lib/furvise-brain/ask-runtime.ts");
 const {retrieveFurviseMemory}=await import("../app/lib/furvise-brain/memory-organ.ts");
 const {createAskEvidenceContract}=await import("../app/lib/intelligence/ask-evidence.ts");
 let brainCalls=0,generationCalls=0;const sourceRows=rows();
 const initial={owner:{userId:"owner"},pet:pets[0],eligiblePets:pets,currentMessage:"Calculate from saved observations above 0.2 kg.",
 conversationTurns:[],timeZone:"UTC",currentTurn:{id:"turn",role:"user",text:"Calculate from saved observations above 0.2 kg."},
 careEntries:[],selectedCareEntries:[],memories:[],activeConcerns:[],recentlyResolvedConcerns:[]};
 const interpretation=await interpretAskQuestion({context:initial,model:"fixture",client:{responses:{create:async()=>{
 brainCalls++;return {output_text:JSON.stringify(envelope({...proposal([calculation()]),resultSelection:selection("desc",1,filter("gt","0.2 kg"))},rawTicket()))};}}}});
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
 assert.deepEqual(response.calculationLabs.execution.resultSelection.selectedCalculationIds,["c1"]);
 assert.equal(response.calculationLabs.calculatePlan.resultSelection.filter.threshold.source.sourceMessageId,"turn");
 assert.deepEqual(response.calculationLabs.calculatePlan,interpretation.request.calculatePlan);
 await finish({response,context:read,subjects:[pets[0]],calls:()=>generationCalls});
 assert.equal(brainCalls,1);assert.equal(generationCalls,0);
});

for(const [text,quote] of [["Use 15 kg.","5 kg"],["Use -500 g.","500 g"],["Use 5 mg.","5 m"],["Use 500 grams.","500 g"]]){
 test("threshold source span cannot crop a numeric or unit token: "+text,()=>{
 const p=proposed();p.resultSelection.filter.thresholdQuote=quote;
 assert.throws(()=>bound(p,{id:"turn",role:"user",text}),/ASK_/);
 });
}
test("scalar threshold cannot drop an explicit source unit outside its quote",()=>{
 const p={...proposal(candidates(cohort,"ratio")),resultSelection:selection(null,null,filter("gt","5"))};
 assert.throws(()=>bound(p,{id:"turn",role:"user",text:"Use 5 kg."}),/ASK_/);
});
