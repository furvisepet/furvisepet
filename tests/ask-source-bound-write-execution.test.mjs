import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../"+path, import.meta.url), "utf8");

test("source-bound reversible Ask jobs carry server-verified explicit intent", () => {
  const planner = read("app/lib/application-actions/planner.ts");
  const capability = read("app/lib/application-actions/capabilities.ts");
  assert.match(planner, /prepareBoundReplaceAction[\s\S]*explicitIntent: true/);
  assert.match(planner, /prepareBoundFieldMutationAction[\s\S]*explicitIntent: true/);
  assert.match(capability, /Boolean\(action\.appendJob \|\| action\.replaceJob \|\| action\.fieldMutationJob \|\| action\.stateTransitionJob\)/);
});

test("destructive and lifecycle confirmation policy remains authoritative", () => {
  const planner = read("app/lib/application-actions/planner.ts");
  assert.match(planner, /prepareBoundRemoveAction[\s\S]*explicitIntent:false[\s\S]*status:"confirmation_required"/);
  assert.match(planner, /prepareBoundLifecycleAction[\s\S]*confirmationPolicy !== "always"/);
});

test("append auto-execution crosses the capability executor and no route special-case blocks it", () => {
  const append = read("app/lib/intelligence/append-turn.ts");
  const route = read("app/api/ask/route.ts");
  assert.match(append, /shouldAutoExecuteAction\(executable\)[\s\S]*executeActionCapability\([\s\S]*mode: "auto"/);
  assert.doesNotMatch(route, /action\.kind === "care_history\.add" \|\| !shouldAutoExecuteAction/);
});
