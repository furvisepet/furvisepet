import assert from "node:assert/strict";
import test from "node:test";
import {fixture,proposal} from "./helpers/ask-route-ordering.mjs";
const dated=[
 {bodyQuote:"2024-02-29: First observation.",dateQuote:"2024-02-29",occurredAt:"2024-02-29"},
 {bodyQuote:"March 3, 2025: Second observation.",dateQuote:"March 3, 2025",occurredAt:"2025-03-03T00:00:00Z"},
];
function setup(){
 const p=proposal();const bodies=["2024-02-29: First observation.","March 3, 2025: Second observation."];
 const question="Save these for Cedar:\n"+bodies.join("\n")+"\nwhat are his last two weights";
 p.question=question;p.appendJob={operation:"append",petName:"Cedar",items:dated.map((x,i)=>({...x,bodyQuote:bodies[i]})),companionQuote:"what are his last two weights"};
 return {f:fixture({proposal:p}),question};
}

test("heart rows and receipt",async()=>{const {f,question}=setup();const r=await f.send(question);assert.equal(r.status,200,JSON.stringify(f.state.errors));assert.equal(f.rows.pet_care_entries.length,4);assert.equal(f.rows.ask_action_capabilities[0]?.status,"succeeded");assert.equal(f.rows.ask_action_capabilities[0]?.receipt?.status,"succeeded");});
