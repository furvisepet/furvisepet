import test from "node:test";
import assert from "node:assert/strict";
import {explicitCalendarScopes,explicitRequestedTimeBasis,recoverBoundedCalendarRead,clarifyUnboundHistoryPronoun} from "../app/lib/ask-read-only/calendar-scope.mjs";
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
 assert.match(result.answer,/event 2011-05-14/);
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
 assert.equal(recoverBoundedCalendarRead(reconciled,{question:"What day was QA Juniper 20Y’s 2026 note saved?"},pets),null);
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
