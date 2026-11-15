import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { detectImmediateAskEmergency, detectAskConcernTags, conditionalEmergencyGuidance } from "../app/lib/ask-safety-context.ts";
import {readOnlyFailureRouteFixture} from "./helpers/ask-read-only-failure-route.mjs";

const frozen = JSON.parse(readFileSync(new URL("./fixtures/airway-emergency-regression.json", import.meta.url), "utf8"));
const cases = [
  ["Juniper is choking.", true],
  ["My dog is choking on a piece of food.", true],
  ["My cat's airway is blocked.", true],
  ["The puppy has an obstructed windpipe.", true],
  ["My dog has acute airway obstruction.", true],
  ["I think Juniper may be choking right now.", true],
  ["Is my dog choking?", true],
  ["Juniper is not choking.", false],
  ["Juniper isn't choking.", false],
  ["There is no airway obstruction.", false],
  ["My dog does not have an airway obstruction.", false],
  ["Juniper was choking last week.", false],
  ["Juniper was choking yesterday.", false],
  ["Juniper was choking.", false],
  ["Juniper was choking but now Juniper is choking again.", true],
  ["What if my dog is choking?", false],
  ["If my dog is choking, what should I do?", false],
  ["Hypothetically, my dog is choking.", false],
  ["What causes choking in dogs?", false],
  ["Tell me about airway obstruction.", false],
  ['The note says "Juniper is choking." Juniper is eating now.', false],
  ["Juniper is choking. Juniper is breathing normally now.", false],
  ["Juniper is choking and has stopped choking.", false],
  ["Juniper is choking and is breathing normally now.", false],
  ["Juniper is choking. Maple is choking and has stopped choking.", true],
  ["Juniper is choking. Choking has stopped.", false],
  ["Juniper is choking. Juniper has fully recovered.", false],
  ["Juniper is choking. I think Juniper is breathing normally.", true],
  ["Juniper is choking. Juniper has not stopped choking.", true],
  ["Juniper is choking. Juniper has stopped choking. Juniper is choking again.", true],
  ["Juniper is gasping and choking. Juniper has stopped choking.", true],
  ["Juniper is choking. Maple is breathing normally.", true],
  ["Juniper is not choking but Maple is choking.", true],
  ["Juniper was choking last year. Maple is choking now.", true],
  ["Juniper is choking. Maple is choking. Juniper has stopped choking.", true],
  ["Juniper is choking. Maple is choking. Juniper has stopped choking. Maple is breathing normally.", false],
  ["I am choking.", false],
  ["My child is choking.", false],
  ["I am choking and my dog is choking.", true],
  ["My child is choking. My dog is breathing normally.", false],
];
for (const [message, urgent] of cases) test("airway context: " + message, () => {
  assert.equal(Boolean(detectImmediateAskEmergency(message)), urgent);
  if (urgent) assert.ok(detectImmediateAskEmergency(message).tags.includes("breathing_difficulty"));
});
test("airway concern vocabulary is shared without duplicate tags or hypothetical current authority", () => {
  assert.deepEqual(detectAskConcernTags("choking and gasping"), ["breathing_difficulty"]);
  assert.deepEqual(detectAskConcernTags("an obstructed airway"), ["breathing_difficulty"]);
  assert.equal(detectImmediateAskEmergency("What if my dog is choking?"), null);
  assert.ok(conditionalEmergencyGuidance("What if my dog is choking?"));
});

async function urgentRoute(message, expected, journalName) {
  const f=readOnlyFailureRouteFixture(()=>{throw Error("Emergency must not reach provider");},[],{emergency:true});
  const response=await f.send(message),body=await response.json();
  const proof={http:response.status,plannerCalls:f.state.calls,safety:body.safety?.level,
    creditsUsed:body.creditsUsed,saved:body.persistence?.saved,careReads:f.state.reads,queriedTables:f.state.tables};
  if(journalName&&process.env.FURVISE_AIRWAY_JOURNAL)
    writeFileSync(process.env.FURVISE_AIRWAY_JOURNAL,JSON.stringify({sourceScenario:journalName,originalOracle:expected,actual:proof,contractChange:"Emergency Ask exchange may persist; care/profile writes remain forbidden."},null,2),{flag:"wx"});
  assert.equal(response.status,expected.http);
  assert.equal(f.state.calls,expected.plannerCalls);
  assert.equal(body.safety?.level,expected.safety);
  assert.match(JSON.stringify(body.response),new RegExp(expected.guidancePattern,"i"));
  assert.equal(body.handledWithoutAi,true);assert.equal(body.creditsUsed,0);
  assert.equal(body.persistence.saved,true);assert.equal(body.dataChanged,false);
  assert.equal(body.proposedHistoryUpdate,null);assert.equal(body.carePersistence.status,"skipped");
  assert.equal(f.state.credit,null);assert.equal(f.state.reads,0);assert.deepEqual(f.state.tables,[]);
  assert.equal(f.state.emergencyWrites,1);assert.equal(f.state.userMessages,1);
  return body;
}
test("FC2150-017 frozen input preserves urgent zero-provider/no-care contract with current chat publication", async () => {
  assert.equal(frozen.sourceScenario.id, "FC2150-017");
  await urgentRoute(frozen.sourceScenario.input.question, frozen.sourceScenario.expected, frozen.sourceScenario.id);
});
test("acute obstruction with another subject's companion work exits the real route before provider or care effects", async () => {
  await urgentRoute("My cat has an obstructed airway now. Save that and find my dog's oldest meal note.",
    frozen.sourceScenario.expected);
});
