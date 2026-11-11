import test from "node:test";
import assert from "node:assert/strict";
import {runReadOnlyAsk,validateReadOnlyAnswer} from "../app/lib/ask-read-only/core.mjs";
import {buildReadOnlyPublication} from "../app/lib/ask-read-only/publication.ts";
const input={ownerId:"owner",selectedPetId:"pet",pets:[{id:"pet",ownerId:"owner",name:"Juniper",species:"dog"}],question:"A care question.",dialogue:[],now:"2026-01-01T00:00:00Z",timeZone:"UTC"};
const final=components=>({presentation:{sourceDates:[],contextRequired:false},components,sources:[],quotes:[],calculations:[],replyType:"answer"});
const component=(kind,text)=>({kind,text,sources:[]});
async function publish(components){
 const result=await runReadOnlyAsk(input,{read:async()=>{throw Error("unnecessary private read");},provider:async(_p,phase)=>phase==="read_selection"?{calls:[],text:""}:final(components)});
 return buildReadOnlyPublication(result,"owner","Juniper").response;
}
test("current reported emergency guidance leads independent useful content and carries urgent metadata",async()=>{
 const out=await publish([component("general","Useful preparation details."),component("emergency","Seek immediate professional emergency care.")]);
 assert.ok(out.directAnswer.startsWith("Seek immediate professional emergency care."));
 assert.ok(out.directAnswer.includes("Useful preparation details."));
 assert.equal(out.urgency,"urgent");assert.equal(out.applicationActions.length,0);
});
test("conditional emergency guidance leads without claiming a current emergency",async()=>{
 const out=await publish([component("general","Routine care questions."),component("conditional_emergency","If an acute warning sign occurs, seek immediate emergency care.")]);
 assert.ok(out.directAnswer.startsWith("If an acute warning sign occurs"));
 assert.equal(out.urgency,"routine");assert.ok(out.directAnswer.includes("Routine care questions."));
});
test("ordinary or historical prose is not escalated by a keyword detector",async()=>{
 const out=await publish([component("general","A historical report mentions emergency care; no current event is established.")]);
 assert.equal(out.urgency,"routine");assert.equal(out.directAnswer,"A historical report mentions emergency care; no current event is established.");
});
test("escalation components cannot smuggle saved-source authority",()=>{
 assert.throws(()=>validateReadOnlyAnswer(final([{kind:"emergency",text:"An attributed fact.",sources:["s1"]}]),[{kind:"history",handle:"s1"}]),/ANSWER_INVALID/);
});
