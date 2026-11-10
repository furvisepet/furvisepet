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

test("ordinary in-answer text and math transformations are not saved-data effects",()=>{
 for(const text of [
  "I corrected the arithmetic: 2 + 2 = 4.",
  "I cancelled the common factors in the expression.",
  "I edited the supplied paragraph for clarity.",
  "I replaced the variable in the example function.",
  "I appended the explanation below."
 ]){
  assert.equal(containsUnverifiedStateClaim(text),false,text);
  assert.equal(enforceVerifiedStateClaims(text,false),text,text);
 }
});
test("text work cannot conceal a later saved-data effect claim",()=>{
 for(const text of [
  "I edited the supplied paragraph and I deleted the saved note.",
  "I corrected the arithmetic in your profile.",
  "I replaced the variable in the saved record."
 ])assert.equal(containsUnverifiedStateClaim(text),true,text);
});
