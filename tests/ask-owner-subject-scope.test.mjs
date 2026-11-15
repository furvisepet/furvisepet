import test from "node:test";
import assert from "node:assert/strict";
import {ownerSubjectScope,namedOwnedPets,assertGeneratedSubject} from "../app/lib/ask-read-only/subject-scope.mjs";
import {compileMeasurementRequests} from "../app/lib/ask-read-only/measurement-requests.mjs";
import {runReadOnlyAsk,bindReadTool} from "../app/lib/ask-read-only/core.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
const pets=[{id:"cedar-private-123456",ownerId:"owner",name:"Cedar",species:"dog",handle:"p1"},{id:"echo-private-123456",ownerId:"owner",name:"Echo",species:"dog",handle:"p2"}];
test("explicit owner identity overrides stale selection and Unicode boundaries exclude embedded names",()=>{
 assert.deepEqual(ownerSubjectScope("Echo's old injury history",[],pets),{method:"explicit_owner",pets:["p2"]});
 assert.equal(namedOwnedPets("echoing and Cédar",pets).length,0);
 assert.equal(namedOwnedPets("preEcho and Echo猫",pets).length,0);
 assert.equal(namedOwnedPets("Echo’s history",pets).length,1);
});
test("only immediate owner antecedent binds a nameless follow-up",()=>{
 const dialogue=[{role:"user",text:"Compare Echo's January and June 2021 weights."},{role:"assistant",text:"Cedar is selected."}];
 assert.deepEqual(ownerSubjectScope("Now express that same change as a percentage.",dialogue,pets),{method:"prior_owner",pets:["p2"]});
 assert.equal(ownerSubjectScope("Now express that same change.",[...dialogue,{role:"user",text:"Explain gravity."}],pets),null);
 assert.equal(ownerSubjectScope("What is a comet?",dialogue,pets),null);
 assert.equal(ownerSubjectScope("Do that again.",[{role:"assistant",text:"Echo"}],pets),null);
 assert.equal(ownerSubjectScope("Do that again.",[{role:"user",text:"Compare Echo and Cedar."}],pets),null);
 assert.equal(ownerSubjectScope("Echo's history",[],[...pets,{...pets[1],id:"another",handle:"p3"}]),null);
});
test("wrong household pet in generated prose fails closed; explicit comparison keeps both",()=>{
 const output={components:[{kind:"general",text:"If Cedar develops a new limp, call your vet.",sources:[]}]};
 assert.throws(()=>assertGeneratedSubject(output,{pets:["p2"]},pets),{code:"ASK_READ_SUBJECT_SCOPE"});
 assert.doesNotThrow(()=>assertGeneratedSubject(output,{pets:["p1","p2"]},pets));
 assert.doesNotThrow(()=>assertGeneratedSubject({components:[{text:"If Echo develops a new limp, call your vet."}]},{pets:["p2"]},pets));
});
test("percentage fresh endpoint compiler accepts owner-established antecedent but rejects UI and wrong pet",()=>{
 const context={question:"Now express that same change as a percentage.",dialogue:[{role:"user",text:"Compare Echo's January and June 2021 weights."}],pets,references:[]};
 context.ownerSubjectScope=ownerSubjectScope(context.question,context.dialogue,pets);
 const plan=[{id:"t1",kind:"calculation",needsHistory:true,needsOwnerFacts:false,pets:["p2"],missing:[]}];
 const q={task:"t1",pet:"p2",metric:"body_weight",operation:"percent_change",timeBasis:"event",start:{from:"2021-01-01",to:"2021-01-31",reference:null},finish:{from:"2021-06-01",to:"2021-06-30",reference:null}};
 const bind=(name,args)=>bindReadTool(name,args,pets,[]);
 const compiled=compileMeasurementRequests([q],{calls:[]},plan,context,bind);
 assert.equal(compiled.calls.length,2);
 assert.ok(compiled.calls.every(c=>JSON.parse(c.arguments).pet==="p2"));
 assert.throws(()=>compileMeasurementRequests([q],{calls:[]},plan,{...context,ownerSubjectScope:null},bind),{code:"ASK_READ_MEASUREMENT_SCOPE"});
 assert.throws(()=>compileMeasurementRequests([{...q,pet:"p1"}],{calls:[]},[{...plan[0],pets:["p1"]}],context,bind),{code:"ASK_READ_MEASUREMENT_SCOPE"});
});
const safety=extra=>({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[],...extra});
async function execute(question,outputText,{historical=false,emergency=false,finalEmergency=false}={}){
 let requests=[],reads=0;
 const s=safety(emergency?{careContext:"current_concern",eventAssessments:[{event:"breathing_distress",occurrence:"current",ownerStatementRef:"owner1"}]}:{});
 const plan=[{id:"t1",kind:"general_guidance",recordMode:"none",needsHistory:false,needsOwnerFacts:false,includeSourceDates:false,workflow:"none",pets:["p2"],reference:null,missing:[]}];
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets,dialogue:[],question,now:"2026-11-15T12:00:00Z",timeZone:"UTC"},{
 provider:async(req,phase)=>{requests.push(req);
 if(phase==="read_selection")return decodeComponentSelection({safety:s,reads:[],draft:"",historyIntent:{requested:false,timeBasis:"event",pet:null},workflowIntent:"none",taskPlan:plan},req.tools,req.context,decodeClinicalSelection);
 return {components:[{kind:"general",text:outputText,sources:[]}],quotes:[],sources:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:finalEmergency?safety({careContext:"current_concern",eventAssessments:[{event:"breathing_distress",occurrence:"current",ownerStatementRef:"owner1"}]}):s,ownerStatementRefs:[],observationFields:[],...(historical?{concernReview:{occurrence:"resolved",sentence:null}}:{})},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:[],ownerFacts:[],historyFacts:[]}]};
 },read:async()=>{reads++;throw new Error("Unexpected read");}});
 return {result,requests,reads};
}
test("actual two-call core carries explicit Echo to both passes and keeps resolved historical policy active",async()=>{
 const r=await execute("Echo's limp ended years ago. No symptoms today. Is it urgent now?","No urgent problem is established by that old report.",{historical:true});
 assert.equal(r.requests.length,2);assert.equal(r.reads,0);
 assert.ok(r.requests.every(req=>req.context.selectedPet==="p2"&&req.context.ownerSubjectScope.pets[0]==="p2"));
 assert.match(r.result.answer.answer,/historical or resolved report by itself does not establish a current emergency/i);
 assert.equal(r.result.answer.clinicalDisplayBounded,true);
});
test("actual core refuses wrong-pet generated clinical warning",async()=>{
 await assert.rejects(execute("Echo's old injury is resolved; no symptoms now.","If Cedar develops a new limp, call your vet."),{code:"ASK_READ_SUBJECT_SCOPE"});
});
test("wrong-pet final output cannot displace verified current emergency fallback",async()=>{
 const r=await execute("Echo is struggling to breathe right now.","Cedar should wait.",{emergency:true});
 assert.match(r.result.answer.answer,/emergency veterinarian now/);
 assert.doesNotMatch(r.result.answer.answer,/Cedar|wait\./);
 assert.equal(r.result.answer.clinicalDecision.emergencyFallback,true);
});

import {sharedYearMonthRange,bindExplicitContinuationWindow} from "../app/lib/ask-read-only/continuation-window.mjs";
import {reconcileDeclaredUnavailability} from "../app/lib/ask-read-only/declared-unavailability.mjs";
import {renderMedicationDecision} from "../app/lib/ask-read-only/clinical-policy.mjs";
test("shared-year month range is literal, chronological and unambiguous",()=>{
 assert.deepEqual(sharedYearMonthRange("Read Echo's October through December 2022 originals."),{from:"2022-10-01",to:"2022-12-31",precision:"range"});
 assert.equal(sharedYearMonthRange("December through October 2022"),null);
 assert.equal(sharedYearMonthRange("October through December 2022 and January 2021"),null);
});
test("explicit requested continuation window retains anchor and outstanding older omissions",()=>{
 const anchor={kind:"history",pet:pets[1],from:"2022-01-01",to:"2022-12-31",expectedSources:[{id:"unchanged"}]};
 const request={kind:"history",pet:pets[1],from:"2022-01-01",to:"2022-09-30",continuation:{reference:"r1",range:{axis:"event",from:"2022-01-01",to:"2022-09-30"},anchorRequest:anchor}};
 const bound=bindExplicitContinuationWindow(request,"Read Echo's October through December 2022 originals now.",pets);
 assert.equal(bound.from,"2022-10-01");assert.equal(bound.to,"2022-12-31");
 assert.equal(bound.continuation.anchorRequest,anchor);assert.equal(bound.explicitIntervalOverride,true);
 assert.equal(request.continuation.range.from,"2022-01-01");
 assert.equal(bindExplicitContinuationWindow(request,"Read Cedar's October through December 2022 originals.",pets),request);
 assert.equal(bindExplicitContinuationWindow(request,"Read Echo's October through December 2023 originals.",pets),request);
});
test("declared never-logged detail suppresses a valid speculative collection scan but cannot launder a foreign read",()=>{
 const p=[{id:"t1",kind:"saved_content",recordMode:"collection",pets:["p2"],needsHistory:true,needsOwnerFacts:false,reference:null,missing:[]}];
 const first={calls:[{id:"one",name:"search_saved_records",arguments:JSON.stringify({pet:"p2"})}],workflowIntent:"none",safety:{medicationIntent:"none",careContext:"none",scenario:"none",missingContext:[]},historyIntent:{requested:true}};
 const context={question:"I haven't logged which brush brand I use for Echo. Is there a saved brand you can identify for me?"};
 const bound=reconcileDeclaredUnavailability(first,p,context,pets,"owner",()=>pets[1],()=>({pet:pets[1]}));
 assert.ok(bound);assert.deepEqual(bound.first.calls,[]);assert.equal(bound.plan[0].needsHistory,false);
 assert.equal(reconcileDeclaredUnavailability(first,p,context,pets,"owner",()=>pets[1],()=>({pet:pets[0]})),null);
 assert.throws(()=>reconcileDeclaredUnavailability(first,p,context,pets,"owner",()=>pets[1],()=>{throw Error("invalid locator");}),/invalid locator/);
});
test("conditional future-only handoff does not instruct the owner to report a historical event",()=>{
 const answer={answer:"",quotes:[],sources:[],calculations:[],replyType:"answer",limited:false,presentation:{}};
 const policy={version:2,active:true,current:[],conditional:["repeated_seizures"],missing:[],observations:[],ownerRefs:[],historical:true,summaryContext:false,currentConcern:false,decision:false};
 const rendered=renderMedicationDecision(answer,policy,[]);
 assert.match(rendered.answer,/emergency veterinarian immediately/);
 assert.doesNotMatch(rendered.answer,/historical report|Bring dated records/);
});

import {createHash} from "node:crypto";
import {preserveRequestedOriginal} from "../app/lib/ask-read-only/original-quotation.mjs";
test("exact quotation keeps the whole original sentence order and requested timestamp instants",()=>{
 const source={handle:"s1",kind:"history",body:"First original sentence. Second original sentence.",petName:"Echo",eventAt:"2021-08-14T19:15:00Z",recordedAt:"2021-08-16T08:30:00Z"};
 const tasks=[{kind:"saved_content",recordMode:"single",status:"complete",sources:["s1"],includeSourceDates:true}];
 const out=preserveRequestedOriginal({answer:"Second original sentence. First original sentence.",presentation:{}},tasks,[source],"Replace the quotation and the two timestamps.");
 assert.equal(out.quotes[0].quote,source.body);
 assert.doesNotMatch(out.answer,/Second original/);
 assert.equal(out.presentation.sourceDates[0].eventAt,source.eventAt);
 assert.equal(preserveRequestedOriginal(out,tasks,[source],"Replace the quotation",true),out);
});
test("actual core suppresses never-logged detail reads before acquisition",async()=>{
 const s=safety(),plan=[{id:"t1",kind:"saved_content",recordMode:"collection",needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,workflow:"none",pets:["p2"],reference:null,missing:[]}];
 let reads=0,calls=0;
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets,dialogue:[],question:"I haven't logged which brush brand I use for Echo. Is there a saved brand you can identify for me?",now:"2026-11-15T12:00:00Z",timeZone:"UTC"},{
 provider:async(req,phase)=>{calls++;if(phase==="read_selection")return decodeComponentSelection({safety:s,reads:[{name:"search_saved_records",arguments:{pet:"p2",from:null,to:null,query:"brush",offset:0}}],draft:"",historyIntent:{requested:true,timeBasis:"event",pet:"p2"},workflowIntent:"none",taskPlan:plan},req.tools,req.context,decodeClinicalSelection);
 assert.equal(req.context.taskPlan[0].needsHistory,false);
 return {components:[{kind:"general",text:"You said it was not recorded.",sources:[]}],quotes:[],sources:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:s,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:[],ownerFacts:[],historyFacts:[]}]};},
 read:async()=>{reads++;throw Error("Must not scan");}
 });
 assert.equal(reads,0);assert.equal(calls,2);assert.match(result.answer.answer,/said that detail/);
});
test("actual continuation core reads the explicit new quarter and retains the older omitted interval",async()=>{
 const s=safety(),old={kind:"history",id:"old-note-123456789",ownerId:"owner",petId:pets[1].id,body:"A quiet walk was reported.",eventAt:"2022-05-01T12:00:00Z",recordedAt:"2022-05-02T12:00:00Z"};
 const fresh={...old,id:"fresh-note-123456789",body:"An unusual toy game was reported.",eventAt:"2022-11-01T12:00:00Z",recordedAt:"2022-11-02T12:00:00Z"};
 const entry={kind:"history",petId:pets[1].id,timeZone:"UTC",goal:"complete_set",from:"2022-01-01",to:"2022-12-31",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],limited:false,omittedRange:{axis:"event",from:"2022-01-01",to:"2022-09-30"},sources:[{id:old.id,hash:createHash("sha256").update(old.body).digest("hex"),eventAt:old.eventAt,recordedAt:old.recordedAt}]};
 const plan=[{id:"t1",kind:"saved_continuation",recordMode:"collection",needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,workflow:"none",pets:["p2"],reference:"r1",combineHistory:true,missing:[]}];
 let reads=[];
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pets[0].id,pets,dialogue:[],readReferences:{version:1,entries:[entry]},question:"Read Echo's October through December 2022 originals now and combine them with the earlier overview.",now:"2026-11-15T12:00:00Z",timeZone:"UTC"},{
 provider:async(req,phase)=>{if(phase==="read_selection")return decodeComponentSelection({safety:s,reads:[],draft:"",historyIntent:{requested:true,timeBasis:"event",pet:"p2"},workflowIntent:"none",taskPlan:plan},req.tools,req.context,decodeClinicalSelection);
 const handles=req.SOURCE_CATALOG.map(row=>row.source);
 return {components:[{kind:"saved",text:"The two supported historical reports are combined.",sources:handles}],quotes:[],sources:handles,calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:s,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:handles,ownerFacts:[],historyFacts:req.SOURCE_CATALOG.map(row=>({source:row.source,excerpt:row.body}))}]};},
 read:async request=>{reads.push(request);return request.continuation?{sources:[fresh],total:1,scopeExhausted:true,continuationValidation:{valid:true}}:{sources:[old],total:1,scopeExhausted:true};}
 });
 assert.equal(reads.length,2);const continuation=reads.find(r=>r.continuation);
 assert.equal(continuation.from,"2022-10-01");assert.equal(continuation.to,"2022-12-31");
 assert.ok(result.readReferences.entries.some(e=>e.omittedRange?.from==="2022-01-01"&&e.omittedRange?.to==="2022-09-30"));
});

test("newly recognized final emergency survives discarded wrong-pet prose",async()=>{
 const r=await execute("Echo is struggling to breathe right now.","Cedar should wait.",{finalEmergency:true});
 assert.match(r.result.answer.answer,/emergency veterinarian now/);
 assert.doesNotMatch(r.result.answer.answer,/Cedar|wait\./);
 assert.equal(r.result.answer.clinicalDecision.emergencyFallback,true);
});
