import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FURVISE_ACTION_KINDS, parseStoredFurviseActionKind } from "../app/lib/application-actions/types.ts";
import { getFurviseActionPolicy } from "../app/lib/application-actions/policy.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("all machine action identifiers round-trip exactly", () => {
  for (const kind of FURVISE_ACTION_KINDS) {
    assert.equal(parseStoredFurviseActionKind(kind), kind);
    assert.ok(getFurviseActionPolicy(kind));
  }
  assert.equal(parseStoredFurviseActionKind("memorysetpreference"), null);
  assert.equal(parseStoredFurviseActionKind("MEMORY.SET_PREFERENCE"), null);
});

test("action confirmation is a separate no-credit endpoint", () => {
  const page = read("app/ask/page.tsx");
  const actionRoute = read("app/api/ask/actions/[messageId]/route.ts");
  assert.match(page, /applyApplicationAction/);
  assert.doesNotMatch(actionRoute, /reserveAiCredit|admitAiOperation|generateAsk/);
});

test("emergency safety remains before entitlement and quota", () => {
  const route = read("app/api/ask/route.ts");
  assert.ok(route.indexOf("detectImmediateAskEmergency(question)") < route.indexOf("loadAskEntitlementContext(authentication)"));
  assert.ok(route.indexOf("return standaloneEmergencyResponse") < route.indexOf("await reserveAiCredit"));
});

test("a durable assistant is persisted before credit completion", () => {
  const route = read("app/api/ask/route.ts");
  assert.ok(route.indexOf('role: "furvise"') < route.indexOf("completeAiCredit({ feature: \"ask\""));
  assert.match(route, /optional_credit_reconciliation/);
});

test("new sends cannot inherit prior failed identity", () => {
  const page = read("app/ask/page.tsx");
  assert.match(page, /retry\?\.logicalTurnId \|\| crypto\.randomUUID\(\)/);
  assert.match(page, /retry\?\.payload \|\| buildAskRequestPayload/);
});
