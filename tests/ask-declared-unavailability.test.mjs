
import test from "node:test";
import assert from "node:assert/strict";
import {reconcileDeclaredUnavailability} from "../app/lib/ask-read-only/declared-unavailability.mjs";
const pets=[{id:"a",ownerId:"o",handle:"p1",name:"Juniper"},{id:"b",ownerId:"o",handle:"p2",name:"Willow"}];
const question="Who gave Juniper the first toy? I never recorded the giver’s name in Furvise.";
const safety={medicationIntent:"none",careContext:"none",scenario:"none",referent:"essential_unknown",missingContext:["pet"],currentEvents:[],conditionalEvents:[]};
const task={id:"t1",kind:"clarification",needsHistory:false,needsOwnerFacts:false,recordMode:"none",reference:null,pets:["p2"],missing:["pet","year"]};
function run({q=question,rows=pets,s={},t={},calls=[],plans=null,binder=h=>rows.find(p=>p.handle===h)}={}){
 return reconcileDeclaredUnavailability({calls,text:"Which pet and year?",workflowIntent:"none",safety:{...safety,...s}},plans??[{...task,...t}],{question:q},rows,"o",binder);
}
test("binds a unique explicit owned subject and literal declaration without granting a read or value",()=>{
 const r=run();assert.deepEqual(r.plan[0].pets,["p1"]);assert.deepEqual(r.plan[0].missing,[]);assert.equal(r.plan[0].kind,"general_guidance");assert.equal(r.first.text,"");assert.equal(r.first.calls.length,0);assert.deepEqual(r.first.safety.missingContext,[]);assert.equal(r.declaration,"I never recorded the giver’s name in Furvise.");
});
for(const q of [
 "What was on Juniper’s tag? I have not recorded the inscription here.",
 "The label on Willow’s box was never entered in Furvise. What did it say?",
 "What was Juniper’s old mat made from? I never saved its material.",
 "Who chose Juniper’s old nickname? I never wrote down the person’s name."
])test("recognizes scoped direct owner absence: "+q,()=>assert.ok(run({q})));
for(const q of [
 "What did she weigh in May?",
 "What did Juniper weigh in May?",
 "Who gave Juniper the toy? I do not know whether I recorded the name.",
 'Who gave Juniper the toy? A character says "I never recorded the name."',
 "Who gave Juniper the toy? I never recorded it until yesterday.",
 "Who gave Juniper the toy? I never recorded anything but the name.",
 "Who gave Juniper the toy? I never recorded nothing.",
 "I never recorded a routine for Juniper. Can you draft one?",
 "What is Juniper’s history? I never recorded one visit. Summarize all the notes anyway.",
 "Who gave Juniper the toy? I never recorded the name. Search the notes anyway.",
 "Who gave Juniper and Willow the toy? I never recorded the giver.",
 "Who gave Juniperberry the toy? I never recorded the giver."
])test("preserves another request or uncertain/quoted speech: "+q,()=>assert.equal(run({q}),null));
for(const s of [{medicationIntent:"decision"},{careContext:"current_concern"},{careContext:"education"},{scenario:"current"},{currentEvents:["collapse"]},{conditionalEvents:["breathing_distress"]},{missingContext:["medicine"]}])
 test("preserves medical authority/occurrence "+JSON.stringify(s),()=>assert.equal(run({s}),null));
for(const t of [{needsHistory:true,recordMode:"single"},{recordMode:"collection"},{reference:"r1"},{needsOwnerFacts:true},{pets:["p1","p2"]},{kind:"clinical_guidance"},{missing:["medicine"]}])
 test("preserves task scope "+JSON.stringify(t),()=>assert.equal(run({t}),null));
test("cannot cancel actual acquisition or independent tasks",()=>{
 assert.equal(run({calls:[{name:"search_saved_records"}]}),null);
 assert.equal(run({plans:[task,{...task,id:"t2",kind:"general_guidance"}]}),null);
});
test("rejects foreign, removed, duplicate and changed identities",()=>{
 assert.equal(run({rows:[pets[1]]}),null);
 assert.equal(run({rows:[...pets,{...pets[0],handle:"p3"}]}),null);
 assert.equal(run({rows:[{...pets[0],ownerId:"foreign"},pets[1]]}),null);
 for(const patch of [{ownerId:"foreign"},{id:"changed"}])assert.equal(run({binder:()=>({...pets[0],...patch})}),null);
});

test("explicit app workflow retains its own capability guidance",()=>{
 assert.equal(reconcileDeclaredUnavailability({calls:[],text:"",workflowIntent:"care_photo_attachment",safety},[task],{question},pets,"o",h=>pets.find(p=>p.handle===h)),null);
});
