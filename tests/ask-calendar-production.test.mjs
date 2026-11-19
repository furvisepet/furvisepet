import test from "node:test";
import assert from "node:assert/strict";
import {explicitCalendarScopes,recoverBoundedCalendarRead} from "../app/lib/ask-read-only/calendar-scope.mjs";
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
