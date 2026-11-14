import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {recoverAnnualComparison} from "../app/lib/ask-read-only/annual-comparison.mjs";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
const pets=[{id:"private-maple-owned",ownerId:"owner",name:"Maple",species:"dog",handle:"p1"},{id:"private-juniper-owned",ownerId:"owner",name:"Juniper",species:"cat",handle:"p2"}];
const safety=()=>({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]});
const args=(pet,year)=>({pet,from:year+"-01-01",to:year+"-12-31",recordedFrom:null,recordedTo:null,goal:"comparison",alternatives:[],orderBy:"event",order:"asc",query:null,offset:0});
const dates=y=>[{eventAt:y+"-01-15T12:00:00Z",recordedAt:y+"-01-16T12:00:00Z"},{eventAt:y+"-12-15T12:00:00Z",recordedAt:y+"-12-16T12:00:00Z"}];
const ref=(pet,i)=>({reference:"r"+i,petHandle:pet.handle,pet:pet.name,kind:"history",goal:"complete_set",from:"2024-01-01",to:"2024-12-31",recordedFrom:null,recordedTo:null,orderBy:"event",timeZone:"UTC",sourceCount:2,sourceDates:dates("2024"),selectionLimited:false,discoveryIncomplete:false,omittedRange:null,omittedEventRange:null});
const task=(id,pet,patch={})=>({id,kind:"calculation",combineHistory:false,needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,recordMode:"single",workflow:"none",pets:[pet],reference:null,missing:[],...patch});
function fixture(){
 const context={question:"For Juniper use 2023, not 2024, but leave Maple's 2024 comparison unchanged.",pets:[...pets],references:pets.map((p,i)=>ref(p,i+1)),timeZone:"UTC"};
 const plan=[task("t1","p2",{missing:["pet","date_meaning"]}),task("t2","p1",{needsHistory:false,recordMode:"none"})];
 const first={calls:[{id:"new",name:"search_saved_records",arguments:JSON.stringify(args("p2","2023"))}],text:"Old numbers are not authority.",safety:safety(),historyIntent:{requested:true,timeBasis:"event",pet:"p2"},workflowIntent:"none"};
 let bindings=0;
 const bind=(name,a)=>{bindings++;if(name==="search_saved_records"){const pet=pets.find(p=>p.handle===a.pet);if(!pet)throw Error("FOREIGN");return {kind:"history",...a,pet};}const r=context.references.find(r=>r.reference===a.reference);if(!r)throw Error("FORGED");return {...r,kind:"history",pet:pets.find(p=>p.handle===r.petHandle),reference:r.reference};};
 return {context,plan,first,bind,get bindings(){return bindings;}};
}
test("explicit per-pet annual correction plans fresh IO and independently rehydrates unchanged operands",()=>{
 const f=fixture(),r=recoverAnnualComparison(f.first,f.plan,f.context,f.bind);assert.ok(r);assert.equal(r.first.calls.length,2);assert.equal(f.bindings,3);
 assert.deepEqual(JSON.parse(r.first.calls[0].arguments),args("p2","2023"));
 assert.equal(r.first.calls[1].name,"read_referenced_sources");assert.equal(JSON.parse(r.first.calls[1].arguments).reference,"r1");
 assert.equal(r.plan[1].needsHistory,true);assert.equal(r.plan[1].reference,"r1");assert.ok(r.plan.every(t=>t.recordMode==="collection"&&!t.missing.length));assert.equal(r.first.text,"");
});
for(const [name,change]of [
 ["missing explicit year",f=>f.context.question="Use 2023 for Juniper, not 2024, but leave Maple unchanged."],
 ["two positive target years",f=>f.context.question="Use 2023 and 2022 for Juniper; keep Maple at 2024."],
 ["monthly scope",f=>f.context.question="Use May 2023 for Juniper; keep Maple at 2024."],
 ["relative scope",f=>f.context.question="Use last year for Juniper; keep Maple at 2024."],
 ["missing named pet",f=>f.context.question="Use 2023 for her; keep Maple at 2024."],
 ["multiple same pet mentions",f=>f.context.question+=" Juniper again."],
 ["competing references",f=>f.context.references.push({...f.context.references[1],reference:"r3"})],
 ["omitted interval",f=>f.context.references[1].omittedRange={from:"2024-09-01",to:"2024-12-31"}],
 ["limited source selection",f=>f.context.references[0].selectionLimited=true],
 ["missing January operand",f=>f.context.references[0].sourceDates=[dates("2024")[1]]],
 ["incomplete discovery",f=>f.context.references[0].discoveryIncomplete=true],
 ["different time axes",f=>f.context.references[1].orderBy="recorded"],
 ["foreign task pet",f=>f.plan[0].pets=["p99"]],
 ["other task",f=>f.plan[0].kind="vet_brief"],
 ["owner facts",f=>f.plan[0].needsOwnerFacts=true],
 ["medicine authority",f=>f.first.safety.medicationIntent="decision"],
 ["current emergency",f=>f.first.safety.currentEvents=[{}]],
 ["future emergency",f=>f.first.safety.conditionalEvents=[{}]],
 ["missing prescription",f=>f.first.safety.missingContext=["medicine"]],
 ["extra planned read",f=>f.first.calls.push(f.first.calls[0],f.first.calls[0])],
 ["malformed original call ID",f=>f.first.calls[0].id=null],
 ["duplicate original call IDs",f=>f.first.calls.push({...f.first.calls[0]})],
 ["continuation cannot be retargeted",f=>f.first.calls[0].name="read_remaining_records"],
 ["neither side changed",f=>f.context.question="Juniper 2024 and Maple 2024 unchanged."],
 ["both sides changed",f=>f.context.question="Juniper 2023 and Maple 2023."],
 ["different timezone",f=>f.context.timeZone="America/Vancouver"]
])test("annual recovery rejects "+name,()=>{const f=fixture();change(f);assert.equal(recoverAnnualComparison(f.first,f.plan,f.context,f.bind),null);});
test("an original foreign or forged read is not laundered by valid correction wording",()=>{
 for(const patch of [{name:"search_saved_records",arguments:JSON.stringify(args("p99","2023"))},{name:"read_referenced_sources",arguments:'{"reference":"forged"}'}]){
  const f=fixture();f.first.calls=[{id:"x",...patch}];assert.throws(()=>recoverAnnualComparison(f.first,f.plan,f.context,f.bind),/FOREIGN|FORGED/);
 }
});
test("recorded-year comparisons keep recorded bounds instead of substituting events",()=>{
 const f=fixture();f.first.historyIntent.timeBasis="recorded";
 for(const r of f.context.references){r.orderBy="recorded";r.recordedFrom=r.from;r.recordedTo=r.to;r.from=null;r.to=null;}
 const a=args("p2","2023");a.orderBy="recorded";a.recordedFrom=a.from;a.recordedTo=a.to;a.from=null;a.to=null;f.first.calls[0].arguments=JSON.stringify(a);
 const r=recoverAnnualComparison(f.first,f.plan,f.context,f.bind);assert.ok(r);assert.deepEqual(JSON.parse(r.first.calls[0].arguments),a);
});
const source=(pet,year,month,value)=>({kind:"history",id:"private-"+pet.name+"-"+year+"-"+month,ownerId:"owner",petId:pet.id,body:pet.name+" weighed "+value+" kg.",eventAt:year+"-"+month+"-15T12:00:00Z",recordedAt:year+"-"+month+"-16T12:00:00Z"});
const maple=[source(pets[0],"2024","01",10),source(pets[0],"2024","12",11)],oldJuniper=[source(pets[1],"2024","01",5),source(pets[1],"2024","12",6)],newJuniper=[source(pets[1],"2023","01",4),source(pets[1],"2023","12",4.5)];
const packet={version:1,entries:[maple,oldJuniper].map(rows=>({kind:"history",petId:rows[0].petId,timeZone:"UTC",goal:"complete_set",from:"2024-01-01",to:"2024-12-31",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],limited:false,sources:rows.map(r=>({id:r.id,hash:createHash("sha256").update(r.body).digest("hex"),eventAt:r.eventAt,recordedAt:r.recordedAt}))}))};
async function execute(stale=false,misassigned=false){
 const f=fixture(),reads=[];let calls=0;if(misassigned){f.plan[0].reference="r1";f.plan[1]={...f.plan[1],needsHistory:true,recordMode:"collection",reference:"r2"};}
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets,readReferences:packet,dialogue:[{role:"assistant",text:"Untrusted earlier prose says Maple gained 999 kg."}],question:f.context.question,now:"2026-11-14T00:00:00Z",timeZone:"UTC"},{
  provider:async(req,phase)=>{calls++;
   if(phase==="read_selection")return decodeComponentSelection({safety:safety(),reads:[{name:"search_saved_records",arguments:args("p2","2023")}],draft:"Reuse 999 kg.",historyIntent:{requested:true,timeBasis:"event",pet:"p2"},workflowIntent:"none",taskPlan:f.plan},req.tools,req.context,decodeClinicalSelection);
   const catalog=req.SOURCE_CATALOG,calculations=[];
   for(const name of ["Maple","Juniper"]){const rows=catalog.filter(r=>r.pet===name).sort((a,b)=>a.eventAt.localeCompare(b.eventAt));if(rows.length===2)for(const operation of ["difference","percent_change"])calculations.push({operation,operands:rows.map(r=>r.measurements[0].handle)});}
   return {components:[{kind:"general",text:"Compare verified historical measurements.",sources:[]}],quotes:[],sources:catalog.map(r=>r.source),calculations,replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety(),ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:req.context.taskPlan.map(t=>({task:t.id,status:"complete",reason:"none",componentIndexes:[],sources:catalog.filter(r=>r.pet===req.context.pets.find(p=>p.handle===t.pets[0]).name).map(r=>r.source),ownerFacts:[],historyFacts:[]}))};
  },
  read:async r=>{reads.push(r);let rows;if(r.pet.id===pets[1].id&&r.from==="2023-01-01")rows=newJuniper;else if(r.pet.id===pets[0].id&&r.expectedSources)rows=stale?[{...maple[0],body:"Maple weighed 999 kg."},maple[1]]:maple;else throw Error("UNEXPECTED_READ");return {sources:rows,total:rows.length,hasMore:false,scopeExhausted:true};}
 });
 return {result,reads,calls};
}
test("actual two-call core reads changed year plus owner-bound unchanged records and recomputes labeled math",async()=>{
 const r=await execute();assert.equal(r.calls,2);assert.equal(r.reads.length,2);
 assert.deepEqual(r.reads.map(r=>r.pet.id).sort(),pets.map(p=>p.id).sort());
 assert.deepEqual(r.result.answer.calculations.map(c=>c.value),[1,10,.5,12.5]);
 assert.ok(r.result.answer.taskCompletion.every(t=>t.status==="complete"));
 assert.doesNotMatch(r.result.answer.answer,/Which pet|save date|999/);
 assert.match(r.result.answer.calculations.map(c=>c.text).join("\n"),/Maple/);
 assert.match(r.result.answer.calculations.map(c=>c.text).join("\n"),/Juniper/);
});
test("stale unchanged operands cannot pass as current verified arithmetic",async()=>{
 try{const r=await execute(true);assert.ok(r.result.answer.taskCompletion.some(t=>t.status!=="complete"));assert.ok(!r.result.answer.calculations.some(c=>c.available&&c.value===989));}
 catch(e){assert.match(e.code??e.message,/ASK_READ_REFERENCE|ASK_READ_SOURCE|ASK_READ_COMPONENT|ASK_READ_CALC/);}
});

const {checkReferencedSources}=await import("../app/lib/ask-read-only/references.mjs");
test("duplicate retained rows cannot mask a missing signed operand",()=>{
 const r=checkReferencedSources({sources:[maple[0],maple[0]],hasMore:false},{expectedSources:packet.entries[0].sources});
 assert.equal(r.staleReference,true);assert.deepEqual(r.sources,[]);assert.equal(r.inspected,1);
});

test("actual two-call annual correction reconciles known cross-assigned task hints before strict IO validation",async()=>{
 const r=await execute(false,true);
 assert.equal(r.calls,2);assert.equal(r.reads.length,2);
 assert.deepEqual(r.result.answer.calculations.map(c=>c.value),[1,10,.5,12.5]);
 assert.ok(r.result.answer.taskCompletion.every(t=>t.status==="complete"));
 assert.equal(r.reads.find(x=>x.pet.id===pets[1].id).from,"2023-01-01");
 assert.equal(r.reads.find(x=>x.pet.id===pets[0].id).reference,"r1");
});
test("known reference identity remains distinct from corrected annual task membership",()=>{
 const f=fixture();f.plan[0].reference="r1";f.plan[1].reference="r2";
 const r=recoverAnnualComparison(f.first,f.plan,f.context,f.bind);assert.ok(r);
 assert.equal(r.plan[0].reference,null);assert.equal(r.plan[1].reference,"r1");
});
test("a third known owned pet hint cannot be laundered into a two-pet correction",()=>{
 const f=fixture();f.context.pets.push({id:"third",ownerId:"owner",name:"Birch",handle:"p3"});f.context.references.push({...ref(f.context.pets[2],3)});
 f.plan[0].reference="r3";assert.equal(recoverAnnualComparison(f.first,f.plan,f.context,f.bind),null);
});

for(const [label,patch] of [
 ["unmatched annual wording",f=>f.context.question="For Juniper use May 2023; keep Maple's 2024 side."],
 ["clinical authority",f=>f.firstSafety={...safety(),medicationIntent:"decision"}],
 ["third-pet reference",f=>f.third=true]
])test("deferred known task membership still rejects before IO: "+label,async()=>{
 const f=fixture();patch(f);let reads=0,physical=0;
 const extra=f.third?[{...pets[0],id:"third-private",handle:"p3",name:"Birch"}]:[];
 const refs=f.third?{version:1,entries:[...packet.entries,{...packet.entries[0],petId:"third-private"}]}:packet;
 await assert.rejects(()=>runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets:[...pets,...extra],question:f.context.question,dialogue:[],readReferences:refs,now:"2026-11-14T00:00:00Z",timeZone:"UTC"},{
 provider:async(req,phase)=>{physical++;assert.equal(phase,"read_selection");const plan=[task("t1","p2",{reference:f.third?"r3":"r1"}),task("t2","p1",{reference:"r2"})];return decodeComponentSelection({safety:f.firstSafety??safety(),reads:[],draft:"",historyIntent:{requested:true,timeBasis:"event",pet:null},workflowIntent:"none",taskPlan:plan},req.tools,req.context,decodeClinicalSelection);},
 read:async()=>{reads++;throw Error("FORBIDDEN_READ");}
 }),/ASK_READ_COMPONENT_CONTRACT/);
 assert.equal(reads,0);assert.equal(physical,1);
});

test("actual initial two-pet annual calculation reads survive a redundant date-axis flag",async()=>{
 let physical=0,reads=0;const events=[];
 const all=[...maple,...oldJuniper];
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets,readReferences:{version:1,entries:[]},dialogue:[],question:"For Maple during 2024 and Juniper during 2024, compare each pet's January weight with its December weight in kilograms and percent.",now:"2026-11-14T00:00:00Z",timeZone:"UTC"},{
 onAnswerBoundary:e=>events.push(e),
 provider:async(req,phase)=>{physical++;
  if(phase==="read_selection")return decodeComponentSelection({safety:safety(),reads:pets.map(p=>({name:"search_saved_records",arguments:args(p.handle,"2024")})),draft:"Which date axis?",historyIntent:{requested:true,timeBasis:"event",pet:null},workflowIntent:"none",taskPlan:[task("t1","p1",{pets:["p1","p2"],recordMode:"collection",missing:["date_meaning"]})]},req.tools,req.context,decodeClinicalSelection);
  assert.equal(req.SOURCE_CATALOG.length,4,"legitimate planned reads must reach acquisition");
  const calculations=[];for(const name of ["Maple","Juniper"]){const rows=req.SOURCE_CATALOG.filter(r=>r.pet===name).sort((a,b)=>a.eventAt.localeCompare(b.eventAt));for(const operation of ["difference","percent_change"])calculations.push({operation,operands:rows.map(r=>r.measurements[0].handle)});}
  return {components:[{kind:"general",text:"Verified historical comparisons.",sources:[]}],quotes:[],sources:req.SOURCE_CATALOG.map(r=>r.source),calculations,replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety(),ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[],sources:req.SOURCE_CATALOG.map(r=>r.source),ownerFacts:[],historyFacts:[]}]};
 },
 read:async r=>{reads++;const sources=all.filter(s=>s.petId===r.pet.id);return {sources,total:sources.length,hasMore:false,scopeExhausted:true};}
 });
 assert.equal(physical,2);assert.equal(reads,2);
 assert.deepEqual(result.answer.calculations.map(c=>c.value),[1,10,1,20]);
 assert.doesNotMatch(result.answer.answer,/event date or.*save date|Which date axis/i);
 assert.ok(events.some(e=>e.outcome==="calculation_date_scope_reconciled"));
});

const {reconcilePlannedAnnualCalculation}=await import("../app/lib/ask-read-only/annual-comparison.mjs");
function plannedFixture(){
 const context={question:"For Maple during 2024 and Juniper during 2023, compare January weight with December weight.",pets};
 const first={historyIntent:{requested:true,timeBasis:"event",pet:null},safety:safety()};
 const plan=[task("t1","p1",{pets:["p1","p2"],recordMode:"collection",missing:["date_meaning"]})];
 const bound=pets.map((p,i)=>({name:"search_saved_records",request:{kind:"history",...args(p.handle,i?"2023":"2024"),pet:p,terms:[]}}));
 return {first,plan,context,bound};
}
test("planned comparison scope resolves only date flag without adding or changing a read",()=>{
 const f=plannedFixture(),before=structuredClone(f.bound),r=reconcilePlannedAnnualCalculation(f.first,f.plan,f.context,f.bound);
 assert.ok(r);assert.deepEqual(r.plan[0].missing,[]);assert.deepEqual(f.bound,before);assert.equal(r.diagnostic.grantsAdditionalReads,false);
});
for(const [name,change]of [
 ["ambiguous axis",f=>f.first.historyIntent.timeBasis="ambiguous"],
 ["missing year",f=>f.plan[0].missing.push("year")],
 ["missing medicine",f=>f.first.safety.missingContext=["medicine"]],
 ["medication decision",f=>f.first.safety.medicationIntent="decision"],
 ["current event",f=>f.first.safety.currentEvents=[{}]],
 ["conditional event",f=>f.first.safety.conditionalEvents=[{}]],
 ["clinical task",f=>f.plan[0].kind="clinical_guidance"],
 ["independent ordinary task",f=>f.plan.push(task("t2","p1",{kind:"general_guidance",needsHistory:false,recordMode:"none"}))],
 ["owner facts",f=>f.plan[0].needsOwnerFacts=true],
 ["unknown task pet",f=>f.plan[0].pets=["p1","p99"]],
 ["a reference",f=>f.plan[0].reference="r1"],
 ["foreign bound pet",f=>f.bound[0].request.pet={...pets[0],handle:"p99"}],
 ["mismatched year",f=>f.bound[1].request.from="2022-01-01"],
 ["month scope",f=>f.bound[1].request.to="2023-01-31"],
 ["saved/event conflict",f=>f.context.question="For Maple recorded in 2024 and Juniper recorded in 2023, compare January with December."],
 ["missing December",f=>f.context.question="For Maple during2024 and Juniper during2023, compare January weights."],
 ["hypothetical",f=>f.context.question="If "+f.context.question],
 ["text-filtered search",f=>f.bound[0].request.terms=["growth"]],
 ["continuation",f=>f.bound[0].request.continuation={}],
 ["extra read",f=>f.bound.push(f.bound[0])],
 ["duplicate side",f=>f.bound[1].request.pet=pets[0]]
])test("planned comparison date flag stays unresolved for "+name,()=>{const f=plannedFixture();change(f);assert.equal(reconcilePlannedAnnualCalculation(f.first,f.plan,f.context,f.bound),null);});

test("recorded planned comparisons need an explicit owner saved-date instruction",()=>{
 const f=plannedFixture();f.first.historyIntent.timeBasis="recorded";
 for(const c of f.bound){c.request.orderBy="recorded";c.request.recordedFrom=c.request.from;c.request.recordedTo=c.request.to;c.request.from=null;c.request.to=null;}
 assert.equal(reconcilePlannedAnnualCalculation(f.first,f.plan,f.context,f.bound),null);
 f.context.question="For Maple recorded in 2024 and Juniper recorded in 2023, compare January weights with December weights.";
 assert.ok(reconcilePlannedAnnualCalculation(f.first,f.plan,f.context,f.bound));
});
