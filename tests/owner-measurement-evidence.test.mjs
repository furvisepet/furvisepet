import assert from "node:assert/strict";
import test from "node:test";
import { analyzeOwnerAssertions, isOwnerAssertedEvidence, ownerDeclinesPersistence } from "../app/lib/ai/owner-assertion.ts";

test("reported measurement wording is evidence; calculation instructions are not", () => {
  const earlier = "Atlas weighed exactly 5.45 kg during our vet visit last summer on July 12.";
  const current = "This morning his weight on our home scale registered at 5.10 kg.";
  const instruction = "Calculate the exact percentage difference between these two milestones, tell me if this change is a normal minor variance, and log this morning's weight to his profile history.";
  const message = `${earlier} ${current} ${instruction}`;
  assert.deepEqual(analyzeOwnerAssertions(message).assertionClauses, [earlier, current]);
  assert.equal(isOwnerAssertedEvidence(message, current), true);
  assert.equal(isOwnerAssertedEvidence(message, instruction), false);
  assert.equal(isOwnerAssertedEvidence(message, "his weight registered at 6.10 kg"), false);
});

test("measurement variants preserve quote, attribution, hypothetical and question boundaries", () => {
  for (const text of ["She weighed 12 lb.", "The thermometer read 38.5 C.", "His weight measured 4.8 kg."]) {
    assert.equal(isOwnerAssertedEvidence(text, text), true, text);
    for (const wrapped of [`If ${text}`, `Furvise said ${text}`, `"${text}"`, `Did ${text.slice(0,-1)}?`, `Calculate whether ${text}`]) {
      assert.equal(isOwnerAssertedEvidence(wrapped, text), false, wrapped);
    }
  }
});


test("explicit persistence opt-out narrows authority without interpreting quoted instructions", () => {
 for(const text of ["Do not save this message.", "Please don't save this to history.", "Never record anything.", "Don't save this as a new note.", "If you summarize this, don't save it.", "If you write a summary, do not save it.", "Can you write a summary but don't save it?"]) assert.equal(ownerDeclinesPersistence(text),true,text);
 for(const text of ['The note says "Do not save this message."', "If I say do not save this message, what happens?", "Don't save this as a new note; edit the old note.", "Save this message."]) assert.equal(ownerDeclinesPersistence(text),false,text);
});
