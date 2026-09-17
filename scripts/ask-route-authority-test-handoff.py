from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# Credit reconciliation moved out of the HTTP route. Keep the ordering check in
# the route, but assert reconciliation semantics against their new owner.
path = Path("tests/ask-core-invariants.test.mjs")
text = path.read_text()
text = replace_once(
    text,
    '''test("a durable assistant is persisted before credit completion", () => {
  const route = read("app/api/ask/route.ts");
  assert.ok(route.indexOf('role: "furvise"') < route.indexOf("completeAiCredit({ feature: \\\"ask\\\""));
  assert.match(route, /optional_credit_reconciliation/);
});''',
    '''test("a durable assistant is persisted before credit completion", () => {
  const route = read("app/api/ask/route.ts");
  const settlement = read("app/lib/ai/ask-credit-settlement.ts");
  assert.ok(route.indexOf('role: "furvise"') < route.indexOf("completeAiCredit({ feature: \\\"ask\\\""));
  assert.match(route, /createAskCreditSettlement/);
  assert.doesNotMatch(route, /async function (?:safeReleaseAiCredit|reconcilePersistedAskCredit)/);
  assert.match(settlement, /optional_credit_reconciliation/);
});''',
    "core invariant credit ownership",
)
path.write_text(text)


# The route VM harness evaluates only one function declaration, so imported
# Brain helpers must be supplied explicitly just like the other dependencies.
path = Path("tests/ask-first20-reliability.test.mjs")
text = path.read_text()
text = replace_once(
    text,
    "import { classifyFurviseCapabilityQuestion, buildFurviseCapabilityResponse } from '../app/lib/ai/ask-internal-product-policy.ts';\n",
    "import { classifyFurviseCapabilityQuestion, buildFurviseCapabilityResponse } from '../app/lib/ai/ask-internal-product-policy.ts';\nimport { finalizeDurableAskAnswer } from '../app/lib/furvise-brain/durable-answer-finalization.ts';\n",
    "first20 durable helper import",
)
text = replace_once(
    text,
    "      finalizeAskAssistantResponse:async()=>++calls===succeedsAt?{data:true,error:null}:{data:null,error:new Error('offline')},\n",
    "      finalizeDurableAskAnswer,\n      finalizeAskAssistantResponse:async()=>++calls===succeedsAt?{data:true,error:null}:{data:null,error:new Error('offline')},\n",
    "first20 durable success harness",
)
text = replace_once(
    text,
    "    finalizeAskAssistantResponse:async()=>({data:false,error:null}),loadPersistedRequestByConversation:async()=>null,\n",
    "    finalizeDurableAskAnswer,\n    finalizeAskAssistantResponse:async()=>({data:false,error:null}),loadPersistedRequestByConversation:async()=>null,\n",
    "first20 durable failure harness",
)
path.write_text(text)


# Cache invalidation paths now live in their own framework boundary.
path = Path("tests/ask-inflight-navigation.test.mjs")
text = path.read_text()
text = replace_once(
    text,
    '''test("server invalidation targets downstream state and never the active Ask route", async () => {
  const route = await text("app/api/ask/route.ts");
  const invalidation = route.slice(route.indexOf("function revalidateAskStateViews"), route.indexOf("function textPayloadValue"));
  assert.match(invalidation, /"\\/dashboard"/);
  assert.match(invalidation, /"\\/pets"/);
  assert.match(invalidation, /"\\/care-log"/);
  assert.doesNotMatch(invalidation, /"\\/ask"|router\\.refresh|location\\.reload/);
});''',
    '''test("server invalidation targets downstream state and never the active Ask route", async () => {
  const [route, invalidation] = await Promise.all([
    text("app/api/ask/route.ts"),
    text("app/lib/intelligence/revalidate-ask-state.ts"),
  ]);
  assert.match(route, /revalidateAskStateViews\\(/);
  assert.match(route, /revalidate-ask-state\\.ts/);
  assert.doesNotMatch(route, /function revalidateAskStateViews/);
  assert.match(invalidation, /"\\/dashboard"/);
  assert.match(invalidation, /"\\/pets"/);
  assert.match(invalidation, /"\\/care-log"/);
  assert.doesNotMatch(invalidation, /"\\/ask"|router\\.refresh|location\\.reload/);
});''',
    "inflight invalidation ownership",
)
path.write_text(text)


# Keep the auxiliary-failure assertion scoped to persistAssistantAnswer now
# that the old credit helper no longer provides its function boundary.
path = Path("tests/ask-p0-auxiliary-regressions.test.mjs")
text = path.read_text()
text = replace_once(
    text,
    'askRoute.indexOf("async function safeReleaseAiCredit")',
    'askRoute.indexOf("function standaloneEmergencyResponse")',
    "p0 auxiliary slice boundary",
)
path.write_text(text)


# Persisted replay billing semantics follow the shared settlement boundary;
# foreground completion ordering remains route-owned until the larger finalizer handoff.
path = Path("tests/ask-pre-provider-retry.test.mjs")
text = path.read_text()
old = '''test("persisted answer replay only degrades terminal execution after durable identity and disposition validation", () => {
  const route = read("app/api/ask/route.ts");
  assert.match(route, /optional_credit_reconciliation/);
  assert.match(route, /return usage;/);
  assert.match(route, /const states = await getAiCreditEventsForLogicalRequest/);
  assert.match(route, /if \\(state.disposition !== null\\) continue/);
  assert.match(route, /setAiCreditDisposition\\(\\{ disposition: "release", feature: "ask", logicalRequestId/);
  assert.match(route, /if \\(isAiCreditIntegrityError\\(error\\)\\) throw error/);
  assert.match(route, /setAiCreditDisposition\\([\\s\\S]*disposition: "complete"[\\s\\S]*completeAiCredit/);
});'''
new = '''test("persisted answer replay only degrades terminal execution after durable identity and disposition validation", () => {
  const route = read("app/api/ask/route.ts");
  const settlement = read("app/lib/ai/ask-credit-settlement.ts");
  assert.match(route, /createAskCreditSettlement/);
  assert.doesNotMatch(route, /async function (?:safeReleaseAiCredit|reconcilePersistedAskCredit)/);
  assert.match(settlement, /optional_credit_reconciliation/);
  assert.match(settlement, /return usage;/);
  assert.match(settlement, /const states = await ledger\\.getEvents/);
  assert.match(settlement, /if \\(state\\.disposition !== null\\) continue/);
  assert.match(settlement, /ledger\\.setDisposition\\(\\{[\\s\\S]*disposition: "release"/);
  assert.match(settlement, /if \\(ledger\\.isIntegrityError\\(error\\)\\) throw error/);
  assert.match(route, /setAiCreditDisposition\\([\\s\\S]*disposition: "complete"[\\s\\S]*completeAiCredit/);
});'''
text = replace_once(text, old, new, "pre-provider replay settlement ownership")
path.write_text(text)


# Usage experience should inspect the real settlement owner instead of a
# duplicated implementation in route.ts.
path = Path("tests/ask-usage-experience.test.mjs")
text = path.read_text()
text = replace_once(
    text,
    'const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");\n',
    'const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");\nconst creditSettlement = readFileSync(new URL("../app/lib/ai/ask-credit-settlement.ts", import.meta.url), "utf8");\n',
    "usage settlement fixture",
)
text = replace_once(
    text,
    '  assert.match(route, /getAiCreditEventsForLogicalRequest[\\s\\S]*await reconcileAiCredit/);\n',
    '  assert.match(route, /createAskCreditSettlement/);\n  assert.doesNotMatch(route, /async function (?:safeReleaseAiCredit|reconcilePersistedAskCredit)/);\n  assert.match(creditSettlement, /getEvents: getAiCreditEventsForLogicalRequest/);\n  assert.match(creditSettlement, /await ledger\\.reconcile/);\n  assert.match(creditSettlement, /optional_credit_reconciliation/);\n',
    "usage replay settlement ownership",
)
path.write_text(text)


# Core-loop stability retains the route ordering check, while persisted replay
# reconciliation is verified at the extracted credit owner.
path = Path("tests/core-loop-stability.test.mjs")
text = path.read_text()
text = replace_once(
    text,
    '''test("Ask Furvise route uses context planning before response persistence", () => {
  const route = read("app/api/ask/route.ts");
  const contextLoad = route.indexOf("await buildFurviseContext");''',
    '''test("Ask Furvise route uses context planning before response persistence", () => {
  const route = read("app/api/ask/route.ts");
  const creditSettlement = read("app/lib/ai/ask-credit-settlement.ts");
  const contextLoad = route.indexOf("await buildFurviseContext");''',
    "core-loop settlement fixture",
)
text = replace_once(
    text,
    '  assert.match(route, /getAiCreditEventsForLogicalRequest[\\s\\S]*await reconcileAiCredit/);\n',
    '  assert.match(route, /createAskCreditSettlement/);\n  assert.match(creditSettlement, /getEvents: getAiCreditEventsForLogicalRequest/);\n  assert.match(creditSettlement, /await ledger\\.reconcile/);\n',
    "core-loop replay settlement ownership",
)
path.write_text(text)
