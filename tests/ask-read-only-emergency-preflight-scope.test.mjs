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


test("a recovered seasonal event is historical even when the owner asks about emergency status now",()=>{
 for(const season of ["winter","spring","summer","autumn","fall"]){
  const text="My dog collapsed once last "+season+", recovered, and is behaving normally today. Does that old event by itself mean an emergency is happening now?";
  assert.equal(detectImmediateAskEmergency(text),null,season);
  assert.ok(currentSafetyClauses(text).every(c=>!c.text.includes("collapsed")),season);
 }
});
test("seasonal history never hides a separately reported actual current emergency",()=>{
 for(const text of [
  "My dog collapsed last winter and recovered. But now she is unconscious.",
  "My cat was unconscious last summer. My dog is struggling to breathe now.",
  "My dog collapsed last autumn, but she is unconscious now.",
  "My dog collapsed a few minutes ago and has got up again.",
  "My dog has collapsed just now.",
  "I think my dog is unconscious now."
 ])assert.ok(detectImmediateAskEmergency(text),text);
});
test("conditional, negated and quoted seasonal emergencies remain non-current",()=>{
 for(const text of [
  "If my dog collapses next winter, what should I do?",
  "My dog did not collapse last winter and has no collapse now.",
  'The note says "my dog collapsed last winter". She is normal now.'
 ])assert.equal(detectImmediateAskEmergency(text),null,text);
});
