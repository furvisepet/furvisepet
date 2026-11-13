import test from "node:test";
import assert from "node:assert/strict";
import {validateHistorySynthesis,renderHistorySynthesis,historySynthesisSchema} from "../app/lib/ask-read-only/history-synthesis.mjs";
import {reviewComponentCompletion,renderTaskCompletion,componentAnswerSchema,validateTaskPlan} from "../app/lib/ask-read-only/task-components.mjs";
const row=(handle,body,eventAt="2020-01-03T12:00:00Z",extra={})=>({handle,body,eventAt,recordedAt:"2020-02-01T12:00:00Z",petId:"a",petName:"Pet A",kind:"history",...extra});
const theme=(topic,sources)=>[{topic,evidence:sources.map(s=>({source:s.handle,excerpt:s.body}))}];
const checked=(t,ss)=>validateHistorySynthesis(t,ss,ss.map(s=>s.handle));
test("single event cannot gain recurring or worsening paraphrase authority",()=>{
 const s=row("s1","A small mat was brushed out after the walk.");const t=checked(theme("mat",[s]),[s]);
 assert.match(renderHistorySynthesis(t),/one selected saved report/);assert.match(renderHistorySynthesis(t),/do not establish separate episodes/);
 assert.doesNotMatch(renderHistorySynthesis(t),/recurring mats|worsening mats|persistent mats/);
});
test("duplicated bodies saved later remain reports and one original wording",()=>{
 const a=row("s1","A mat was brushed out."),b={...a,handle:"s2",recordedAt:"2021-09-01T12:00:00Z"};
 const out=renderHistorySynthesis(checked(theme("mat",[a,b]),[a,b]));assert.match(out,/2 selected saved reports on 1 event date/);assert.equal(out.split("A mat was brushed out.").length,2);
});
test("separated dates establish dated reports, never separate episode inference",()=>{
 const a=row("s1","A mat was brushed out."),b=row("s2","The old mat episode was discussed again.","2021-01-01T12:00:00Z");
 const out=renderHistorySynthesis(checked(theme("mat",[a,b]),[a,b]));assert.match(out,/2 selected saved reports on 2 event dates/);assert.doesNotMatch(out,/2 episodes|recurring mat/);
});
test("source-reported persistence and a genuinely reported trend stay attributed",()=>{
 const s=row("s1","The owner reported repeated itching that was worsening over three weeks.");
 assert.match(renderHistorySynthesis(checked(theme("itching",[s]),[s])),/“The owner reported repeated itching that was worsening over three weeks.”/);
});
test("negation and hypothetical clauses cannot be shortened into occurrences",()=>{
 for(const body of ["No itching was reported.","If itching returns, the owner will call the vet."]){const s=row("s1",body);const t=theme("itching",[s]);t[0].evidence[0].excerpt="itching";assert.equal(checked(t,[s]),null);assert.match(renderHistorySynthesis(checked(theme("itching",[s]),[s])),new RegExp(body.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));}
});
test("conflicting reports preserve both facts without resolving a diagnosis",()=>{
 const a=row("s1","The owner reported reduced appetite."),b=row("s2","Appetite was normal at the visit.","2020-01-05T12:00:00Z");
 const out=renderHistorySynthesis(checked(theme("appetite",[a,b]),[a,b]));assert.match(out,/reduced appetite/);assert.match(out,/Appetite was normal/);assert.doesNotMatch(out,/improved|resolved|persistent/);
});
test("omitted, foreign, changed-year and stale excerpts have no authority",()=>{
 const s=row("s1","A mat was brushed out.");
 assert.equal(validateHistorySynthesis(theme("mat",[s]),[s],[]),null);
 assert.equal(checked(theme("mat",[s]),[{...s,handle:"s2"}]),null);
 assert.equal(checked(theme("mat",[s]),[{...s,body:"A routine visit was recorded."}]),null);
});
test("two pets are labeled independently even when phrases match",()=>{
 const a=row("s1","A mat was brushed out."),b=row("s2","A mat was brushed out.",undefined,{petId:"b",petName:"Pet B"});
 const out=renderHistorySynthesis(checked(theme("mat",[a,b]),[a,b]));assert.match(out,/Pet A —/);assert.match(out,/Pet B —/);assert.doesNotMatch(out,/2 selected saved reports/);
});
test("sparse and empty evidence cannot assert whole-history absence",()=>{assert.equal(checked([{topic:"mat",evidence:[]}],[]),null);assert.equal(renderHistorySynthesis([]),"");const s=row("s1","No mat was seen today.");assert.match(renderHistorySynthesis(checked(theme("mat",[s]),[s])),/omitted periods may change/);});
test("unanchored headings cannot sneak in recurrence or diagnosis",()=>{const s=row("s1","A mat was brushed out.");const out=renderHistorySynthesis(checked(theme("Recurring worsening disease",[s]),[s]));assert.doesNotMatch(out,/Recurring worsening disease/);assert.match(out,/A mat was brushed out/);});
test("strict live schema supplies no unvalidated historical paraphrase field",()=>{const s=historySynthesisSchema(["s1"]);assert.deepEqual(s.items.required,["topic","evidence"]);assert.equal(s.items.additionalProperties,false);const schema=componentAnswerSchema({properties:{},required:[]},[{id:"t1"}],[{handle:"s1"}],[]);assert.ok(schema.properties.completion.items.required.includes("historySynthesis"));});
test("actual completion composer replaces unsupported recurrence but retains useful grounded content and partial disclosure",()=>{
 const s=row("s1","A mat was brushed out after the walk.");
 const plan=[{id:"t1",kind:"saved_content",needsHistory:true,needsOwnerFacts:false,recordMode:"collection",pets:[],missing:[],includeSourceDates:false,workflow:"none"}];
 const e={task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:["s1"],ownerFacts:[],historyFacts:[],historySynthesis:theme("mat",[s])};
 const reviewed=reviewComponentCompletion({sources:["s1"],components:[{kind:"saved",text:"Recurring mats worsened over the years.",sources:["s1"]}],completion:[e]},plan,[s],[]);
 const out=renderTaskCompletion({answer:"Recurring mats worsened over the years.",validatedParts:[{index:0,text:"Recurring mats worsened over the years."}],presentation:{}},reviewed.tasks,[s],null,[{scope:{goal:"complete_set"},sources:[{source:"s1"}],omitted:4}]);
 assert.doesNotMatch(out.answer,/Recurring mats worsened/);assert.match(out.answer,/brushed out after the walk/);assert.doesNotMatch(out.answer,/Saved history:.*source bodies were omitted/);assert.equal(out.taskCompletion[0].status,"partial");
});

test("a generated heading cannot invalidate exact evidence; case uses the original",()=>{const s=row("s1","A mat was brushed out.");assert.match(renderHistorySynthesis(checked(theme("MAT",[s]),[s])),/“mat”/);});
test("one malformed theme does not cancel independent verified themes",()=>{const s=row("s1","A mat was brushed out.");const d=[];const out=validateHistorySynthesis([...theme("mat",[s]),{topic:"Invented",evidence:[{source:"s1",excerpt:"Invented assertion."}]}],[s],["s1"],d);assert.equal(out.length,1);assert.deepEqual(d,["excerpt"]);});
test("exact partial text expands to the original full sentence preserving negation",()=>{const s=row("s1","The owner did not report repeated itching after the visit.");const t=theme("itching",[s]);t[0].evidence[0].excerpt="repeated itching after the visit.";const out=renderHistorySynthesis(checked(t,[s]));assert.match(out,/did not report repeated itching/);});

test("rendered historical facts prioritize retained binder anchors without increasing eight-source cap",async()=>{
 const {carryReadReferences}=await import("../app/lib/ask-read-only/references.mjs");
 const sources=Array.from({length:12},(_,i)=>({...row("s"+(i+1),"A verified original report."),id:"id"+i,ownerId:"owner"}));
 const request={kind:"history",pet:{id:"a",ownerId:"owner"},goal:"complete_set",from:"2020-01-01",to:"2020-12-31"};
 const refs=carryReadReferences([],[{request,sourceHandles:sources.map(s=>s.handle)}],sources,{sources:sources.map(s=>s.handle),quotes:sources.slice(0,8).map(s=>({source:s.handle})),calculations:[],historicalSupport:["s12","s11"]},"UTC");
 assert.equal(refs.entries[0].sources.length,8);assert.deepEqual(refs.entries[0].sources.slice(0,2).map(s=>s.id),["id11","id10"]);assert.equal(refs.entries[0].limited,true);
});

test("a grounded collection does not duplicate its quoted facts or unrequested full-body quote list",()=>{
 const s=row("s1","A mat was brushed out.");
 const t={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"collection",status:"partial",reason:"source_omitted",pets:[],missing:[],includeSourceDates:true,componentIndexes:[0],sources:["s1"],ownerFacts:[],historyFacts:[{source:"s1",excerpt:s.body}],historySynthesis:checked(theme("mat",[s]),[s])};
 const a=renderTaskCompletion({answer:"Unused generated prose.",validatedParts:[{index:0,text:"Unused generated prose."}],sources:["s1"],quotes:[{source:"s1",quote:s.body}],presentation:{}},[t],[s],null,[{scope:{goal:"complete_set"},sources:[{source:"s1"}],omitted:4}]);
 assert.equal(a.answer.split(s.body).length,2);assert.match(a.answer,/event 2020-01-03; recorded 2020-02-01/);assert.deepEqual(a.quotes,[]);assert.equal(a.taskCompletion[0].status,"partial");
});

test("a combined-history task cannot complete from fresh records alone despite prior reads",()=>{
 const a=row("s1","An earlier distinctive observation."),b=row("s2","A newly saved observation.","2021-01-01T12:00:00Z");
 const t={id:"t1",kind:"saved_continuation",needsHistory:true,recordMode:"collection",combineHistory:true,status:"complete",reason:"none",missing:[],componentIndexes:[0],sources:["s2"],ownerFacts:[],historyFacts:[],historySynthesis:checked(theme("observation",[b]),[a,b])};
 const cov=[{scope:{kind:"history",goal:"complete_set",evidenceRole:"retained_prior"},sources:[{source:"s1"}]},{scope:{kind:"history",goal:"complete_set",evidenceRole:"fresh_remainder"},sources:[{source:"s2"}]}];
 const input={answer:"Generated.",validatedParts:[{index:0,text:"Generated."}],sources:["s2"],presentation:{}};
 const failed=renderTaskCompletion(input,[t],[a,b],null,cov);assert.equal(failed.taskCompletion[0].status,"partial");assert.match(failed.answer,/both the earlier and newly fetched/);
 const supported=renderTaskCompletion({...input,sources:["s1","s2"]},[{...t,sources:["s1","s2"],historySynthesis:checked(theme("observation",[a,b]),[a,b])}],[a,b],null,cov);assert.equal(supported.taskCompletion[0].status,"complete");assert.match(supported.answer,/earlier distinctive/);assert.match(supported.answer,/newly saved/);
});

test("combined history is an explicit first-pass task contract and never a source-free permission",()=>{
 const t={id:"t1",kind:"saved_continuation",combineHistory:true,needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,recordMode:"collection",workflow:"none",pets:["p1"],reference:"r1",missing:[]};
 const ctx={pets:[{handle:"p1"}],references:[{reference:"r1",petHandle:"p1"}]};
 assert.equal(validateTaskPlan([t],ctx)[0].combineHistory,true);assert.equal(validateTaskPlan([{...t,combineHistory:false}],ctx)[0].combineHistory,false);
 assert.throws(()=>validateTaskPlan([{...t,needsHistory:false,recordMode:"none"}],ctx),/COMPONENT_CONTRACT/);
});
