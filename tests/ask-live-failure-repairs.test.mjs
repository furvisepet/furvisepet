import test from "node:test";
import assert from "node:assert/strict";
import {measurementRequestSchema,compileMeasurementRequests,resolveMeasurementRequests} from "../app/lib/ask-read-only/measurement-requests.mjs";
import {componentSelectionSchema,validateTaskPlan,fulfillReferenceReads} from "../app/lib/ask-read-only/task-components.mjs";
import {reconcileMissingCalendarYear} from "../app/lib/ask-read-only/calendar-scope.mjs";
import {reconcileDeclaredUnavailability} from "../app/lib/ask-read-only/declared-unavailability.mjs";
import {evidenceCompletionSchema,parseEvidenceCompletion} from "../app/lib/ask-read-only/evidence-completion.mjs";
import {renderHistoryTimeline} from "../app/lib/ask-read-only/history-synthesis.mjs";
import {validateClinicalAssessment,reviewClinicalAnswer,renderMedicationDecision} from "../app/lib/ask-read-only/clinical-policy.mjs";
const pet={handle:"p1",id:"owned-animal",ownerId:"owner",name:"Pip (Jr.)",species:"cat"};
const plan=(extra={})=>({id:"t1",kind:"saved_content",needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,recordMode:"single",workflow:"none",pets:["p1"],reference:null,missing:[],...extra});
const context={pets:[pet],references:[{reference:"r1",petHandle:"p1",kind:"history",orderBy:"event"},{reference:"r2",petHandle:"p1",kind:"history",orderBy:"event"}],question:"Use Pip (Jr.)'s previous measurements.",dialogue:[]};
const safety={medicationIntent:"none",careContext:"none",scenario:"none",missingContext:[],currentEvents:[],conditionalEvents:[]};
const endpoint=reference=>({from:null,to:null,reference});
const request={task:"t1",pet:"p1",metric:"body_weight",operation:"percent_change",timeBasis:"event",start:endpoint("r1"),finish:endpoint("r2")};
const bind=(name,args)=>({kind:"history",pet,reference:args.reference,sourceIds:[args.reference+"-record"],expectedSources:[{hash:"fingerprint-"+args.reference}]});
test("live endpoint schema forbids mixing a retained locator with fresh dates",()=>{
 const e=measurementRequestSchema(context).items.properties.start.anyOf;
 assert.equal(e[0].properties.reference.type,"null");
 assert.equal(e[1].properties.from.type,"null");assert.equal(e[1].properties.to.type,"null");
 assert.deepEqual(e[1].properties.reference.enum,["r1","r2"]);
 const schema=componentSelectionSchema({properties:{},required:[]},context);
 for(const v of schema.properties.taskPlan.items.anyOf.filter(v=>v.properties.kind.enum.includes("calculation"))){
  assert.deepEqual(v.properties.needsHistory.enum,[true]);assert.deepEqual(v.properties.needsOwnerFacts.enum,[false]);
 }
});
test("retained percentage endpoints use two independent owner-bound rereads",()=>{
 const r=compileMeasurementRequests([request],{calls:[]},[plan({kind:"calculation",recordMode:"collection"})],context,bind);
 assert.equal(r.calls.length,2);assert.deepEqual(r.calls.map(c=>JSON.parse(c.arguments)),[{reference:"r1"},{reference:"r2"}]);
 assert.deepEqual(r.bindings[0].calls,["measurement-0-start","measurement-0-finish"]);
});
test("invalid retained scope has value-free structural diagnostics",()=>{
 assert.throws(()=>compileMeasurementRequests([{...request,start:{...request.start,from:"2022-01-01"}}],{calls:[]},[plan({kind:"calculation"})],context,bind),e=>e.answerDiagnostic.field==="retained_endpoint_scope");
 const foreign={...context,references:context.references.map(r=>({...r,petHandle:"p2"}))};
 assert.throws(()=>compileMeasurementRequests([request],{calls:[]},[plan({kind:"calculation"})],foreign,bind),e=>e.answerDiagnostic.field==="retained_endpoint_scope");
});
test("literal punctuation in an owned pet name does not change fresh scope matching",()=>{
 const q={...request,start:{reference:null,from:"2022-01-01",to:"2022-01-31"},finish:{reference:null,from:"2022-03-01",to:"2022-03-31"}};
 assert.equal(compileMeasurementRequests([q],{calls:[]},[plan({kind:"calculation"})],context,bind).calls.length,2);
});
test("one retained comparison can contain exactly its two unique chronological endpoints",()=>{
 const q={...request,petId:pet.id,petName:pet.name,calls:["same","same"]};
 const ss=[["s2","2022-03-12T12:00:00Z"],["s1","2022-01-12T12:00:00Z"]].map(([handle,eventAt])=>({handle,eventAt,kind:"history",petId:pet.id,measurements:[{metric:"body_weight",handle:handle+":m1"}]}));
 const result={call:"same",sources:ss.map(s=>({source:s.handle})),unmet:[]};
 const r=resolveMeasurementRequests([q],[result],ss)[0];
 assert.equal(r.available,true);assert.deepEqual(r.calculation.operands,["s1:m1","s2:m1"]);
 assert.equal(resolveMeasurementRequests([q],[{...result,unmet:["referenced_source_changed_or_missing"]}],ss)[0].available,false);
 assert.equal(resolveMeasurementRequests([q],[result],[...ss,{...ss[0],handle:"s3"}])[0].available,true); // unreturned handles cannot become operands
});
test("a bound saved locator necessarily rehydrates even when the first-pass dependency flag was false",()=>{
 const p=validateTaskPlan([plan({needsHistory:false,recordMode:"none",reference:"r1"})],context);
 assert.equal(p[0].needsHistory,true);assert.equal(p[0].recordMode,"single");
 const r=fulfillReferenceReads({calls:[],taskPlan:p},[{handle:"r1",request:{kind:"history",pet,goal:"exact_quote"}}]);
 assert.equal(r.calls[0].name,"read_referenced_sources");assert.equal(JSON.parse(r.calls[0].arguments).reference,"r1");
});
test("missing year correction asks for year without granting or guessing a read",()=>{
 const c={...context,references:[],question:"Find Pip (Jr.)'s April weight note; I have not specified the year."};
 const r=reconcileMissingCalendarYear({calls:[],safety},[plan({missing:["date_meaning"]})],c);
 assert.deepEqual(r[0].missing,["year"]);
 assert.equal(reconcileMissingCalendarYear({calls:[],safety},[plan()],{...c,question:"Find Pip (Jr.)'s April 2024 note."}),null);
 assert.equal(reconcileMissingCalendarYear({calls:[],safety},[plan()],{...c,question:"Find Pip (Jr.)'s April note.",dialogue:[{role:"user",text:"Use 2023 for these questions."}]}),null);
});
test("explicit unavailable information overrides a contradictory missing-record task, never a real search",()=>{
 const c={...context,question:"I never entered Pip (Jr.)'s preferred blanket. Can you tell me the saved preference?"};
 const first={calls:[],workflowIntent:"none",safety};
 const r=reconcileDeclaredUnavailability(first,[plan({missing:["which_record"]})],c,[pet],"owner",()=>pet);
 assert.equal(r.plan[0].needsHistory,false);assert.equal(r.plan[0].recordMode,"none");assert.deepEqual(r.plan[0].missing,[]);
 assert.equal(reconcileDeclaredUnavailability({...first,calls:[{name:"search_saved_records"}]},[plan()],c,[pet],"owner",()=>pet),null);
 assert.equal(reconcileDeclaredUnavailability(first,[plan()],{...c,question:c.question+" Search all saved notes."},[pet],"owner",()=>pet),null);
});
test("live history review requires each admitted handle once by construction",()=>{
 const p=[plan({recordMode:"collection"})],ss=[{handle:"s1",kind:"history"},{handle:"s2",kind:"history"}];
 const s=evidenceCompletionSchema(p,ss).properties.sourceReview;
 assert.deepEqual(s.required,["s1","s2"]);assert.equal(s.additionalProperties,false);
 const value={evidenceCompletion:{sourceReview:{s1:"routine",s2:"noteworthy"},missingReference:null}};
 assert.equal(parseEvidenceCompletion(value,p,ss,[],"").review.length,2);
 assert.throws(()=>parseEvidenceCompletion({evidenceCompletion:{sourceReview:{s1:"routine"},missingReference:null}},p,ss,[],""),/COMPONENT_CONTRACT/);
});
test("timeline orders exact negated and conditional statements by verified dates and labels pet separately",()=>{
 const e=(source,eventAt,excerpt,pet)=>({source,eventAt,recordedAt:eventAt,excerpt,pet,petId:pet});
 const out=renderHistoryTimeline([{topic:"reports",evidence:[e("s2","2023-03-01T12:00:00Z","If the itch returns, call the vet.","Pip"),e("s1","2021-01-01T12:00:00Z","No itch was reported.","Oak")]}],["s1","s2"],{includeRecorded:true});
 assert.ok(out.text.indexOf("No itch")<out.text.indexOf("If the itch"));
 assert.match(out.text,/Oak: event 2021-01-01; recorded 2021-01-01/);
 assert.match(out.text,/Source 1/);assert.equal(out.omitted,0);
});
test("final conditional occurrence removes a stale historical label while retaining acute obligations",()=>{
 const stmts=[{ref:"owner1",text:"Nothing is wrong now. If my pet collapses later, what should I do?"}];
 const initial=validateClinicalAssessment({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"clinical_history",eventAssessments:[]},stmts);
 const assessment={medicationIntent:"none",referent:"clear",missingContext:[],careContext:"education",eventAssessments:[{event:"collapse",occurrence:"conditional",ownerStatementRef:null}]};
 const value={components:[],appHelp:{intent:"none",pet:null},clinicalReview:{assessment,ownerStatementRefs:[],observationFields:[],concernReview:{occurrence:"conditional",sentence:null}}};
 const r=reviewClinicalAnswer(value,initial,stmts,[pet]);
 assert.equal(r.policy.historical,false);assert.deepEqual(r.policy.conditional,["collapse"]);
 const out=renderMedicationDecision({sources:[],quotes:[],presentation:{}},r.policy);
 assert.match(out.answer,/emergency veterinarian immediately/);assert.doesNotMatch(out.answer,/historical report/);
});
test("introduced severe IF warning cannot be downgraded to merely checked promptly",()=>{
 const initial=validateClinicalAssessment({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]},[]);
 const value={components:[{kind:"general",text:"If collapse or breathing trouble occurs, it should be checked promptly by a veterinarian."}],appHelp:{intent:"none",pet:null},clinicalReview:{assessment:{medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]},ownerStatementRefs:[],observationFields:[],concernReview:{occurrence:"none",sentence:null}}};
 const r=reviewClinicalAnswer(value,initial,[],[pet]);
 assert.ok(r.policy.conditional.includes("collapse"));assert.ok(r.policy.conditional.includes("breathing_distress"));
 const out=renderMedicationDecision({sources:[],quotes:[],presentation:{}},r.policy);
 assert.match(out.answer,/emergency veterinarian immediately/);assert.doesNotMatch(out.answer,/checked promptly/);
});
