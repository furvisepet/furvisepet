import test from "node:test";
import assert from "node:assert/strict";
import {assertPublicMutationDenied} from "./helpers/ask-public-mutation-boundary.mjs";
import {containsUnverifiedStateClaim,enforceVerifiedStateClaims} from "../app/lib/application-actions/state-claims.ts";
const claims=[
 "I cancelled the pending correction.",
 "I've canceled that action.",
 "We have corrected the saved profile.",
 "Furvise has restored the deleted record.",
 "I appended the observation to history.",
 "I replaced the saved note.",
 "I reopened the care concern.",
 "I reverted the profile change."
];
for(const claim of claims)test("unverified assistant effect is denied by the actual public route: "+claim,async()=>{
 await assertPublicMutationDenied("Change that saved information.",claim);
});
test("both cancellation spellings and passive data subjects require verified effects",()=>{
 for(const text of ["The action was cancelled.","The task has been canceled.","The record was restored.","The saved note was replaced."]){
  assert.equal(containsUnverifiedStateClaim(text),true,text);
  assert.ok(!enforceVerifiedStateClaims(text,false).includes(text),text);
 }
});
test("negations, third-party reports and fictional dialogue are not execution receipts",()=>{
 for(const text of [
  "I cannot cancel a pending action through Ask.",
  "I have not cancelled anything.",
  "The owner cancelled yesterday’s walk.",
  'The fictional character says, "I cancelled the trip."',
  "Please edit the note from History if you want to change it."
 ]){
  assert.equal(containsUnverifiedStateClaim(text),false,text);
  assert.equal(enforceVerifiedStateClaims(text,false),text,text);
 }
});
test("a verified private effect retains its affirmative prose",()=>{
 const claim="I cancelled the pending correction.";
 assert.equal(enforceVerifiedStateClaims(claim,true),claim);
});
