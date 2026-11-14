import test from "node:test";
import assert from "node:assert/strict";
import {explicitCollectionYearWindow,recoverBoundedCalendarRead} from "../app/lib/ask-read-only/calendar-scope.mjs";
import {bindReadTool} from "../app/lib/ask-read-only/core.mjs";
const pet={id:"private-pet",ownerId:"owner",name:"Willow",handle:"p1"};
const question="Review Willow's complete saved history for 2016, 2017 and 2018, oldest events first.";
const first=()=>({text:"",calls:[],historyIntent:{requested:true,timeBasis:"event",pet:"p1"},safety:{careContext:"vet_summary",medicationIntent:"none",scenario:"historical",currentEvents:[],conditionalEvents:[],missingContext:[],referent:"clear"},taskPlan:[{id:"t1",kind:"saved_content",needsHistory:true,needsOwnerFacts:false,recordMode:"collection",pets:["p1"],reference:null,missing:[]}]});
test("literal enumerated membership and explicit ranges preserve bounded full years",()=>{
 for(const phrase of ["for 2016, 2017 and 2018","from 2016 through 2018","in 2016 to 2018","during 2016–2018"])
 assert.deepEqual(explicitCollectionYearWindow("Review all history "+phrase+"."),{from:"2016-01-01",to:"2018-12-31",precision:"year_collection"});
});
test("gapped comparison, relative, quoted and mixed month/day scopes never widen",()=>{
 for(const phrase of ["for 2016 and 2018","for 2018, 2017 and 2016","before 2018","since 2016","for 2016 versus 2018",'for "2016, 2017 and 2018"',"for March 2016","for 2016-03-04","for 2016, 2017 and 2018; compare 2020"])
 assert.equal(explicitCollectionYearWindow(phrase),null,phrase);
});
test("missing read is recovered only into the existing binder, not direct database authority",()=>{
 const recovered=recoverBoundedCalendarRead(first(),{question},[pet]);assert.ok(recovered);
 assert.equal(recovered.first.calls.length,1);const call=recovered.first.calls[0];
 const bound=bindReadTool(call.name,JSON.parse(call.arguments),[pet]);
 assert.equal(bound.pet.id,pet.id);assert.equal(bound.pet.ownerId,"owner");assert.equal(bound.goal,"complete_set");
 assert.equal(bound.from,"2016-01-01");assert.equal(bound.to,"2018-12-31");assert.deepEqual(bound.terms,[]);
 assert.throws(()=>bindReadTool(call.name,JSON.parse(call.arguments),[]),/ASK_READ_PET_NOT_AUTHORIZED/);
});
for(const [label,change] of [
 ["current emergency",f=>f.safety.currentEvents.push({sign:"collapse"})],
 ["conditional emergency",f=>f.safety.conditionalEvents.push({sign:"collapse"})],
 ["medication decision",f=>f.safety.medicationIntent="decision"],
 ["missing prescription",f=>f.safety.missingContext=["prescription"]],
 ["ambiguous axis",f=>f.historyIntent.timeBasis="ambiguous"],
 ["unrequested history",f=>f.historyIntent.requested=false],
 ["single record",f=>f.taskPlan[0].recordMode="single"],
 ["owner observations",f=>f.taskPlan[0].needsOwnerFacts=true],
 ["missing year",f=>f.taskPlan[0].missing=["year"]],
 ["another task",f=>f.taskPlan.push({...f.taskPlan[0],id:"t2"})],
 ["wrong pet",f=>f.taskPlan[0].pets=["foreign"]],
 ["existing reference",f=>f.taskPlan[0].reference="r1"],
 ["existing profile read",f=>f.calls=[{id:"x",name:"read_pet_profile",arguments:'{"pet":"p1"}'}]]
])test("empty collection recovery excludes "+label,()=>{const f=first();change(f);assert.equal(recoverBoundedCalendarRead(f,{question},[pet]),null);});
test("multiple explicit owned names remain unresolved",()=>{
 assert.equal(recoverBoundedCalendarRead(first(),{question:question+" Also Maple."},[pet,{...pet,id:"other",handle:"p2",name:"Maple"}]),null);
});
