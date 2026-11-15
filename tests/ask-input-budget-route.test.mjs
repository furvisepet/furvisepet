import test from "node:test";
import assert from "node:assert/strict";
import {readOnlySuccessRouteFixture as fixture} from "./helpers/ask-read-only-success-route.mjs";
const known="Some earlier conversation text is outside Ask’s current context window. Repeat any older details you want me to use.";
const uncertain="Earlier conversation context may be incomplete. Repeat any older details you want me to use.";
for(const [name,context,notice] of [
 ["whole-message omissions",{dialogue:Array.from({length:20},(_,i)=>({role:"user",text:"Earlier message "+i}))},known],
 ["retained-text clipping",{dialogue:[{role:"user",text:"x".repeat(2500)+"TAIL_NOT_INCLUDED"}]},known],
 ["upstream context uncertainty",{dialogue:[],dialogueMayBeIncomplete:true},uncertain],
 ["complete context",{dialogue:[{role:"user",text:"We discussed prime numbers."}]},null]
])test("actual public route carries bounded context without an irrelevant owner clarification: "+name,async t=>{
 t.mock.method(console,"info",()=>{});
 const question="Explain a prime number.",f=fixture({context,answer:"A prime number has exactly two positive divisors.",replyType:"answer"});
 try{
  const response=await f.send(question),body=await response.json();
  assert.equal(response.status,200,JSON.stringify(f.state.errors));assert.equal(f.state.calls,2);assert.deepEqual(f.wire,f.admitted);assert.equal(f.state.reads,0);
  const first=JSON.parse(f.wire[0].input[0].content),second=JSON.parse(f.wire[1].input[0].content).context;
  for(const [index,input] of [first,second].entries()){
   assert.equal(input.question,undefined);assert.equal(input.dialogue,undefined);
   assert.equal(f.wire[index].input.at(-1).role,"user");assert.equal(f.wire[index].input.at(-1).content,question);
   const dialogue=f.wire[index].input.slice(1,-1);
   assert.ok(dialogue.every(m=>["user","assistant"].includes(m.role)));assert.ok(JSON.stringify(dialogue).length<=9000);
   assert.equal(input.dialogueCoverage.partial,!!notice);
  }
  assert.ok(!JSON.stringify(f.wire).includes("TAIL_NOT_INCLUDED"));
  const stored=f.state.persistedAnswer.response_data;
  // This is a standalone general question. Both calls receive honest bounded
  // coverage, but unrelated omitted dialogue must not force a context card.
  assert.ok(!body.response.sections.some(s=>s.heading==="Conversation context"));
  assert.ok(!(body.response.missingUsefulDetails??[]).includes(known));
  assert.ok(!(body.response.missingUsefulDetails??[]).includes(uncertain));
  assert.deepEqual(stored.sections,body.response.sections);
  assert.equal(body.response.summary,"A prime number has exactly two positive divisors.");
  assert.equal(body.turn.taskOutcome,"complete");assert.equal(body.creditsUsed,1);assert.deepEqual(f.state.credit,{status:"completed",disposition:"complete"});
  assert.ok(f.state.events.indexOf("assistant:terminal")<f.state.events.indexOf("credit:complete"));
  assert.equal(body.dataChanged,false);assert.deepEqual(body.response.applicationActions,[]);assert.ok(f.state.tables.every(table=>table==="dog_profiles"));
 }finally{await f.release();}
});
