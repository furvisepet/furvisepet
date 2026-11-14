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
 const out=renderHistorySynthesis(checked(theme("mat",[a,b]),[a,b]));assert.match(out,/2 selected saved reports with 1 distinct event timestamp/);assert.equal(out.split("A mat was brushed out.").length,2);
});
test("separated dates establish dated reports, never separate episode inference",()=>{
 const a=row("s1","A mat was brushed out."),b=row("s2","The old mat episode was discussed again.","2021-01-01T12:00:00Z");
 const out=renderHistorySynthesis(checked(theme("mat",[a,b]),[a,b]));assert.match(out,/2 selected saved reports with 2 distinct event timestamps/);assert.doesNotMatch(out,/2 episodes|recurring mat/);
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

test("complete single-record evidence does not inherit a prior collection omission status",()=>{
 const s=row("s1","A complete original historical observation.");
 const t={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"single",status:"complete",reason:"none",missing:[],componentIndexes:[0],sources:["s1"],ownerFacts:[],historyFacts:[],historySynthesis:checked(theme("historical observation",[s]),[s])};
 const a=renderTaskCompletion({answer:"Generated.",validatedParts:[{index:0,text:"Generated."}],sources:["s1"],presentation:{}},[t],[s],null,[{scope:{goal:"complete_set"},sources:[{source:"s1"}],unmet:["prior_source_selection_omitted"],omitted:0}]);
 assert.equal(a.taskCompletion[0].status,"complete");assert.equal(a.replyType,"answer");assert.doesNotMatch(a.answer,/Saved history: This part/);assert.match(a.answer,/complete original historical observation/);
});

test("synthesis citation labels follow published source-card order rather than model selection order",()=>{
 const a=row("s1","The first original observation."),b=row("s2","The second original observation.");
 const t={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"collection",status:"complete",reason:"none",missing:[],componentIndexes:[0],sources:["s2","s1"],ownerFacts:[],historyFacts:[{source:"s2",excerpt:b.body}],includeSourceDates:true,historySynthesis:checked(theme("second original",[b]),[a,b])};
 const out=renderTaskCompletion({answer:"Generated.",validatedParts:[{index:0,text:"Generated."}],sources:["s2","s1"],presentation:{}},[t],[a,b],null,[]);
 assert.ok(out.answer.includes("second original observation.” (Source 2)"));assert.ok(!out.answer.includes("second original observation.” (Source 1)"));
});

test("actual core keeps a verified single note complete while retaining inherited collection coverage",async()=>{
 const {runReadOnlyAsk}=await import("../app/lib/ask-read-only/core.mjs");
 const {decodeComponentSelection}=await import("../app/lib/ask-read-only/task-components.mjs");
 const {decodeClinicalSelection}=await import("../app/lib/ask-read-only/clinical-policy.mjs");
 const {createHash}=await import("node:crypto");
 const pet={id:"owned-private-pet-123456",ownerId:"owned",name:"Pet A",species:"cat"};
 const rows=Array.from({length:8},(_,i)=>({kind:"history",id:"owned-private-note-123456"+i,ownerId:"owned",petId:pet.id,body:"A complete original historical observation.",eventAt:"2020-01-03T12:00:00Z",recordedAt:"2020-01-04T12:00:00Z"}));
 const reference={version:1,entries:[{kind:"history",petId:pet.id,timeZone:"UTC",goal:"complete_set",from:"2020-01-01",to:"2020-12-31",recordedFrom:null,recordedTo:null,orderBy:"event",order:"asc",terms:[],limited:true,sources:rows.map(s=>({id:s.id,hash:createHash("sha256").update(s.body).digest("hex"),eventAt:s.eventAt,recordedAt:s.recordedAt}))}]};
 const safety={medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]};
 const plan=[{id:"t1",kind:"saved_content",combineHistory:false,needsHistory:true,needsOwnerFacts:false,includeSourceDates:true,recordMode:"single",workflow:"none",pets:["p1"],reference:"r1",missing:[]}];
 let calls=0,reads=0;
 const result=await runReadOnlyAsk({ownerId:"owned",selectedPetId:pet.id,pets:[pet],dialogue:[],question:"Quote that one complete January 2020 note exactly with both dates.",now:"2026-11-13T12:00:00Z",timeZone:"UTC",readReferences:reference},{
  read:async()=>{reads++;return {sources:rows,total:8,hasMore:false,scopeExhausted:true};},
  provider:async(req,phase)=>{calls++;if(phase==="read_selection")return decodeComponentSelection({safety,reads:[],draft:"",historyIntent:{requested:true,timeBasis:"event",pet:null},workflowIntent:"none",taskPlan:plan},req.tools,req.context,decodeClinicalSelection);
   return {components:[{kind:"saved",text:"An exact source-backed observation.",sources:["s1"]}],quotes:["s1"],sources:["s1"],calculations:[],replyType:"answer",presentation:{sourceDates:["s1"],contextRequired:false},clinicalReview:{assessment:safety,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:["s1"],ownerFacts:[],historyFacts:[],historySynthesis:[{topic:"historical observation",evidence:[{source:"s1",excerpt:rows[0].body}]}]}]};
  }
 });
 assert.equal(calls,2);assert.equal(reads,1);assert.equal(result.answer.taskCompletion[0].status,"complete");
 assert.equal(result.answer.limited,false,"verified single-record answer must not inherit collection-only publication limitations");
 assert.ok(result.coverage[0].unmet.includes("prior_source_selection_omitted"));assert.equal(result.readReferences.entries[0].limited,true);
});

test("event identity normalizes equivalent timezones without claiming distinct local calendar days",()=>{
 const a=row("s1","A saved report.","2020-01-03T00:30:00Z"),b=row("s2","A saved report.","2020-01-02T16:30:00-08:00");
 const same=renderHistorySynthesis(checked(theme("saved report",[a,b]),[a,b]));assert.ok(same.includes("2 selected saved reports with 1 distinct event timestamp"));
 const c={...b,eventAt:"2020-01-03T01:30:00Z"};const different=renderHistorySynthesis(checked(theme("saved report",[a,c]),[a,c]));assert.ok(different.includes("2 distinct event timestamps"));assert.ok(!different.includes("event dates"));
});

test("headings retain omitted negation and never promote conditional or negated frequency",()=>{
 const s=row("s1","No persistent digestive change was reported.");
 let out=renderHistorySynthesis(checked(theme("persistent digestive change",[s]),[s]));
 assert.match(out,/— “No persistent digestive change”/);assert.doesNotMatch(out,/— “persistent digestive change”/);
 for(const body of ["If recurring itching returns, the owner will call.","Recurring itching was not reported."]){
  const t=row("s2",body);out=renderHistorySynthesis(checked(theme("recurring itching",[t]),[t]));
  assert.doesNotMatch(out,/— “recurring itching”/i);assert.ok(out.includes(body));
 }
});
test("overlapping themes coalesce per pet without hiding distinct supported reports",()=>{
 const a=row("s1","Appetite was normal."),b=row("s2","Appetite was normal.","2020-04-01T12:00:00Z");
 const out=renderHistorySynthesis(checked([...theme("Appetite",[a]),...theme("Appetite",[b])],[a,b]));
 assert.equal(out.split(" — ").length-1,1);assert.match(out,/2 selected saved reports with 2 distinct event timestamps/);
 const other={...b,handle:"s3",petId:"b",petName:"Pet B"};
 assert.equal(renderHistorySynthesis(checked([...theme("Appetite",[a]),...theme("Appetite",[other])],[a,other])).split(" — ").length-1,2);
});
test("actual composer renders equivalent source-selection themes once across separate task components",()=>{
 const s=row("s1","Appetite was normal.");
 const tasks=[0,1].map(i=>({id:"t"+(i+1),kind:"saved_content",recordMode:"collection",needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,pets:["p1"],missing:[],workflow:"none",status:"complete",reason:"none",sources:["s1"],componentIndexes:[i],historyFacts:[],ownerFacts:[],historySynthesis:checked(theme("Appetite",[s]),[s])}));
 const out=renderTaskCompletion({answer:"duplicate",sources:["s1"],validatedParts:[{index:0,text:"first"},{index:1,text:"second"}],presentation:{}},tasks,[s],null,[]);
 assert.equal(out.answer.split(" — ").length-1,1);assert.equal(out.answer.split("Repeated mentions alone").length-1,1);assert.deepEqual(out.historicalSupport,["s1"]);
});

test("independent source selections retain each actually rendered anchor even when wording matches",()=>{
 const a=row("s1","Appetite was normal."),b=row("s2","Appetite was normal.","2021-01-03T12:00:00Z"),ss=[a,b];
 const tasks=ss.map((s,i)=>({id:"t"+(i+1),kind:"saved_content",recordMode:"collection",needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,pets:["p1"],missing:[],workflow:"none",status:"complete",reason:"none",sources:[s.handle],componentIndexes:[i],historyFacts:[],ownerFacts:[],historySynthesis:checked(theme("Appetite",[s]),[s])}));
 const out=renderTaskCompletion({answer:"two periods",sources:["s1","s2"],validatedParts:[{index:0,text:"first period"},{index:1,text:"second period"}],presentation:{}},tasks,ss,null,[]);
 assert.equal(out.answer.split(" — ").length-1,2);assert.deepEqual(out.historicalSupport,["s1","s2"]);
});

test("a representative sentence counts only exact complete admitted same-pet reports",()=>{
 const a=row("s1","No new skin concern was recorded.","2020-01-03T12:00:00Z",{id:"n1"});
 const b=row("s2",a.body,"2021-01-03T12:00:00Z",{id:"n2"});
 const omitted=row("s3",a.body,"2022-01-03T12:00:00Z",{id:"n3"});
 const foreign=row("s4",a.body,"2023-01-03T12:00:00Z",{id:"n4",petId:"b",petName:"Other pet"});
 const conditional=row("s5","If no new skin concern was recorded, ask the owner to confirm.","2024-01-03T12:00:00Z",{id:"n5"});
 const out=validateHistorySynthesis(theme("skin concern",[a]),[a,b,omitted,foreign,conditional],["s1","s2","s4","s5"]);
 const text=renderHistorySynthesis(out);assert.match(text,/2 selected saved reports with 2 distinct event timestamps/);assert.ok(text.includes(a.body));assert.doesNotMatch(text,/Other pet|3 selected|recurring|persistent skin/);assert.ok(!text.includes("event dates"));
});
test("replayed handles for one physical record do not inflate a representative report count",()=>{
 const a=row("s1","No new concern was reported.",undefined,{id:"same-owned-record"});
 const replay={...a,handle:"s2"};
 const text=renderHistorySynthesis(validateHistorySynthesis(theme("concern",[a]),[a,replay],["s1","s2"]));assert.match(text,/one selected saved report/);assert.doesNotMatch(text,/2 selected/);
});
