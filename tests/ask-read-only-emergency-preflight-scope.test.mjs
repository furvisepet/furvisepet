import test from "node:test";
import assert from "node:assert/strict";
import {detectImmediateAskEmergency} from "../app/lib/ask-safety-context.ts";
import {currentSafetyClauses} from "../app/lib/ai/safety-temporal-scope.ts";

test("remote historical collapse with recovery and conditional recurrence cannot become a present emergency",()=>{
 for(const phrase of ["a long time ago","a while back","many years back"]){
  const text=`My dog collapsed ${phrase} and recovered with veterinary care; he is acting normally today. If he collapses again, should I wait for an appointment?`;
  assert.equal(detectImmediateAskEmergency(text),null,phrase);
  assert.ok(currentSafetyClauses(text).every(c=>!c.text.includes("collapsed")));
 }
});
test("historical context never suppresses a new current severe clause or another animal's emergency",()=>{
 for(const text of ["My dog collapsed a long time ago. But now he is unresponsive.","My cat collapsed many years back and recovered. My dog is unconscious now.","My dog is unconscious now."]){
  assert.ok(detectImmediateAskEmergency(text)?.tags.includes("collapse"),text);
 }
});
test("current uncertain breathing emergency and conditional-only discussion remain distinct",()=>{
 assert.ok(detectImmediateAskEmergency("My cat is struggling to breathe right now.")?.tags.includes("breathing_difficulty"));
 assert.equal(detectImmediateAskEmergency("If my dog collapses, what should I do?"),null);
 assert.equal(detectImmediateAskEmergency('The old note says "the dog collapsed". He is well today.'),null);
});
