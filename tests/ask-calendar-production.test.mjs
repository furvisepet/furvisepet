import test from "node:test";
import assert from "node:assert/strict";
import {explicitCalendarScopes,explicitRequestedTimeBasis,recoverBoundedCalendarRead,recoverExplicitHistoryComparison,clarifyUnboundHistoryPronoun,namedPetsForHistory} from "../app/lib/ask-read-only/calendar-scope.mjs";
import {reconcileNamedProfileRead,runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {renderTaskCompletion} from "../app/lib/ask-read-only/task-components.mjs";

const pets=[{handle:"p1",name:"QA Juniper 20Y"},{handle:"p2",name:"QA Willow 20Y"}];
const safety={careContext:"none",medicationIntent:"none",currentEvents:[],conditionalEvents:[],eventAssessments:[],missingContext:["date"],referent:"essential_unknown"};
const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"single",pets:["p1"],reference:null,missing:["year","which_record"]};
const first={calls:[],text:"",historyIntent:{requested:true,timeBasis:"event",pet:"p1"},safety,taskPlan:[task]};
test("two named years yield two bounded, owner-matched event reads",()=>{
 const recovered=recoverBoundedCalendarRead(first,{question:"What toy did QA Juniper 20Y have in 2016 and what weight in 2026?"},pets);
 assert.ok(recovered);
 assert.deepEqual(recovered.first.calls.map(c=>{const a=JSON.parse(c.arguments);return [a.pet,a.from,a.to,a.query,a.orderBy]}),[
  ["p1","2016-01-01","2016-12-31",null,"event"],["p1","2026-01-01","2026-12-31",null,"event"]]);
 assert.equal(recovered.first.taskPlan[0].recordMode,"collection");
 assert.deepEqual(recovered.first.taskPlan[0].missing,[]);
});
test("year discovery does not broaden a day or guess an unnamed pet",()=>{
 assert.deepEqual(explicitCalendarScopes("May 14, 2011"),[{from:"2011-05-14",to:"2011-05-14",precision:"day"}]);
 assert.equal(recoverBoundedCalendarRead(first,{question:"What happened in 2016 and 2026?"},pets),null);
 assert.equal(recoverBoundedCalendarRead(first,{question:"Compare QA Juniper 20Y and QA Willow 20Y in 2016"},pets),null);
});
test("recorded-year question uses recorded bounds",()=>{
 const recovered=recoverBoundedCalendarRead({...first,historyIntent:{...first.historyIntent,timeBasis:"recorded"}},{question:"What was saved for QA Juniper 20Y in 2011?"},pets);
 assert.ok(recovered);
 const a=JSON.parse(recovered.first.calls[0].arguments);
 assert.equal(a.from,null);assert.equal(a.to,null);
 assert.equal(a.recordedFrom,"2011-01-01");assert.equal(a.recordedTo,"2011-12-31");
});
test("collection prose drops whole generated date sentence and retains verified source date",()=>{
 const source={handle:"s1",kind:"history",petName:"QA Willow 20Y",eventAt:"2021-07-18T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Stayed at the beach cabin."};
 const tasks=[{id:"t1",kind:"saved_content",needsHistory:true,recordMode:"collection",status:"complete",reason:"none",missing:[],componentIndexes:[0],sources:["s1"],historyFacts:[{source:"s1",excerpt:source.body}],ownerFacts:[],includeSourceDates:true}];
 const answer={answer:"",validatedParts:[{index:0,text:"She stayed at the beach cabin on 2021-07-18T19:00:00+00:00. The record describes a trip."}],presentation:{sourceDates:[]}};
 const result=renderTaskCompletion(answer,tasks,[source],null,[]);
 assert.match(result.answer,/The record describes a trip/);
 assert.match(result.answer,/event 2021-07-18/);
 assert.doesNotMatch(result.answer,/2021-07-18T19:00:00/);
 assert.doesNotMatch(result.answer,/-07-18T/);
});
test("restrictive model search is replaced by an explicit named-year window",()=>{
 const selected={...first,taskPlan:[{...task,missing:["which_record"]}],calls:[{id:"model-1",name:"search_saved_records",
  arguments:JSON.stringify({pet:"p1",from:"2011-01-01",to:"2011-12-31",query:"rabbit food",offset:0})}]};
 const recovered=recoverBoundedCalendarRead(selected,{question:"Did QA Juniper 20Y switch to rabbit or salmon food in 2011?"},pets);
 assert.ok(recovered);
 assert.equal(recovered.first.calls.length,1);
 const a=JSON.parse(recovered.first.calls[0].arguments);
 assert.equal(a.query,null);
 assert.equal(a.from,"2011-01-01");
 assert.equal(a.to,"2011-12-31");
 assert.equal(recoverBoundedCalendarRead({...selected,calls:[{...selected.calls[0],arguments:JSON.stringify({pet:"p2"})}]},
  {question:"Did QA Juniper 20Y switch food in 2011?"},pets),null);
});
test("two restrictive model calls recover as two bounded year reads",()=>{
 const calls=["2016","2026"].map((year,index)=>({id:"model-"+index,name:"search_saved_records",
  arguments:JSON.stringify({pet:"p1",from:year+"-01-01",to:year+"-12-31",query:"toy"})}));
 const recovered=recoverBoundedCalendarRead({...first,calls},{question:"What toy for QA Juniper 20Y in 2016 and what weight in 2026?"},pets);
 assert.ok(recovered);
 assert.equal(recovered.first.calls.length,2);
 assert.deepEqual(recovered.first.calls.map(c=>JSON.parse(c.arguments).query),[null,null]);
});
test("a unique inspected window quotes the original note when generated prose is generic",()=>{
 const source={handle:"s1",kind:"history",petName:"QA Marigold 20Y",eventAt:"2011-05-14T19:00:00Z",
  recordedAt:"2026-11-19T00:00:00Z",body:"Synthetic QA record: Marigold switched to salmon food."};
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"collection",status:"complete",reason:"none",
  missing:[],componentIndexes:[0],sources:["s1"],historyFacts:[],ownerFacts:[],includeSourceDates:true};
 const answer={answer:"",validatedParts:[{index:0,text:"I can read saved information, but I can't make changes or open pages through Ask."}],presentation:{sourceDates:[]}};
 const coverage=[{scope:{kind:"history",pet:source.petName,from:"2011-01-01",to:"2011-12-31"},
  sources:[{source:"s1"}],inspected:1,unmet:[],hasMore:false,hasPrevious:false,truncated:false,
  queryScopeExhausted:true,scopeExhausted:true}];
 const result=renderTaskCompletion(answer,[task],[source],null,coverage);
 assert.match(result.answer,/Marigold switched to salmon food/);
 assert.match(result.answer,/On 2011-05-14/);
 assert.doesNotMatch(result.answer,/can't make changes/);
 assert.equal(result.replyType,"answer");
 const incomplete=renderTaskCompletion(answer,[task],[source],null,[{...coverage[0],hasMore:true}]);
 assert.doesNotMatch(incomplete.answer,/Synthetic QA record/);
});
test("explicit event date is not an ambiguous recorded date",()=>{
 assert.equal(explicitRequestedTimeBasis("Give the event date."),"event");
 assert.equal(explicitRequestedTimeBasis("Give the saved date."),"recorded");
 assert.equal(explicitRequestedTimeBasis("Give event and recorded dates."),null);
 assert.equal(explicitRequestedTimeBasis("When did she stay there?"),null);
});

test("explicit named pet resolves a mistaken missing-pet calendar plan",()=>{
 const selected={...first,historyIntent:{requested:true,timeBasis:"event",pet:null},
  safety:{...safety,missingContext:["pet","date"]},
  taskPlan:[{...task,pets:[],missing:["pet","year","which_record"]}]};
 const recovered=recoverBoundedCalendarRead(selected,
  {question:"Where did QA Willow 20Y stay in 2021? Give the event date."},pets);
 assert.ok(recovered);
 assert.deepEqual(recovered.first.taskPlan[0].pets,["p2"]);
 assert.deepEqual(recovered.first.taskPlan[0].missing,["which_record"]);
 assert.equal(JSON.parse(recovered.first.calls[0].arguments).pet,"p2");
 assert.equal(recoverBoundedCalendarRead(selected,{question:"Where did she stay in 2021?"},pets),null);
});
test("failed two-window answer uses both complete originals and no capability prose",()=>{
 const sources=[
  {handle:"s1",kind:"history",petName:"QA Saffron 20Y",eventAt:"2011-05-14T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Synthetic QA record: Saffron switched to rabbit food."},
  {handle:"s2",kind:"history",petName:"QA Saffron 20Y",eventAt:"2021-07-18T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Synthetic QA record: Saffron stayed at the orchard cottage."}
 ];
 const coverage=sources.map((source,index)=>({scope:{kind:"history",pet:source.petName,from:index?"2021-01-01":"2011-01-01",to:index?"2021-12-31":"2011-12-31"},
  sources:[{source:source.handle}],inspected:1,unmet:[],hasMore:false,hasPrevious:false,truncated:false,queryScopeExhausted:true,scopeExhausted:true}));
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p1"],status:"partial",reason:"not_answered",missing:[],componentIndexes:[0],sources:["s2"],historyFacts:[],ownerFacts:[],includeSourceDates:true};
 const answer={answer:"I can read saved information, but I can't make changes or open pages through Ask.",replyType:"partial",sources:["s2"],quotes:[{source:"s2",quote:sources[1].body}],presentation:{sourceDates:[]}};
 const scopes=[{from:"2011-01-01",to:"2011-12-31"},{from:"2021-01-01",to:"2021-12-31"}];
 const result=renderTaskCompletion(answer,[task],sources,null,coverage,scopes);
 assert.match(result.answer,/rabbit food/);assert.match(result.answer,/orchard cottage/);
 assert.match(result.answer,/2011-05-14/);assert.match(result.answer,/2021-07-18/);
 assert.doesNotMatch(result.answer,/can't make changes/);
 assert.deepEqual(result.sources,["s2","s1"]);assert.equal(result.replyType,"answer");
 assert.deepEqual(result.presentation.sourceDates,[]);
 const incomplete=renderTaskCompletion(answer,[task],sources,null,[coverage[0],{...coverage[1],hasMore:true}],scopes);
 assert.doesNotMatch(incomplete.answer,/rabbit food/);
 const missingWindow=renderTaskCompletion(answer,[task],sources,null,[coverage[1]],scopes);
 assert.doesNotMatch(missingWindow.answer,/rabbit food/);
 assert.notEqual(missingWindow.taskCompletion?.[0]?.status,"complete");
});
test("verified event day already in prose does not append raw timestamps",()=>{
 const source={handle:"s1",kind:"history",petName:"QA Marigold 20Y",eventAt:"2011-05-14T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Synthetic QA record: Marigold switched to salmon food."};
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"single",pets:["p1"],status:"complete",reason:"none",missing:[],componentIndexes:[0],sources:["s1"],historyFacts:[],ownerFacts:[],includeSourceDates:true};
 const answer={answer:"Marigold switched to salmon food on 2011-05-14.",replyType:"answer",sources:["s1"],quotes:[],presentation:{sourceDates:[]}};
 const result=renderTaskCompletion(answer,[task],[source],null,[]);
 assert.deepEqual(result.presentation.sourceDates,[]);
});

test("named event date recovers a profile-only first pass with missing year",()=>{
 const selected={...first,historyIntent:{requested:false,timeBasis:"event",pet:null},
  safety:{...safety,missingContext:["pet","year"]},
  taskPlan:[{...task,pets:[],missing:["pet","year","which_record"]}],
  calls:[{id:"profile",name:"read_pet_profile",arguments:JSON.stringify({pet:"p2"})}]};
 const recovered=recoverBoundedCalendarRead(selected,
  {question:"Where did QA Willow 20Y stay in 2021? Give the event date."},pets);
 assert.ok(recovered);
 assert.equal(recovered.first.calls.length,1);
 assert.equal(recovered.first.calls[0].name,"search_saved_records");
 assert.equal(JSON.parse(recovered.first.calls[0].arguments).from,"2021-01-01");
});
test("a generated app execution claim yields exact bounded note instead",()=>{
 const source={handle:"s1",kind:"history",petName:"QA Marigold 20Y",eventAt:"2011-05-14T19:00:00Z",
  recordedAt:"2026-11-19T00:00:00Z",body:"Synthetic QA record: Marigold switched to salmon food."};
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"single",pets:["p1"],status:"complete",reason:"none",
  missing:[],componentIndexes:[0],sources:["s1"],historyFacts:[],ownerFacts:[],includeSourceDates:true};
 const answer={answer:"I opened the history page. I can help with that.",replyType:"answer",sources:["s1"],quotes:[],presentation:{sourceDates:[]}};
 const coverage=[{scope:{kind:"history",pet:source.petName,from:"2011-01-01",to:"2011-12-31"},sources:[{source:"s1"}],
  inspected:1,unmet:[],hasMore:false,hasPrevious:false,truncated:false,queryScopeExhausted:true,scopeExhausted:true}];
 const result=renderTaskCompletion(answer,[task],[source],null,coverage,[{from:"2011-01-01",to:"2011-12-31"}]);
 assert.match(result.answer,/salmon food/);
 assert.doesNotMatch(result.answer,/opened the history page|I can help with that/);
 assert.equal(result.taskCompletion[0].status,"complete");
});

test("short-note recovery answers the present-state inference without changing source text",()=>{
 const source={handle:"s1",kind:"history",petName:"Example Cat",eventAt:"2014-06-16T19:00:00Z",
  recordedAt:"2026-11-19T00:00:00Z",body:"The cat slept in the sunroom during the visit."};
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"single",pets:["p1"],
  status:"partial",reason:"not_answered",missing:[],componentIndexes:[0],sources:["s1"],
  historyFacts:[],ownerFacts:[],includeSourceDates:false};
 const answer={answer:"I couldn't complete the answer.",replyType:"partial",sources:["s1"],
  quotes:[],presentation:{sourceDates:[]}};
 const coverage=[{scope:{kind:"history",pet:source.petName,from:"2014-01-01",to:"2014-12-31"},
  sources:[{source:"s1"}],inspected:1,unmet:[],hasMore:false,hasPrevious:false,truncated:false,
  queryScopeExhausted:true,scopeExhausted:true}];
 const scope=[{from:"2014-01-01",to:"2014-12-31"}];
 const current=renderTaskCompletion(answer,[task],[source],null,coverage,scope,
  "What did the old entry report, and can we assume it is still true?");
 assert.match(current.answer,/sunroom during the visit/);
 assert.match(current.answer,/past report; by itself, it cannot confirm what is true now/);
 assert.equal(current.verifiedSourceText,
  "The saved note for Example Cat about 2014-06-16 says: \u201cThe cat slept in the sunroom during the visit.\u201d");
 const historical=renderTaskCompletion(answer,[task],[source],null,coverage,scope,
  "What did the 2014 entry report?");
 assert.equal(historical.answer,historical.verifiedSourceText);
});

test("two saved-history tasks recover both exact bounded notes",()=>{
 const sources=[
  {handle:"s1",kind:"history",petName:"QA Saffron 20Y",eventAt:"2011-05-14T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Synthetic QA record: Saffron changed to rabbit food; no salmon switch was recorded."},
  {handle:"s2",kind:"history",petName:"QA Saffron 20Y",eventAt:"2021-07-18T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Synthetic QA record: Saffron stayed at the orchard cottage and avoided the lake house."}
 ];
 const coverage=sources.map((source,index)=>({scope:{kind:"history",pet:source.petName,
  from:index?"2021-01-01":"2011-01-01",to:index?"2021-12-31":"2011-12-31"},
  sources:[{source:source.handle}],inspected:1,unmet:[],hasMore:false,hasPrevious:false,truncated:false,
  queryScopeExhausted:true,scopeExhausted:true}));
 const tasks=sources.map((source,index)=>({id:"t"+(index+1),kind:"saved_content",needsHistory:true,
  recordMode:"single",pets:["p1"],status:"partial",reason:"not_answered",missing:[],
  componentIndexes:[index],sources:[source.handle],historyFacts:[],ownerFacts:[],includeSourceDates:true}));
 const answer={answer:"I can read saved information, but I can’t make changes or open pages through Ask.",
  replyType:"partial",sources:["s2"],quotes:[],presentation:{sourceDates:[]}};
 const scopes=coverage.map(row=>({from:row.scope.from,to:row.scope.to}));
 const result=renderTaskCompletion(answer,tasks,sources,null,coverage,scopes);
 assert.match(result.answer,/rabbit food/);assert.match(result.answer,/orchard cottage/);
 assert.match(result.answer,/2011-05-14/);assert.match(result.answer,/2021-07-18/);
 assert.equal(result.verifiedSourceText,result.answer);
 assert.deepEqual(result.taskCompletion.map(t=>t.status),["complete","complete"]);
 const incomplete=renderTaskCompletion(answer,tasks,sources,null,[coverage[0],{...coverage[1],hasMore:true}],scopes);
 assert.notEqual(incomplete.verifiedSourceText,incomplete.answer);
});

test("saved event and day phrasing recovers an explicitly named year",()=>{
 const selected={...first,historyIntent:{requested:false,timeBasis:"unknown",pet:null},
  safety:{...safety,missingContext:["pet","year","date_meaning"]},
  taskPlan:[{...task,pets:[],missing:["pet","year","date_meaning","which_record"]}],
  calls:[]};
 const question="In QA Juniper 20Y’s 2026 saved event, what weight is noted and what day belongs to it?";
 const basis=explicitRequestedTimeBasis(question);
 assert.equal(basis,"event");
 const reconciled={...selected,historyIntent:{...selected.historyIntent,requested:true,timeBasis:basis},
  taskPlan:selected.taskPlan.map(t=>({...t,missing:t.missing.filter(k=>k!=="date_meaning")}))};
 const recovered=recoverBoundedCalendarRead(reconciled,{question},pets);
 assert.ok(recovered);
 assert.deepEqual(recovered.first.taskPlan[0].missing,["which_record"]);
 assert.equal(JSON.parse(recovered.first.calls[0].arguments).from,"2026-01-01");
 const saved=recoverBoundedCalendarRead(reconciled,{question:"What day was QA Juniper 20Y’s 2026 note saved?"},pets);
 assert.ok(saved);
 assert.equal(JSON.parse(saved.first.calls[0].arguments).recordedFrom,"2026-01-01");
});
test("two requested years do not require choosing one saved result",()=>{
 const sources=[
  {handle:"s1",kind:"history",petName:"QA Saffron 20Y",eventAt:"2011-05-14T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Synthetic QA record: Saffron changed to rabbit food."},
  {handle:"s2",kind:"history",petName:"QA Saffron 20Y",eventAt:"2021-07-18T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Synthetic QA record: Saffron stayed at the orchard cottage."}
 ];
 const coverage=sources.map((source,index)=>({scope:{kind:"history",pet:source.petName,
  from:index?"2021-01-01":"2011-01-01",to:index?"2021-12-31":"2011-12-31"},
  sources:[{source:source.handle}],inspected:1,unmet:[],hasMore:false,hasPrevious:false,truncated:false,
  queryScopeExhausted:true,scopeExhausted:true}));
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"single",pets:["p1"],
  status:"unresolved",reason:"missing_context",missing:["which_record"],componentIndexes:[],
  sources:["s1","s2"],historyFacts:[],ownerFacts:[],includeSourceDates:true};
 const answer={answer:"Which saved result should I use?",replyType:"clarification",sources:["s1","s2"],
  quotes:[],presentation:{sourceDates:[]}};
 const scopes=coverage.map(row=>({from:row.scope.from,to:row.scope.to}));
 const result=renderTaskCompletion(answer,[task],sources,null,coverage,scopes);
 assert.match(result.answer,/rabbit food/);assert.match(result.answer,/orchard cottage/);
 assert.equal(result.taskCompletion[0].status,"complete");
 assert.doesNotMatch(result.answer,/Which saved result/);
 const oneYear=renderTaskCompletion(answer,[task],sources,null,coverage,[scopes[0]]);
 assert.notEqual(oneYear.taskCompletion[0].status,"complete");
});
test("publication-changing historical wording uses the verified original",()=>{
 const source={handle:"s1",kind:"history",petName:"QA Marigold 20Y",eventAt:"2011-05-14T19:00:00Z",
  recordedAt:"2026-11-19T00:00:00Z",body:"Synthetic QA record: Marigold changed to salmon food; no rabbit food switch was recorded."};
 const coverage=[{scope:{kind:"history",pet:source.petName,from:"2011-05-01",to:"2011-05-31"},
  sources:[{source:"s1"}],inspected:1,unmet:[],hasMore:false,hasPrevious:false,truncated:false,
  queryScopeExhausted:true,scopeExhausted:true}];
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"single",pets:["p1"],
  status:"complete",reason:"none",missing:[],componentIndexes:[0],sources:["s1"],
  historyFacts:[],ownerFacts:[],includeSourceDates:true};
 const answer={answer:"The entry says Marigold changed to salmon food, and no rabbit food switch was recorded.",
  replyType:"answer",sources:["s1"],quotes:[],presentation:{sourceDates:[]}};
 const result=renderTaskCompletion(answer,[task],[source],null,coverage,[{from:"2011-05-01",to:"2011-05-31"}]);
 assert.match(result.answer,/about 2011-05-14/);
 assert.equal(result.verifiedSourceText,result.answer);
});

test("new conversation asks which pet an unbound pronoun means",()=>{
 const question="In 2015, what happened to her?";
 const selected={...first,text:"A saved record was not found.",
  taskPlan:[{...task,pets:["p1"],missing:[]}],
  calls:[{id:"wrong-pet",name:"search_saved_records",arguments:JSON.stringify({pet:"p1"})}]};
 const context={question,dialogue:[],references:[]};
 const guarded=clarifyUnboundHistoryPronoun(selected,context,pets);
 assert.deepEqual(guarded.calls,[]);
 assert.deepEqual(guarded.taskPlan[0].pets,[]);
 assert.deepEqual(guarded.taskPlan[0].missing,["pet"]);
 assert.equal(guarded.text,"");
 assert.equal(clarifyUnboundHistoryPronoun(selected,{...context,question:"What happened to QA Juniper 20Y in 2015? Here is her note."},pets),selected);
 assert.equal(clarifyUnboundHistoryPronoun(selected,{...context,dialogue:[{role:"user",text:"I mean Juniper."}]},pets),selected);
});

test("fresh dated saved-note pronoun uses the selected pet and bounded year",()=>{
 const selected={...first,text:"Which pet?",safety:{...safety,missingContext:["pet"]},
  taskPlan:[{...task,pets:[],missing:["pet","which_record"]}],
  calls:[{id:"wrong-pet",name:"search_saved_records",arguments:JSON.stringify({pet:"p2"})}]};
 const context={question:"What did her saved note from 2006 say?",selectedPet:"p1",dialogue:[],references:[]};
 const bound=clarifyUnboundHistoryPronoun(selected,context,pets);
 assert.deepEqual(bound.taskPlan[0].pets,["p1"]);
 assert.deepEqual(bound.taskPlan[0].missing,["which_record"]);
 assert.equal(bound.safety.referent,"clear");
 assert.deepEqual(JSON.parse(bound.calls[0].arguments),{
  pet:"p1",from:"2006-01-01",to:"2006-12-31",goal:"exact_quote",alternatives:[],
  recordedFrom:null,recordedTo:null,orderBy:"event",query:null,offset:0,order:"asc"
 });
 const competing=clarifyUnboundHistoryPronoun(selected,{...context,question:"What did her vet's saved note from 2006 say?"},pets);
 assert.deepEqual(competing.calls,[]);
 assert.deepEqual(competing.taskPlan[0].missing,["pet","which_record"]);
});

test("unbound history pronoun publishes a pointed pet clarification",()=>{
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"single",pets:[],
  status:"unresolved",reason:"source_unavailable",missing:["pet"],componentIndexes:[],
  sources:[],historyFacts:[],ownerFacts:[],includeSourceDates:false};
 const answer={answer:"No verified source was found.",replyType:"partial",sources:[],quotes:[],
  presentation:{sourceDates:[],contextRequired:false}};
 const result=renderTaskCompletion(answer,[task],[],null,[]);
 assert.equal(result.answer,"Which pet should I use?");
 assert.equal(result.replyType,"clarification");
});

test("historical comparison defaults to event years despite a recorded-axis draft",()=>{
 const selected={...first,historyIntent:{...first.historyIntent,timeBasis:"recorded"},
  safety:{...safety,missingContext:["date_meaning"]},
  taskPlan:[{...task,pets:["p2"],recordMode:"collection",missing:["date_meaning"]}]};
 const recovered=recoverBoundedCalendarRead(selected,
  {question:"Compare what QA Willow 20Y's notes say in 2006 and 2021. What changed?"},pets);
 assert.ok(recovered);
 assert.equal(recovered.first.historyIntent.timeBasis,"event");
 assert.deepEqual(recovered.first.calls.map(call=>{
  const args=JSON.parse(call.arguments);return [args.from,args.to,args.recordedFrom,args.orderBy];
 }),[["2006-01-01","2006-12-31",null,"event"],["2021-01-01","2021-12-31",null,"event"]]);
});
test("explicit save-time questions retain recorded bounds",()=>{
 const selected={...first,historyIntent:{...first.historyIntent,timeBasis:"event"}};
 for(const question of ["What was saved for QA Juniper 20Y in 2011?","Which notes did I save in 2011 for QA Juniper 20Y?"]){
  const recovered=recoverBoundedCalendarRead(selected,{question},pets);
  assert.ok(recovered);
  const args=JSON.parse(recovered.first.calls[0].arguments);
  assert.equal(args.from,null);assert.equal(args.recordedFrom,"2011-01-01");
  assert.equal(args.orderBy,"recorded");
 }
});
test("a saved note from a historical year does not mean it was saved then",()=>{
 const selected={...first,historyIntent:{...first.historyIntent,timeBasis:"recorded"}};
 const recovered=recoverBoundedCalendarRead(selected,
  {question:"What did QA Juniper 20Y's saved note from 2006 say?"},pets);
 assert.ok(recovered);
 const args=JSON.parse(recovered.first.calls[0].arguments);
 assert.equal(args.from,"2006-01-01");assert.equal(args.recordedFrom,null);
});
test("partial history says the limit once without internal verification phrasing",()=>{
 const source={handle:"s1",kind:"history",petName:"QA Willow 20Y",eventAt:"2021-07-18T12:00:00Z",
  recordedAt:"2026-11-19T12:00:00Z",body:"Willow played indoors."};
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p2"],
  status:"complete",reason:"none",missing:[],componentIndexes:[0],sources:["s1"],historyFacts:[],ownerFacts:[],includeSourceDates:false};
 const answer={answer:"",validatedParts:[{index:0,text:"The returned notes describe indoor play. The search was partial."}],
  presentation:{sourceDates:[]},quotes:[]};
 const coverage=[{scope:{kind:"history",pet:source.petName,goal:"complete_set"},sources:[{source:"s1"}],
  omitted:1,unmet:["evidence_omitted"],hasMore:false,hasPrevious:false,truncated:true}];
 const result=renderTaskCompletion(answer,[task],[source],null,coverage);
 assert.match(result.answer,/search was partial/);
 assert.doesNotMatch(result.answer,/source bodies|generated date-specific|Saved history:/);
 assert.equal(result.taskCompletion[0].status,"partial");
});
test("one task's partial caveat does not hide another task's source limit",()=>{
 const source={handle:"s1",kind:"history",petName:"QA Willow 20Y",eventAt:"2021-07-18T12:00:00Z",
  recordedAt:"2026-11-19T12:00:00Z",body:"Willow played indoors."};
 const tasks=[
  {id:"t1",kind:"general_guidance",needsHistory:false,recordMode:"none",status:"complete",reason:"none",
   missing:[],componentIndexes:[0],sources:[],historyFacts:[],ownerFacts:[]},
  {id:"t2",kind:"saved_content",needsHistory:true,recordMode:"collection",status:"complete",reason:"none",
   missing:[],componentIndexes:[1],sources:["s1"],historyFacts:[],ownerFacts:[],includeSourceDates:false}
 ];
 const answer={answer:"",validatedParts:[{index:0,text:"This general guidance is partial."},
  {index:1,text:"Willow's notes mention indoor play."}],presentation:{sourceDates:[]},quotes:[]};
 const coverage=[{scope:{kind:"history",pet:source.petName,goal:"complete_set"},sources:[{source:"s1"}],
  omitted:1,unmet:["evidence_omitted"],hasMore:false,hasPrevious:false,truncated:true}];
 const result=renderTaskCompletion(answer,tasks,[source],null,coverage);
 assert.match(result.answer,/Saved history: I could review only part of the saved history/);
});

test("a unique familiar pet name resolves historical years without guessing a shared name",()=>{
 assert.deepEqual(namedPetsForHistory("Compare Willow in 2006 and 2021",pets).map(p=>p.handle),["p2"]);
 assert.deepEqual(namedPetsForHistory("Compare QA Willow 20Y in 2006 and 2021",pets).map(p=>p.handle),["p2"]);
 const overlapping=[...pets,{handle:"p3",name:"Willow Rose"}];
 assert.deepEqual(namedPetsForHistory("What happened to Willow in 2006?",overlapping),[]);
 const recovered=recoverBoundedCalendarRead({...first,taskPlan:[{...task,pets:["p2"],missing:["which_record"]}]},
  {question:"How do Willow's arrival note in 2006 and trip note in 2021 differ?"},pets);
 assert.ok(recovered);
 assert.deepEqual(recovered.first.calls.map(call=>JSON.parse(call.arguments).from),["2006-01-01","2021-01-01"]);
 assert.deepEqual(recovered.first.taskPlan[0].missing,[]);
 assert.equal(recoverBoundedCalendarRead(first,{question:"Compare Willow and Juniper in 2006"},pets),null);
});

test("a sourced comparison keeps its undated synthesis and receives verified dates",()=>{
 const sources=[
  {handle:"s1",kind:"history",petName:"QA Willow 20Y",eventAt:"2006-04-12T12:00:00Z",recordedAt:"2026-11-19T12:00:00Z",body:"Willow arrived with a violet collar."},
  {handle:"s2",kind:"history",petName:"QA Willow 20Y",eventAt:"2021-07-18T12:00:00Z",recordedAt:"2026-11-19T12:00:00Z",body:"Willow stayed at the beach cabin."}
 ];
 const coverage=sources.map((source,index)=>({scope:{kind:"history",pet:source.petName,from:index?"2021-01-01":"2006-01-01",to:index?"2021-12-31":"2006-12-31"},
  sources:[{source:source.handle}],inspected:1,unmet:[],hasMore:false,hasPrevious:false,truncated:false,queryScopeExhausted:true,scopeExhausted:true}));
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p2"],
  status:"complete",reason:"none",missing:[],componentIndexes:[0],sources:["s1","s2"],
  historyFacts:[],ownerFacts:[],includeSourceDates:true};
 const answer={answer:"The earlier record is about Willow arriving with a collar, while the later one describes a cabin trip. These are different events.",
  validatedParts:[{index:0,text:"The earlier record is about Willow arriving with a collar, while the later one describes a cabin trip. These are different events."}],
  replyType:"answer",sources:["s1","s2"],quotes:[],presentation:{sourceDates:[],contextRequired:false}};
 const result=renderTaskCompletion(answer,[task],sources,null,coverage,[{from:"2006-01-01",to:"2006-12-31"},{from:"2021-01-01",to:"2021-12-31"}]);
 assert.match(result.answer,/different events/);
 assert.match(result.answer,/event 2006-04-12/);
 assert.match(result.answer,/event 2021-07-18/);
 assert.equal(result.replyType,"answer");
 assert.match(result.verifiedSourceText,/violet collar/);
 assert.match(result.verifiedSourceText,/beach cabin/);
});

test("an incidental non-history task cannot hide a complete two-period comparison",()=>{
 const sources=[
  {handle:"s1",kind:"history",petName:"QA Saffron 20Y",eventAt:"2011-05-14T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Saffron changed to rabbit food."},
  {handle:"s2",kind:"history",petName:"QA Saffron 20Y",eventAt:"2021-07-18T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Saffron stayed at the orchard cottage."}
 ];
 const scopes=[{from:"2011-01-01",to:"2011-12-31"},{from:"2021-01-01",to:"2021-12-31"}];
 const coverage=sources.map((source,index)=>({scope:{kind:"history",pet:source.petName,...scopes[index]},
  sources:[{source:source.handle}],inspected:1,unmet:[],hasMore:false,hasPrevious:false,truncated:false,queryScopeExhausted:true,scopeExhausted:true}));
 const saved={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p1"],
  status:"partial",reason:"not_answered",missing:[],componentIndexes:[0],sources:["s2"],historyFacts:[],ownerFacts:[],includeSourceDates:false};
 const extra={id:"t2",kind:"general_guidance",needsHistory:false,recordMode:"none",pets:[],
  status:"complete",reason:"none",missing:[],componentIndexes:[1],sources:[],historyFacts:[],ownerFacts:[],includeSourceDates:false};
 const answer={answer:"I can read saved information, but I can't make changes or open pages through Ask.",
  replyType:"partial",sources:["s2"],quotes:[{source:"s2",quote:sources[1].body}],presentation:{sourceDates:[]}};
 const result=renderTaskCompletion(answer,[saved,extra],sources,null,coverage,scopes,
  "How do Saffron's 2011 and 2021 saved entries differ?");
 assert.match(result.answer,/rabbit food/);assert.match(result.answer,/orchard cottage/);
 assert.doesNotMatch(result.answer,/I can read saved information/);
 assert.equal(result.taskCompletion[0].status,"complete");
 const spuriousConcern=renderTaskCompletion(answer,[saved,extra],sources,
  {active:true,decision:false,current:[],conditional:[],currentConcern:true,summaryContext:false},
  coverage,scopes,"How do Saffron's 2011 and 2021 saved entries differ?");
 assert.match(spuriousConcern.answer,/rabbit food/);
 assert.match(spuriousConcern.answer,/orchard cottage/);
 assert.doesNotMatch(spuriousConcern.answer,/I can read saved information/);
 const realClinical=renderTaskCompletion(answer,[saved,extra],sources,
  {active:true,decision:false,current:["current_symptom"],conditional:[],currentConcern:true,summaryContext:false},
  coverage,scopes,"How do Saffron's 2011 and 2021 saved entries differ?");
 assert.equal(realClinical.verifiedSourceText,undefined);
 const incomplete=renderTaskCompletion(answer,[saved,extra],sources,null,[coverage[0],{...coverage[1],hasMore:true}],scopes,
  "How do Saffron's 2011 and 2021 saved entries differ?");
 assert.equal(incomplete.verifiedSourceText,undefined);
});

test("a partially selected history fact fills the other fully checked window",()=>{
 const sources=[
  {handle:"s1",kind:"history",petName:"QA Saffron 20Y",eventAt:"2011-05-14T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Saffron changed to rabbit food; no turkey food switch was recorded."},
  {handle:"s2",kind:"history",petName:"QA Saffron 20Y",eventAt:"2021-07-18T19:00:00Z",recordedAt:"2026-11-19T00:00:00Z",body:"Saffron stayed at the orchard cottage and avoided the lake house."}
 ];
 const scopes=[{from:"2011-01-01",to:"2011-12-31"},{from:"2021-01-01",to:"2021-12-31"}];
 const coverage=sources.map((source,index)=>({scope:{kind:"history",pet:source.petName,...scopes[index]},
  sources:[{source:source.handle}],inspected:1,unmet:[],hasMore:false,hasPrevious:false,truncated:false,queryScopeExhausted:true,scopeExhausted:true}));
 const task={id:"t1",kind:"saved_content",needsHistory:true,recordMode:"collection",pets:["p1"],
  status:"complete",reason:"none",missing:[],componentIndexes:[0],sources:["s1","s2"],
  historyFacts:[{source:"s2",excerpt:sources[1].body}],ownerFacts:[],includeSourceDates:false};
 const answer={answer:"These notes describe different situations rather than the same event.",
  validatedParts:[{index:0,kind:"saved",text:"These notes describe different situations rather than the same event."}],
  replyType:"answer",sources:["s1","s2"],quotes:[{source:"s1",quote:sources[0].body}],presentation:{sourceDates:[]}};
 const result=renderTaskCompletion(answer,[task],sources,null,coverage,scopes,
  "In Saffron's saved history, what was happening in 2011 versus 2021?");
 assert.match(result.answer,/rabbit food/);assert.match(result.answer,/orchard cottage/);
 assert.match(result.verifiedSourceText,/rabbit food/);
 assert.match(result.verifiedSourceText,/orchard cottage/);
 const partial=renderTaskCompletion(answer,[task],sources,null,[coverage[0],{...coverage[1],hasMore:true}],scopes,
  "In Saffron's saved history, what was happening in 2011 versus 2021?");
 assert.doesNotMatch(partial.verifiedSourceText??"",/rabbit food/);
});

test("a plain named profile lookup needs one owned profile read and one task",()=>{
 const q="Tell me Dune's saved profile age and current food, briefly.";
 const pet={handle:"dune",name:"Dune"};
 const selection={calls:[],text:"Which pet should I use?",safety:{...safety,missingContext:["pet"]},
  taskPlan:[{...task,id:"t1",pets:[],missing:["pet"]},
   {id:"t2",kind:"general_guidance",needsHistory:false,recordMode:"none",pets:[],missing:[]}]};
 const fixed=reconcileNamedProfileRead(selection,{question:q},[pet]);
 assert.ok(fixed);
 assert.equal(fixed.taskPlan.length,1);
 assert.deepEqual(fixed.taskPlan[0].pets,["dune"]);
 assert.deepEqual(fixed.taskPlan[0].missing,[]);
 assert.equal(fixed.calls[0].name,"read_pet_profile");
 assert.deepEqual(JSON.parse(fixed.calls[0].arguments),{pet:"dune"});
 const diet=reconcileNamedProfileRead(selection,{question:"What does Echo's profile list for age and diet?"},[{handle:"echo",name:"Echo"}]);
 assert.equal(JSON.parse(diet.calls[0].arguments).pet,"echo");
 assert.equal(reconcileNamedProfileRead(selection,{question:"What does Dune's profile say about food history?"},[pet]),null);
 assert.equal(reconcileNamedProfileRead(selection,{question:"Is Dune's food safe based on the profile?"},[pet]),null);
});

test("verified profile fields reconcile a false partial completion without hiding a missing field",()=>{
 const source={handle:"s1",kind:"profile",petName:"Echo",body:JSON.stringify({age_value:10,age_unit:"years",current_food:"sensitive stomach turkey kibble"})};
 const task={id:"t1",kind:"saved_content",recordMode:"single",status:"partial",reason:"not_answered",missing:[],sources:["s1"],componentIndexes:[0],historyFacts:[],ownerFacts:[],needsHistory:true,pets:["echo"]};
 const answer={answer:"Echo eats sensitive stomach turkey kibble and is 10 years old.",replyType:"answer",sources:["s1"],quotes:[],presentation:{sourceDates:[]},validatedParts:[{index:0,text:"Echo eats sensitive stomach turkey kibble and is 10 years old."}]};
 const complete=renderTaskCompletion(answer,[task],[source],null,[],[],"What does Echo's profile list for her diet and age?");
 assert.equal(complete.replyType,"answer");
 assert.equal(complete.taskCompletion[0].status,"complete");
 assert.doesNotMatch(complete.answer,/couldn't complete/);
 const mislabeled=renderTaskCompletion({...answer,replyType:"partial"},[task],[source],null,[],[],"What does Echo's profile list for her diet and age?");
 assert.equal(mislabeled.replyType,"answer");
 const limited=renderTaskCompletion({...answer,validatedParts:[{index:0,kind:"saved",text:answer.answer},{index:1,kind:"limitation",text:"I cannot verify more."}]},[task],[source],null,[],[],"What does Echo's profile list for her diet and age?");
 assert.equal(limited.taskCompletion[0].status,"partial");
 const missing=renderTaskCompletion({...answer,answer:"Echo is 10 years old.",validatedParts:[{index:0,text:"Echo is 10 years old."}]},[task],[source],null,[],[],"What does Echo's profile list for her diet and age?");
 assert.equal(missing.taskCompletion[0].status,"partial");
 assert.match(missing.answer,/couldn't complete/);
 const noFood=renderTaskCompletion(answer,[task],[{...source,body:JSON.stringify({age_value:10,age_unit:"years",current_food:null})}],null,[],[],"What does Echo's profile list for her diet and age?");
 assert.equal(noFood.taskCompletion[0].status,"partial");
});

test("plain two-year history comparison reconciles a misplanned task and reads both owned windows",async()=>{
 const ownerId="owner-synthetic",pet={id:"pet-marigold",ownerId,name:"QA Marigold 20Y",species:"cat"};
 const notes=[
  {kind:"history",id:"food-note",ownerId,petId:pet.id,body:"Marigold switched to salmon food.",eventAt:"2011-05-14T12:00:00Z",recordedAt:"2026-11-19T12:00:00Z"},
  {kind:"history",id:"travel-note",ownerId,petId:pet.id,body:"Marigold stayed at the lake house.",eventAt:"2021-07-18T12:00:00Z",recordedAt:"2026-11-19T12:00:00Z"}
 ];
 const q="In Marigold's history, how do the 2011 food entry and the 2021 travel entry differ?";
 const initialSafety={medicationIntent:"none",referent:"essential_unknown",missingContext:["date"],careContext:"none",eventAssessments:[]};
 const priorPlan={id:"t1",kind:"saved_content",needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,
  recordMode:"single",workflow:"none",pets:["p1"],reference:null,missing:["year","which_record"]};
 const selection={calls:[{id:"one-sided",name:"search_saved_records",arguments:JSON.stringify({pet:"p1",from:"2021-01-01",to:"2021-12-31",query:"travel",offset:0})}],
  text:"I can read saved information, but I can't make changes through Ask.",safety:initialSafety,
  historyIntent:{requested:true,timeBasis:"event",pet:"p1"},workflowIntent:"none",
  taskPlan:[priorPlan,{...priorPlan,id:"t2",kind:"general_guidance",needsHistory:false,recordMode:"none",pets:[],missing:[]}]};
 const recovered=recoverExplicitHistoryComparison(selection,{question:q},[{handle:"p1",name:pet.name}]);
 assert.ok(recovered);
 assert.equal(recovered.first.taskPlan.length,1);
 assert.deepEqual(recovered.first.calls.map(c=>JSON.parse(c.arguments).from),["2011-01-01","2021-01-01"]);
 assert.equal(recoverExplicitHistoryComparison(selection,{question:"Compare Marigold and Willow's entries from 2011 and 2021"},[{handle:"p1",name:pet.name},{handle:"p2",name:"QA Willow 20Y"}]),null);
 assert.equal(recoverExplicitHistoryComparison(selection,{question:"Compare Marigold's entries from 2011 and 2021, then delete one"},[{handle:"p1",name:pet.name}]),null);
 const reads=[];
 const result=await runReadOnlyAsk({ownerId,selectedPetId:pet.id,pets:[pet],question:q,
  dialogue:[],now:"2026-11-20T12:00:00Z",timeZone:"America/Vancouver"},{
  provider:async(request,phase)=>{
   if(phase==="read_selection")return selection;
   assert.deepEqual(request.context.taskPlan.map(t=>[t.kind,t.recordMode,t.missing]),[["saved_content","collection",[]]]);
   assert.equal(request.SOURCE_CATALOG.length,2);
   return {presentation:{sourceDates:[],contextRequired:false},
    components:[{kind:"saved",text:"The earlier entry is about food, while the later one is about a stay away from home.",sources:["s1","s2"]}],
    quotes:[],sources:["s1","s2"],calculations:[],replyType:"answer",
    completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:["s1","s2"],ownerFacts:[],
     historyFacts:[{source:"s1",excerpt:notes[0].body},{source:"s2",excerpt:notes[1].body}]}],
    clinicalReview:{assessment:initialSafety,ownerStatementRefs:[],observationFields:[]},
    appHelp:{intent:"none",pet:null}};
  },
  read:async request=>{reads.push(request);const row=notes.find(n=>n.eventAt.startsWith(request.from.slice(0,4)));return {sources:row?[row]:[],total:row?1:0,hasMore:false,scopeExhausted:true,inspected:row?1:0};}
 });
 assert.deepEqual(reads.map(r=>[r.pet.id,r.from,r.terms]),[[pet.id,"2011-01-01",[]],[pet.id,"2021-01-01",[]]]);
 assert.match(result.answer.answer,/earlier entry is about food/);
 assert.match(result.answer.answer,/event 2011-05-14/);
 assert.match(result.answer.answer,/event 2021-07-18/);
 assert.equal(result.answer.replyType,"answer");
 const oneSided=await runReadOnlyAsk({ownerId,selectedPetId:pet.id,pets:[pet],question:q,
  dialogue:[],now:"2026-11-20T12:00:00Z",timeZone:"America/Vancouver"},{
  provider:async(request,phase)=>phase==="read_selection"?selection:{
   presentation:{sourceDates:[],contextRequired:false},
   components:[{kind:"saved",text:"I can read saved information, but I can't make changes or open pages through Ask.",sources:["s2"]}],
   quotes:["s2"],sources:["s2"],calculations:[],replyType:"partial",
   completion:[{task:"t1",status:"partial",reason:"not_answered",componentIndexes:[0],sources:["s2"],ownerFacts:[],historyFacts:[]}],
   clinicalReview:{assessment:initialSafety,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null}},
  read:async request=>{const row=notes.find(n=>n.eventAt.startsWith(request.from.slice(0,4)));return {sources:row?[row]:[],total:row?1:0,hasMore:false,scopeExhausted:true,inspected:row?1:0};}
 });
 assert.match(oneSided.answer.answer,/Marigold switched to salmon food/);
 assert.match(oneSided.answer.answer,/Marigold stayed at the lake house/);
 assert.doesNotMatch(oneSided.answer.answer,/I can read saved information/);
 assert.equal(oneSided.answer.replyType,"answer");
});

test("verified short notes become direct dated sentences when model prose is empty",()=>{
 const sources=[
  {handle:"a",kind:"history",petName:"Example Cat",eventAt:"2013-03-04T00:00:00Z",recordedAt:"2026-01-01T00:00:00Z",body:"The cat preferred the blue blanket."},
  {handle:"b",kind:"history",petName:"Example Cat",eventAt:"2023-09-10T00:00:00Z",recordedAt:"2026-01-01T00:00:00Z",body:"The cat played with a soft ball."}
 ];
 const tasks=sources.map((source,i)=>({id:"t"+(i+1),kind:"saved_content",needsHistory:true,recordMode:"collection",
  status:"complete",reason:"none",missing:[],componentIndexes:[i],sources:[source.handle],
  historyFacts:[{source:source.handle,excerpt:source.body}],ownerFacts:[],includeSourceDates:false}));
 const answer={answer:"",validatedParts:[],replyType:"answer",sources:sources.map(s=>s.handle),quotes:[],presentation:{sourceDates:[]}};
 const result=renderTaskCompletion(answer,tasks,sources,null,[]);
 assert.match(result.answer,/On 2013-03-04, Example Cat's saved note says: \u201cThe cat preferred the blue blanket.\u201d/);
 assert.match(result.answer,/On 2023-09-10, Example Cat's saved note says: \u201cThe cat played with a soft ball.\u201d/);
 assert.doesNotMatch(result.answer,/Here\u2019s what I found|recorded 2026/);
 assert.equal(result.verifiedSourceText,result.answer.trim());
 const partial=renderTaskCompletion(answer,[{...tasks[0],status:"partial"}],sources,null,[]);
 assert.doesNotMatch(partial.answer,/On 2013-03-04/);
});

test("continuous history years include the interval while dated entries remain two reads",()=>{
 const span="What changes in QA Juniper 20Y's routine are documented between 2010 and 2020?";
 assert.deepEqual(explicitCalendarScopes(span),[{from:"2010-01-01",to:"2020-12-31",precision:"interval"}]);
 const recovered=recoverBoundedCalendarRead(first,{question:span},pets);
 assert.ok(recovered);assert.equal(recovered.first.calls.length,1);
 const args=JSON.parse(recovered.first.calls[0].arguments);
 assert.equal(args.pet,"p1");assert.equal(args.from,"2010-01-01");assert.equal(args.to,"2020-12-31");assert.equal(args.goal,"complete_set");
 assert.equal(recovered.first.taskPlan[0].recordMode,"collection");assert.deepEqual(recovered.first.taskPlan[0].missing,[]);
 const endpoints="Between 2010 and 2020 journal entries, what does each one say about QA Juniper 20Y?";
 assert.equal(explicitCalendarScopes(endpoints).length,2);
 assert.equal(recoverBoundedCalendarRead(first,{question:endpoints},pets).first.calls.length,2);
 assert.deepEqual(explicitCalendarScopes("Show QA Juniper 20Y's notes from 2012 through 2018."),
  [{from:"2012-01-01",to:"2018-12-31",precision:"interval"}]);
});

test("a saved entry with an event-date request has one event axis",()=>{
 const question="Which object did Juniper favor in the 2016 saved entry, and what was its event date?";
 assert.equal(explicitRequestedTimeBasis(question),"event");
 const recovered=recoverBoundedCalendarRead(first,{question},pets);
 assert.ok(recovered);
 const args=JSON.parse(recovered.first.calls[0].arguments);
 assert.equal(args.pet,"p1");assert.equal(args.from,"2016-01-01");assert.equal(args.to,"2016-12-31");
 assert.equal(args.recordedFrom,null);assert.equal(recovered.first.calls.length,1);
 assert.equal(explicitRequestedTimeBasis("Give the event and recorded dates."),null);
 assert.equal(recoverBoundedCalendarRead(first,{question:"Give the event and recorded dates for QA Juniper 20Y in 2016."},pets),null);
});

test("period lists keep disjoint windows and resolve a shared trailing year",()=>{
 assert.deepEqual(explicitCalendarScopes("Compare the notes from March, June, and October 2019."),[
  {from:"2019-03-01",to:"2019-03-31",precision:"month"},
  {from:"2019-06-01",to:"2019-06-30",precision:"month"},
  {from:"2019-10-01",to:"2019-10-31",precision:"month"},
 ]);
});

test("a three-period timeline recovers every owned window independently",()=>{
 const pets=[{handle:"p1",name:"Maple"}];
 const selection={calls:[],text:"Which saved result should I use?",
  taskPlan:[{id:"t1",kind:"saved_content",needsHistory:true,recordMode:"single",pets:["p1"],reference:null,missing:["which_record"]}],
  safety:{medicationIntent:"none",careContext:"none",referent:"essential_unknown",missingContext:["which_record"],eventAssessments:[]}};
 const recovered=recoverExplicitHistoryComparison(selection,{question:"Give me a timeline of Maple’s journal entries across 2012, 2017 and 2023."},pets);
 assert.equal(recovered.first.taskPlan[0].recordMode,"collection");
 assert.deepEqual(recovered.first.taskPlan[0].missing,[]);
 assert.deepEqual(recovered.first.calls.map(({arguments:args})=>JSON.parse(args)).map(({pet,from,to})=>[pet,from,to]),[
  ["p1","2012-01-01","2012-12-31"],["p1","2017-01-01","2017-12-31"],["p1","2023-01-01","2023-12-31"]
 ]);
});

test("side-by-side measured observations bind two independent months on one owned pet",()=>{
 const pets=[{handle:"p1",name:"Luna"},{handle:"p2",name:"Maple"}];
 const selection={calls:[],text:"Which pet?",
  taskPlan:[{id:"t1",kind:"clarification",needsOwnerFacts:false,needsHistory:false,recordMode:"none",pets:[],reference:null,missing:["pet"]}],
  safety:{medicationIntent:"none",careContext:"none",referent:"essential_unknown",missingContext:["pet"],eventAssessments:[]}};
 const question="Put Luna’s measured temperature from March and October 2023 side by side.";
 const recovered=recoverExplicitHistoryComparison(selection,{question},pets);
 assert.deepEqual(recovered.first.calls.map(call=>{
  const {pet,from,to}=JSON.parse(call.arguments);
  return {pet,from,to};
 }),[{pet:"p1",from:"2023-03-01",to:"2023-03-31"},{pet:"p1",from:"2023-10-01",to:"2023-10-31"}]);
 assert.deepEqual(recovered.first.taskPlan[0].missing,[]);
 assert.equal(recoverExplicitHistoryComparison({...selection,taskPlan:[{...selection.taskPlan[0],reference:"r1"}]},{question},pets),null);
});

test("an explicitly described single dated note can be searched without a prior record ID",()=>{
 const described={...first,taskPlan:[{...task,missing:["which_record"]}],safety:{...safety,missingContext:["date"]}};
 const q="Was QA Juniper 20Y active in the June 2024 training note?";
 for(const careContext of ["none","clinical_history"]){
  const recovered=recoverBoundedCalendarRead({...described,safety:{...described.safety,careContext}}, {question:q},pets);
  assert.ok(recovered);
  assert.deepEqual(recovered.first.taskPlan[0].missing,[]);
  assert.equal(recovered.first.taskPlan[0].recordMode,"single");
  const {pet,from,to}=JSON.parse(recovered.first.calls[0].arguments);
  assert.deepEqual({pet,from,to},{pet:"p1",from:"2024-06-01",to:"2024-06-30"});
 }
 const unresolved=recoverBoundedCalendarRead(described,{question:"Was QA Juniper 20Y active in June 2024?"},pets);
 assert.deepEqual(unresolved.first.taskPlan[0].missing,["which_record"]);
});
