import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { prepareFurviseApplicationActions } from "../app/lib/application-actions/planner.ts";
import { planDeterministicAskCommand } from "../app/lib/ai/ask-command-router.ts";

test("explicit language preference routes without a provider call", () => {
  for (const message of ["Please answer me in French.", "Switch the answer language to español now"] ) {
    const command = planDeterministicAskCommand(message, "Mani");
    assert.equal(command?.routeType, "preference", message);
    assert.equal(command?.orchestration.handledWithoutAi, true, message);
    assert.equal(command?.proposals[0].kind, "memory.set_preference", message);
  }
});

test("navigation commands route to exact machine identifiers", () => {
  const cases = new Map([
    ["Open her care history", "navigation.open_care_history"],
    ["Show Mani's memories", "navigation.open_memories"],
    ["View the Vet Brief", "navigation.open_vet_brief"],
    ["Go to the pet profile", "navigation.open_pet_profile"],
  ]);
  for (const [message, kind] of cases) {
    const command = planDeterministicAskCommand(message, "Mani");
    assert.equal(command?.proposals[0].kind, kind, message);
    assert.equal(command?.routeType, "application_action", message);
    const actions = prepareFurviseApplicationActions({ proposals: command.proposals, petId: "test-pet", petName: "Mani", requestId: "navigation-routes", sourceMessage: message });
    assert.equal(actions.length, 1);
    const path = new URL(actions[0].href, "https://furvise.test").pathname.replace("test-pet", "[id]");
    assert.ok(existsSync(new URL(`../app${path}/page.tsx`, import.meta.url)), `Missing route for ${kind}: ${path}`);
  }
});

test("ordinary care language does not become an application command", () => {
  for (const message of ["Why is she hiding?", "She uses the blue bed", "Can you answer why she's pacing?"]) {
    assert.equal(planDeterministicAskCommand(message, "Mani"), null, message);
  }
});

test('one-off output constraints and compound requests never become language settings', () => {
  for (const message of ['Answer in grams only.', 'Reply in JSON.', 'Respond in two words.', 'What is the total? Answer in French.', 'A bag weighs 800 grams. Answer in kilograms.']) {
    assert.equal(planDeterministicAskCommand(message, 'Mani'), null, message);
  }
  assert.equal(planDeterministicAskCommand('Please reply in français.', 'Mani')?.proposals[0].input.value, 'Français');
});
