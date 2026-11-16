import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {recoverRetainedPercentageRequests} from "../app/lib/ask-read-only/measurement-requests.mjs";
import {reconcileHistoricalDelivery} from "../app/lib/ask-read-only/historical-delivery.mjs";
const pets=[{id:"private-cedar-12345",ownerId:"owner",name:"Cedar",species:"dog"},{id:"private-echo-12345",ownerId:"owner",name:"Echo",species:"dog"}];
const rawSafety={medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]};
const task=extra=>({id:"t1",kind:"calculation",needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,recordMode:"collection",workflow:"none",pets:["p2"],reference:null,missing:[],...extra});
const rows=[{kind:"history",id:"private-start-12345",ownerId:"owner",petId:pets[1].id,body:"Echo weighed 4.00 kg.",eventAt:"2022-01-15T12:00:00Z",recordedAt:"2022-01-16T12:00:00Z"},{kind:"history",id:"private-end-12345",ownerId:"owner",petId:pets[1].id,body:"Echo weighed 4.40 kg.",eventAt:"2022-06-15T12:00:00Z",recordedAt:"2022-06-16T12:00:00Z"}];
const references={version:1,entries:rows.map((s,i)=>({kind:"history",petId:s.petId,timeZone:"UTC",goal:"comparison",from:i?"2022-06-01":"2022-01-01",to:i?"2022-06-30":"2022-01-31",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],limited:false,sources:[{id:s.id,hash:createHash("sha256").update(s.body).digest("hex"),eventAt:s.eventAt,recordedAt:s.recordedAt}]}))};
async function percentage(extraRows=rows){
 let calls=0,reads=[];
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets,dialogue:[{role:"user",text:"For Echo compare the January and June 2022 body-weight entries."},{role:"assistant",text:"An untrusted old assistant calculation was 9999 percent."}],readReferences:references,question:"Now express that same change as a percentage of the first reading. Show the starting weight used as divisor.",now:"2026-11-16T00:00:00Z",timeZone:"UTC"},{
 provider:async(req,phase)=>{calls++;if(phase==="read_selection")return decodeComponentSelection({safety:rawSafety,reads:[],draft:"",historyIntent:{requested:true,timeBasis:"ambiguous",pet:null},workflowIntent:"none",taskPlan:[task()],measurementRequests:[]},req.tools,req.context,decodeClinicalSelection);
 return {components:[{kind:"general",text:"An unfinished calculation.",sources:[]}],quotes:[],sources:[],calculations:[],replyType:"partial",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:rawSafety,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"unresolved",reason:"not_answered",componentIndexes:[],sources:[],ownerFacts:[],historyFacts:[]}]};},
 read:async request=>{reads.push(request);const found=extraRows.filter(row=>request.sourceIds.includes(row.id));return {sources:found,total:found.length,scopeExhausted:true};}
 });return {result,calls,reads};
}
test("actual two-call core recovers omitted percentage planning from two bound prior endpoints",async()=>{
 const r=await percentage();assert.equal(r.calls,2);assert.equal(r.reads.length,2);
 assert.deepEqual(r.reads.map(r=>r.sourceIds),[[rows[0].id],[rows[1].id]]);
 assert.equal(r.result.answer.calculations[0].value,10);
 assert.match(r.result.answer.calculations[0].text,/4\.4 - 4.*\/ 4 kg/);
 assert.equal(r.result.answer.taskCompletion[0].status,"complete");
 assert.doesNotMatch(r.result.answer.answer,/9999/);
});
test("changed fingerprint never becomes a recovered percentage operand",async()=>{
 const r=await percentage([{...rows[0],body:"Echo weighed 9.00 kg."},rows[1]]);
 assert.equal(r.result.answer.calculations.length,0);assert.equal(r.result.answer.taskCompletion[0].status,"unresolved");
});
test("recovery requires the immediate owner metric and exactly two nonoverlapping retained comparisons",()=>{
 const refs=references.entries.map((r,i)=>({...r,reference:"r"+(i+1),petHandle:"p2",sourceCount:1}));
 const ctx={question:"What percentage was that same change?",ownerSubjectScope:{method:"prior_owner",pets:["p2"]},dialogue:[{role:"user",text:"Compare Echo's body weight."}],references:refs};
 assert.equal(recoverRetainedPercentageRequests([],{calls:[]},[task()],ctx).length,1);
 assert.equal(recoverRetainedPercentageRequests([],{calls:[]},[task()],{...ctx,dialogue:[{role:"user",text:"Explain the moon."}]}),null);
 assert.equal(recoverRetainedPercentageRequests([],{calls:[]},[task()],{...ctx,references:[...refs,{...refs[1],reference:"r3"}]}),null);
 assert.equal(recoverRetainedPercentageRequests([],{calls:[]},[task()],{...ctx,question:"Use 2023 instead; what percentage was that same change?"}),null);
});
const policy={active:true,historicalOnly:true,decision:false,current:[],conditional:[]};
const displayTask=extra=>task({kind:"general_guidance",recordMode:"none",needsHistory:false,sources:[],ownerFacts:[],historyFacts:[],status:"partial",reason:"not_answered",componentIndexes:[0],...extra});
test("bounded historical delivery removes a phantom unavailable-record task only when no saved evidence was requested",()=>{
 const tasks=[displayTask(),displayTask({id:"t2",kind:"saved_content",status:"unresolved"})];
 const clean=reconcileHistoricalDelivery(tasks,policy,"The old injury resolved; nothing is wrong today. Is this urgent now?",0,0);
 assert.equal(clean.length,1);assert.equal(clean[0].kind,"clinical_guidance");assert.equal(clean[0].status,"complete");
 assert.equal(reconcileHistoricalDelivery(tasks,policy,"Does the saved note establish a diagnosis?",0,0),tasks);
 assert.equal(reconcileHistoricalDelivery(tasks,policy,"Is this urgent now?",1,0),tasks);
});
test("current or conditional obligations cannot use source-free historical task reconciliation",()=>{
 const tasks=[displayTask(),displayTask({id:"t2",kind:"saved_content"})];
 assert.equal(reconcileHistoricalDelivery(tasks,{...policy,current:["collapse"]},"Is it urgent now?",0,0),tasks);
 assert.equal(reconcileHistoricalDelivery(tasks,{...policy,conditional:["collapse"]},"Is it urgent now?",0,0),tasks);
});
test("actual core publishes the source-free historical answer without fabricated saved-data requirements",async()=>{
 const plan=[task({kind:"general_guidance",recordMode:"none",needsHistory:false}),task({id:"t2",kind:"saved_content",recordMode:"none",needsHistory:false})];
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets,dialogue:[],question:"Echo's limp resolved years ago and there is no symptom today. Does that make this urgent now?",now:"2026-11-16T00:00:00Z",timeZone:"UTC"},{
 provider:async(req,phase)=>phase==="read_selection"?decodeComponentSelection({safety:rawSafety,reads:[],draft:"",historyIntent:{requested:false,timeBasis:"ambiguous",pet:null},workflowIntent:"none",taskPlan:plan,measurementRequests:[]},req.tools,req.context,decodeClinicalSelection):{components:[{kind:"general",text:"An old resolved report alone is not a present emergency.",sources:[]}],quotes:[],sources:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:rawSafety,ownerStatementRefs:["owner1"],observationFields:[],concernReview:{occurrence:"resolved",sentence:null}},appHelp:{intent:"none",pet:null},completion:plan.map(t=>({task:t.id,status:"complete",reason:"none",componentIndexes:[0],sources:[],ownerFacts:[],historyFacts:[]}))},
 read:async()=>{throw Error("No saved-history acquisition allowed");}
 });
 assert.match(result.answer.answer,/historical or resolved report by itself does not establish a current emergency/i);
 assert.doesNotMatch(result.answer.answer,/saved information|has not been completed|remains unresolved/i);
 assert.equal(result.answer.taskCompletion.length,1);assert.equal(result.answer.taskCompletion[0].status,"complete");
});

test("one historical urgency question does not render duplicate general and clinical notices",()=>{
 const tasks=[displayTask(),displayTask({id:"t2",kind:"clinical_guidance"})];
 const clean=reconcileHistoricalDelivery(tasks,policy,"The limp is long resolved with no signs today. Does that make this urgent now?",0,0);
 assert.equal(clean.length,1);assert.equal(clean[0].kind,"clinical_guidance");assert.equal(clean[0].status,"complete");
 assert.equal(reconcileHistoricalDelivery(tasks,policy,"Is that urgent and why do cats purr?",0,0),tasks);
 assert.equal(reconcileHistoricalDelivery(tasks,policy,"Is that urgent? Why do cats purr?",0,0),tasks);
});

test("source-free urgency delivery can preserve verified owner facts and explicit identity without granting a read",()=>{
 const tasks=[displayTask({pets:["p1"]}),displayTask({id:"t2",kind:"clinical_guidance",pets:["p2"],ownerFacts:[{ref:"owner1",excerpt:"Echo's old limp is resolved."}]})];
 const scope={method:"explicit_owner",pets:["p2"]};
 const clean=reconcileHistoricalDelivery(tasks,policy,"Echo's old limp is resolved. Is that urgent now?",0,0,scope);
 assert.equal(clean.length,1);assert.deepEqual(clean[0].pets,["p2"]);assert.equal(clean[0].ownerFacts.length,1);
 assert.equal(reconcileHistoricalDelivery(tasks,policy,"Echo's old limp is resolved. Is that urgent now?",1,0,scope),tasks);
});

import {recoverIndependentOriginalRead} from "../app/lib/ask-read-only/calendar-scope.mjs";
import {reconcileContinuationAxis} from "../app/lib/ask-read-only/continuation-window.mjs";
import {componentSelectionSchema,reviewComponentCompletion} from "../app/lib/ask-read-only/task-components.mjs";
import {preserveRequestedOriginal} from "../app/lib/ask-read-only/original-quotation.mjs";
test("general provider variant cannot carry record or medication prerequisites",()=>{
 const variants=componentSelectionSchema({properties:{},required:[]},{pets:[{handle:"p1"}],references:[]}).properties.taskPlan.items.anyOf;
 const general=variants.filter(v=>v.properties.kind.enum.includes("general_guidance"));assert.equal(general.length,1);
 assert.deepEqual(general[0].properties.needsHistory.enum,[false]);assert.equal(general[0].properties.missing.maxItems,0);
 assert.ok(variants.filter(v=>v.properties.kind.enum.includes("saved_content")).every(v=>v.properties.needsHistory.enum[0]===true));
});
test("independent original lookup keeps missing medicine authority while resolving display-date ambiguity",()=>{
 const plan=[task({kind:"clinical_guidance",needsHistory:false,recordMode:"none",missing:["medicine","prescription"]}),task({id:"t2",kind:"saved_content",recordMode:"single",missing:["date_meaning"]})];
 const safety={medicationIntent:"decision",referent:"essential_unknown",missingContext:["medicine","prescription"],currentEvents:[],scenario:"none"};
 const first={calls:[],safety,historyIntent:{requested:true,timeBasis:"ambiguous",pet:null}};
 const ctx={pets:[{handle:"p2",name:"Echo"}],question:"Quote Echo's July 2024 original and give its event and saved timestamps."};
 const got=recoverIndependentOriginalRead(first,plan,ctx);
 assert.ok(got);assert.equal(got.first.safety,safety);assert.deepEqual(got.plan[0].missing,["medicine","prescription"]);
 assert.deepEqual(got.plan[1].missing,[]);assert.equal(got.plan[1].includeSourceDates,true);
 const args=JSON.parse(got.first.calls[0].arguments);assert.equal(args.from,"2024-07-01");assert.equal(args.goal,"exact_quote");
 assert.equal(recoverIndependentOriginalRead(first,plan,{...ctx,question:"Quote Echo's July original and give event and saved timestamps."}),null);
 assert.equal(recoverIndependentOriginalRead({...first,safety:{...safety,currentEvents:["collapse"]}},plan,ctx),null);
});
test("narrow continuation inherits only its matching owned reference date axis",()=>{
 const plan=[task({kind:"saved_continuation",reference:"r1",missing:["date_meaning"]})];
 const first={historyIntent:{requested:true,timeBasis:"ambiguous"},calls:[]};
 const ref={handle:"r1",request:{orderBy:"event"}};
 const ctxPets=[{handle:"p2",id:"echo",name:"Echo"}];
 const got=reconcileContinuationAxis(first,plan,[ref],"Read Echo's October through December 2024 originals.",ctxPets);
 assert.equal(got.first.historyIntent.timeBasis,"event");assert.deepEqual(got.plan[0].missing,[]);
 assert.equal(reconcileContinuationAxis(first,plan,[],"Read Echo's October through December 2024 originals.",ctxPets),null);
});
test("whole original quote completes independently of empty collection synthesis and retains clinical text",()=>{
 const source={...rows[0],handle:"s1",petName:"Echo"};
 const plan=[task({kind:"saved_content",recordMode:"single",includeSourceDates:true})];
 const final={components:[{kind:"saved",text:"Original.",sources:["s1"]}],sources:["s1"],quotes:["s1"],completion:[{task:"t1",status:"partial",reason:"not_answered",componentIndexes:[0],sources:["s1"],ownerFacts:[],historyFacts:[],historySynthesis:[]}]};
 const reviewed=reviewComponentCompletion(final,plan,[source],[],[{...pets[1],handle:"p2"}]);assert.equal(reviewed.tasks[0].status,"complete");
 const answer={answer:"Contact the prescriber. Do not choose a catch-up regimen.",sources:["s1"],quotes:[],presentation:{}};
 const rendered=preserveRequestedOriginal(answer,reviewed.tasks,[source],"Quote Echo's full original.",true);
 assert.equal(rendered.answer,answer.answer);assert.equal(rendered.quotes[0].quote,source.body);assert.equal(rendered.presentation.sourceDates[0].eventAt,source.eventAt);
});

import {completeFreshHistory} from "../app/lib/ask-read-only/continuation-evidence.mjs";
test("explicit fresh scoped originals integrate with a retained overview even without omitted-range metadata",()=>{
 const prior={...rows[0],handle:"s1",petName:"Echo"},fresh={...rows[1],handle:"s2",petName:"Echo"};
 const t={...task({kind:"saved_content",recordMode:"collection",reference:"r1",combineHistory:true}),status:"complete",reason:"none",sources:["s1"],historyFacts:[{source:"s1",excerpt:prior.body}],ownerFacts:[],historySynthesis:[],componentIndexes:[0]};
 const group={scope:{kind:"history",evidenceRole:"fresh_scoped",reference:"r1",petHandle:"p2",pet:"Echo"},sources:[{source:"s2",kind:"history",pet:"Echo",body:fresh.body,eventAt:fresh.eventAt,recordedAt:fresh.recordedAt}]};
 const got=completeFreshHistory([t],[prior,fresh],[group])[0];
 assert.ok(got.sources.includes("s2"));assert.equal(got.historyFacts.find(f=>f.source==="s2").excerpt,fresh.body);
 assert.equal(got.continuationEvidenceReview.freshSourceCount,1);
 assert.equal(completeFreshHistory([t],[prior,fresh],[{...group,scope:{...group.scope,reference:"other"}}])[0],t);
 assert.equal(completeFreshHistory([{...t,missing:["year"]}],[prior,fresh],[group])[0].freshSourceHandles,undefined);
});
