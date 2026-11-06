import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAskRequestPayload, hasOnlyAskRequestKeys, parseConfirmedTemporalScope } from "../app/lib/ask-request-contract.ts";
import { claimWithRestoredAskOrigin } from "../app/lib/ask-restored-retry.ts";
import { hashAiCreditPayload } from "../app/lib/ai/usage-ledger.ts";

const scope = () => ({ role: "event_time", from: "2024-03-10T08:00:00Z",
  to: "2024-03-11T07:00:00Z", timeZone: "America/Los_Angeles", source: "client_user_confirmed" });
const base = { conversationId: null, locale: "en", logicalTurnId: "turn", message: "Question", petId: "pet" };
const identity = { conversationId: "conversation", locale: "en", petId: "pet", question: "Question" };
const persisted = { conversationId: "conversation", question: "Question", userSequence: 1 };

test("optional scope preserves legacy request and accepts either explicit role", () => {
  assert.equal(parseConfirmedTemporalScope(undefined), undefined);
  assert.equal(Object.hasOwn(buildAskRequestPayload(base), "confirmedTemporalScope"), false);
  for (const role of ["event_time", "report_recorded_time"]) {
    const input = {...scope(), role}, payload = buildAskRequestPayload({...base, confirmedTemporalScope: input});
    assert.deepEqual(payload.confirmedTemporalScope, input); assert.equal(hasOnlyAskRequestKeys(payload), true);
  }
});
test("malformed, fabricated, incomplete, extra, reversed and invalid timezone scopes fail", () => {
  const cases = [
    null, {}, {...scope(), role: "other"}, {...scope(), source: "model"},
    {...scope(), from: "2024-03-10"}, {...scope(), from: "2024-02-30T00:00:00Z"},
    {...scope(), to: scope().from}, {...scope(), from: scope().to, to: scope().from},
    {...scope(), timeZone: "invalid/zone"}, {...scope(), extra: true},
    {...scope(), role: {toString: () => "event_time"}}
  ];
  for (const item of cases) assert.throws(() => parseConfirmedTemporalScope(item), /INVALID_TEMPORAL_SCOPE/);
});
test("full canonical identity hash changes for omission and every scope field", () => {
  const original = {...identity, confirmedTemporalScope: scope()};
  const originalHash = hashAiCreditPayload("ask", original);
  for (const next of [identity,
    {...original, confirmedTemporalScope: {...scope(), role: "report_recorded_time"}},
    {...original, confirmedTemporalScope: {...scope(), from: "2024-03-09T08:00:00Z"}},
    {...original, confirmedTemporalScope: {...scope(), to: "2024-03-12T07:00:00Z"}},
    {...original, confirmedTemporalScope: {...scope(), timeZone: "UTC"}},
    {...original, confirmedTemporalScope: {...scope(), source: "other"}},
  ]) assert.notEqual(hashAiCreditPayload("ask", next), originalHash);
});
test("unproven scoped replay, omitted scope and tamper reject before any claim", async () => {
  let claims = 0; const claim = async () => { claims++; return { operation: {} }; };
  for (const [payload, state] of [
    [{...identity, confirmedTemporalScope: scope()}, persisted],
    [identity, {...persisted, confirmedTemporalScope: scope()}],
    [{...identity, confirmedTemporalScope: {...scope(), role: "report_recorded_time"}}, {...persisted, confirmedTemporalScope: scope()}],
    [{...identity, confirmedTemporalScope: scope()}, null]
  ]) await assert.rejects(claimWithRestoredAskOrigin({claim, payload, persisted: state}), /ASK_TEMPORAL_SCOPE_DURABILITY_UNAVAILABLE/);
  assert.equal(claims, 0);
  assert.deepEqual(await claimWithRestoredAskOrigin({claim, payload: identity, persisted}), {operation: {}});
  assert.equal(claims, 1);
});
test("route gates scoped execution before persisted-request loading or provider calls", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  const parse = route.indexOf("parseConfirmedTemporalScope(body?.confirmedTemporalScope)");
  const hash = route.indexOf('hashAiCreditPayload("ask", aiCreditPayload)');
  const stop = route.indexOf('if (confirmedTemporalScope) return askFailure');
  const load = route.indexOf("persistedBeforeClaim = await loadPersistedRequest");
  const provider = route.indexOf("const interpretation = await interpretAskQuestion");
  assert.ok(parse > 0 && parse < hash && hash < stop && stop < load && load < provider);
  assert.match(route, /confirmedTemporalScope \? \{ confirmedTemporalScope \} : \{\}/);
});
