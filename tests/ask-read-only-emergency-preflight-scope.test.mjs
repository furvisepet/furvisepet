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

test("a colon-prefaced future condition cannot become a current emergency",()=>{
 const failed="I'm planning for a possible future situation, not reporting symptoms now: if a cat ever starts open-mouth breathing or collapses, would waiting for a routine appointment be okay?";
 assert.equal(detectImmediateAskEmergency(failed),null);
 assert.equal(detectImmediateAskEmergency("Planning ahead: if a dog becomes unconscious, who should I call?"),null);
 assert.equal(detectImmediateAskEmergency("A prevention question: unless a cat is struggling to breathe, should I use routine care?"),null);
});
test("conditional preambles preserve independent actual emergencies and current colon reports",()=>{
 for(const text of [
  "Planning ahead: if a cat collapses, what should I do? But now my dog is unconscious.",
  "Here is what is happening now: my cat is struggling to breathe.",
  "If my cat collapsed I would call the vet, but now my dog is unconscious."
 ])assert.ok(detectImmediateAskEmergency(text),text);
});

test("event absence in a recovered history cannot create a present collapse",()=>{
 assert.equal(detectImmediateAskEmergency("Bramble had a collapse episode a few years back, was treated by a veterinarian and recovered. There is no collapse or breathing problem now. For a routine appointment next month, what facts about that old episode should I bring?"),null);
 assert.equal(detectImmediateAskEmergency("There is no collapse."),null);
 assert.ok(detectImmediateAskEmergency("There is no collapse, but my dog is struggling to breathe now."));
 assert.ok(detectImmediateAskEmergency("My dog collapsed and is unconscious now. There is no bleeding."));
 assert.ok(detectImmediateAskEmergency("My dog will not wake up."));
 assert.ok(detectImmediateAskEmergency("My dog has uncontrolled bleeding that will not stop."));
});
