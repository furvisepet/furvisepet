import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
import {decodeClinicalSelection,reviewClinicalAnswer,renderMedicationDecision,concernSentenceCatalog} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {buildReadOnlyProviderRequest} from "../app/lib/ask-read-only/provider-request.mjs";
import {compileMeasurementRequests,resolveMeasurementRequests} from "../app/lib/ask-read-only/measurement-requests.mjs";
const pets=[{id:"owned-pet-one",ownerId:"owner",name:"Juniper",species:"dog"},{id:"owned-pet-two",ownerId:"owner",name:"Moss",species:"cat"}];
const safety={medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]};
const task=(pets=["p1"])=>({id:"t1",kind:"calculation",needsHistory:true,needsOwnerFacts:false,includeSourceDates:true,recordMode:"single",workflow:"none",pets,reference:null,missing:["which_record"]});
const endpoint=(from,to)=>({from,to,reference:null});
const request=(extra={})=>({task:"t1",pet:"p1",metric:"body_weight",operation:"difference",timeBasis:"event",start:endpoint("2022-02-01","2022-02-28"),finish:endpoint("2022-11-01","2022-11-30"),...extra});
const row=(pet,value,month,id)=>({kind:"history",id,ownerId:"owner",petId:pet.id,body:pet.name+" weighed "+value+" kg.",eventAt:"2022-"+month+"-15T12:00:00Z",recordedAt:"2022-"+month+"-16T12:00:00Z"});
const rows=[row(pets[0],20,"02","j-start"),row(pets[0],22,"11","j-end"),row(pets[1],4,"02","m-start"),row(pets[1],3.5,"11","m-end")];
const final=(req)=>({components:[{kind:"saved",text:"These original measurements are historical reports.",sources:req.SOURCE_CATALOG.map(s=>s.source)}],quotes:[],sources:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:req.context.taskPlan.map(t=>({task:t.id,status:"unresolved",reason:"not_answered",componentIndexes:[],sources:[],ownerFacts:[],historyFacts:[]}))});
async function execute(measurementRequests,extra={},readRows=rows){
 const reads=[],phases=[],events=[];
 const input={ownerId:"owner",selectedPetId:pets[1].id,pets,dialogue:[],question:"Compare Juniper and Moss using each pet's February to November 2022 saved body weights.",now:"2026-11-15T12:00:00Z",timeZone:"UTC",...extra};
 const result=await runReadOnlyAsk(input,{
  provider:async(req,phase)=>{phases.push(phase);return phase==="read_selection"?decodeComponentSelection({safety,reads:[],draft:"",historyIntent:{requested:true,timeBasis:"combined",pet:null},workflowIntent:"none",taskPlan:[task(measurementRequests.map(q=>q.pet))],measurementRequests},req.tools,req.context,decodeClinicalSelection):final(req);},
  read:async q=>{reads.push(q);const found=readRows.filter(r=>r.petId===q.pet.id&&(q.sourceIds?q.sourceIds.includes(r.id):r.eventAt.slice(0,10)>=q.from&&r.eventAt.slice(0,10)<=q.to));return {sources:found,total:found.length,scopeExhausted:true};},
  onAnswerBoundary:e=>events.push(e)
 });return {result,reads,phases,events};
}
test("explicit shared endpoint period creates four independently owned reads and signed server results",async()=>{
 const r=await execute([request(),request({pet:"p2"})]);
 assert.equal(r.reads.length,4);assert.deepEqual(r.result.answer.calculations.map(c=>c.value),[2,-.5]);
 assert.deepEqual(r.result.answer.calculations.map(c=>c.sourceHandles.length),[2,2]);
 assert.match(r.result.answer.calculations[0].text,/Juniper/);assert.match(r.result.answer.calculations[1].text,/Moss/);
 assert.equal(r.result.answer.taskCompletion[0].status,"complete");assert.equal(r.phases.length,2);
});
test("percentage follow-up rehydrates both fingerprint-authorized endpoints and divides by the initial weight",async()=>{
 const entries=rows.slice(0,2).map(s=>({kind:"history",petId:s.petId,timeZone:"UTC",goal:"exact_quote",from:s.eventAt.slice(0,7)+"-01",to:s.eventAt.slice(0,7)+(s.eventAt.includes("-02-")?"-28":"-30"),recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],limited:false,sources:[{id:s.id,hash:createHash("sha256").update(s.body).digest("hex"),eventAt:s.eventAt,recordedAt:s.recordedAt}]}));
 const q=request({operation:"percent_change",start:{from:null,to:null,reference:"r1"},finish:{from:null,to:null,reference:"r2"}});
 const r=await execute([q],{question:"Using those same Juniper endpoints, what percentage increase was that? Show the denominator.",readReferences:{version:1,entries},dialogue:[{role:"furvise",text:"An earlier assistant number is not evidence."}]});
 assert.equal(r.reads.length,2);assert.deepEqual(r.reads.map(q=>q.sourceIds),[["j-start"],["j-end"]]);
 assert.equal(r.result.answer.calculations[0].value,10);assert.match(r.result.answer.calculations[0].text,/\(22 - 20\) kg \/ 20 kg/);
});
test("changed retained source cannot become a percentage operand",async()=>{
 const s=rows[0],entries=[{kind:"history",petId:s.petId,timeZone:"UTC",goal:"exact_quote",from:"2022-02-01",to:"2022-02-28",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],sources:[{id:s.id,hash:createHash("sha256").update("old body").digest("hex"),eventAt:s.eventAt,recordedAt:s.recordedAt}]}];
 const r=await execute([request({start:{from:null,to:null,reference:"r1"}})],{readReferences:{version:1,entries}});
 assert.equal(r.result.answer.calculations.length,0);assert.equal(r.result.answer.taskCompletion[0].status,"unresolved");
});
test("multiple compatible measurements in one endpoint remain ambiguous",async()=>{
 const r=await execute([request()],{},[...rows,row(pets[0],21,"02","other-start")]);
 assert.equal(r.result.answer.calculations.length,0);assert.equal(r.result.answer.taskCompletion[0].status,"unresolved");assert.match(r.result.answer.answer,/Which saved measurement should I use for Juniper/);assert.equal(r.result.answer.replyType,"clarification");
});
test("a foreign or another pet's retained endpoint cannot be compiled",()=>{
 const ctx={question:"Juniper and Moss",pets:[{handle:"p1",name:"Juniper"},{handle:"p2",name:"Moss"}],references:[{reference:"r1",petHandle:"p2",kind:"history",orderBy:"event"}]};
 assert.throws(()=>compileMeasurementRequests([request({start:{from:null,to:null,reference:"r1"}})],{calls:[]},[task()],ctx,()=>{throw new Error("must not bind");}),/MEASUREMENT_SCOPE/);
});
test("matching names cannot substitute for an authorized pet ID in operand resolution",()=>{
 const q={...request(),petId:"one",calls:["a","b"]},sources=[{handle:"s1",kind:"history",petId:"one",petName:"Same",eventAt:"2022-02-01",measurements:[{handle:"s1:m1",metric:"body_weight"}]},{handle:"s2",kind:"history",petId:"two",petName:"Same",eventAt:"2022-11-01",measurements:[{handle:"s2:m1",metric:"body_weight"}]}];
 const results=["a","b"].map((call,i)=>({call,scope:{pet:"Same"},sources:[{source:"s"+(i+1)}],unmet:[]}));
 assert.equal(resolveMeasurementRequests([q],results,sources)[0].available,false);
});
const base={answer:"unsafe generated current assertion",quotes:[],sources:[],calculations:[],replyType:"answer",limited:false,presentation:{sourceDates:[]}};
function clinical(initial,occurrence,text,events=[]){
 const owners=[{ref:"owner1",text}],review={assessment:{...safety,eventAssessments:events},ownerStatementRefs:["owner1"],observationFields:["discomfort","exposure"],concernReview:{occurrence,sentence:concernSentenceCatalog(owners).at(-1).handle}};
 const normalized=decodeClinicalSelection({safety:initial,reads:[],draft:"",historyIntent:{requested:false,timeBasis:"event",pet:null},workflowIntent:"none"},[{parameters:{properties:{pet:{enum:["p1"]}}}}],{ownerStatementRefs:[{ref:"owner1",question:true}],question:text}).safety;
 const p=reviewClinicalAnswer({clinicalReview:review,appHelp:{intent:"none",pet:null},components:[]},normalized,owners,[]);
 return {policy:p.policy,answer:renderMedicationDecision(base,p.policy,owners)};
}
test("a mistaken mild-current label is corrected by exact historical/no-current occurrence review",()=>{
 const r=clinical({...safety,careContext:"current_concern"},"negated","The old rash resolved years ago. There are no symptoms now.");
 assert.equal(r.policy.currentConcern,false);assert.equal(r.policy.historicalOnly,true);
 assert.match(r.answer.answer,/does not establish a current emergency/);assert.doesNotMatch(r.answer.answer,/current change|swollen abdomen|possible exposure/);
});
test("past-tense resolved episode remains historical without blanket current clearance",()=>{
 const r=clinical({...safety,careContext:"clinical_history"},"resolved","A limp last winter resolved after rest.");
 assert.match(r.answer.answer,/not an assessment of current health/);assert.doesNotMatch(r.answer.answer,/safe to wait|healthy now/);
});
test("actual current breathing event cannot be downgraded by nonacute review",()=>{
 const e={event:"breathing_distress",occurrence:"current",ownerStatementRef:"owner1"};
 const r=clinical({...safety,careContext:"current_concern",eventAssessments:[e]},"negated","The old rash resolved. She is struggling to breathe now.");
 assert.match(r.answer.answer,/^Contact an emergency veterinarian now/);assert.equal(r.policy.historicalOnly,false);
});
test("future warning remains conditional, without asserting a present episode",()=>{
 const e={event:"collapse",occurrence:"conditional",ownerStatementRef:null};
 const r=clinical({...safety,eventAssessments:[e]},"conditional","If a collapse happens on a future trip, what should I do?",[e]);
 assert.match(r.answer.answer,/If .*emergency veterinarian immediately/);assert.match(r.answer.answer,/not a claim that they are happening now/);
});
test("full request is budgeted before reads and packed whole bodies fit the same canonical wire",async()=>{
 let reads=0,checks=0,last;
 const provider=Object.assign(async(req,phase)=>{
  if(phase==="read_selection")return decodeComponentSelection({safety,reads:[{name:"search_saved_records",arguments:{pet:"p1",from:"2020-01-01",to:"2022-12-31",recordedFrom:null,recordedTo:null,goal:"complete_set",alternatives:[],orderBy:"event",order:"asc",query:null,offset:0}}],draft:"",historyIntent:{requested:true,timeBasis:"event",pet:"p1"},workflowIntent:"none",taskPlan:[{...task(),kind:"saved_content",recordMode:"collection",missing:[]}],measurementRequests:[]},req.tools,req.context,decodeClinicalSelection);
  last=req;const out=final(req),source=req.SOURCE_CATALOG[0];out.components=[{kind:"saved",text:"A selected historical observation.",sources:[source.source]}];out.completion[0]={...out.completion[0],status:"partial",reason:"source_omitted",componentIndexes:[0],sources:[source.source],historyFacts:[{source:source.source,excerpt:source.body.split(". ")[0]+ "."}]};return out;
 },{fits:req=>{checks++;if(checks===1)assert.equal(reads,0);try{buildReadOnlyProviderRequest("model",req,"read_answer",2400,{maxInputCharacters:80000,maxInputTokens:20000});return true;}catch(e){if(e.code==="ASK_READ_INPUT_BUDGET")return false;throw e;}}});
 const long=Array.from({length:32},(_,i)=>({...row(pets[0],20,"02","budget-"+i),body:"Original observation "+i+". "+"Ordinary historical context, no new concern recorded. ".repeat(18)}));
 const r=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets,dialogue:[],question:"Summarize Juniper's 2020 through 2022 care history.",now:"2026-11-15T12:00:00Z",timeZone:"UTC"},{provider,read:async()=>{reads++;return {sources:long,total:32,scopeExhausted:true};}});
 assert.equal(reads,1);assert.ok(last.SOURCE_CATALOG.length>0);assert.ok(last.SOURCE_CATALOG.length<32);assert.ok(last.TOOL_DATA[0].omitted>0);
 assert.ok(r.answer.answer.length>0);assert.ok(checks>2);for(const s of last.SOURCE_CATALOG)assert.ok(long.some(x=>x.body===s.body));
 assert.doesNotThrow(()=>buildReadOnlyProviderRequest("model",last,"read_answer",2400,{maxInputCharacters:80000,maxInputTokens:20000}));
});

test("concern sentence handles preserve decimals, negation and original wording",()=>{
 const text="She weighed 4.25 kg during the old episode. There are no symptoms now.";
 assert.deepEqual(concernSentenceCatalog([{ref:"owner1",text}]).map(s=>s.text),["She weighed 4.25 kg during the old episode.","There are no symptoms now."]);
});
