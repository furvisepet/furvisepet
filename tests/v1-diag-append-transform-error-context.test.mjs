import assert from "node:assert/strict";
import test from "node:test";
import {fixture,proposal} from "./helpers/ask-route-ordering.mjs";
function setup(){
 const p=proposal(); const bodies=["2024-02-29: First observation.","March 3, 2025: Second observation."];
 const dated=[
  {bodyQuote:bodies[0],dateQuote:"2024-02-29",occurredAt:"2024-02-29"},
  {bodyQuote:bodies[1],dateQuote:"March 3, 2025",occurredAt:"2025-03-03T00:00:00Z"},
 ];
 const question="Save these for Cedar:\n"+bodies.join("\n")+"\nwhat are his last two weights";
 p.question=question;p.appendJob={operation:"append",petName:"Cedar",items:dated,companionQuote:"what are his last two weights"};
 return {f:fixture({proposal:p}),question};
}

test("failure is context continuation",async()=>{const {f,question}=setup();const r=await f.send(question);const b=await r.json();assert.match(String(b.error||""),/Cedar may not load factual context|APPEND_CONTINUATION|CONTEXT|replace|list_ask_replace_targets/i);});
