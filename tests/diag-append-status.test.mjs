import assert from "node:assert/strict";
import test from "node:test";
import { fixture, proposal } from "./helpers/ask-route-ordering.mjs";
test("append status 400", async () => {
  const p=proposal(); const bodies=["2024-02-29: First observation.","March 3, 2025: Second observation."];
  const question="Save these for Cedar:\n"+bodies.join("\n")+"\nwhat are his last two weights";
  p.question=question;
  p.appendJob={operation:"append",petName:"Cedar",items:[
    {bodyQuote:bodies[0],dateQuote:"2024-02-29",occurredAt:"2024-02-29"},
    {bodyQuote:bodies[1],dateQuote:"March 3, 2025",occurredAt:"2025-03-03T00:00:00Z"}
  ],companionQuote:"what are his last two weights"};
  const response=await fixture({proposal:p}).send(question);
  assert.equal(response.status,400);
});
