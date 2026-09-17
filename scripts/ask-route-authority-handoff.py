from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


route_path = Path("app/api/ask/route.ts")
route = route_path.read_text()

route = replace_once(
    route,
    'import { buildSuccessfulAskResponse, didPersistEffectiveAskState } from "../../lib/intelligence/finalize-ask-publication.ts";\n',
    'import { buildSuccessfulAskResponse, didPersistEffectiveAskState } from "../../lib/intelligence/finalize-ask-publication.ts";\n'
    'import { revalidateAskStateViews } from "../../lib/intelligence/revalidate-ask-state.ts";\n'
    'import { finalizeDurableAskAnswer } from "../../lib/furvise-brain/durable-answer-finalization.ts";\n',
    "publication imports",
)
route = replace_once(
    route,
    'import { createAskAdmissionSettlement } from "../../lib/ai/ask-admission-settlement.ts";\n',
    'import { createAskAdmissionSettlement } from "../../lib/ai/ask-admission-settlement.ts";\n'
    'import { createAskCreditSettlement } from "../../lib/ai/ask-credit-settlement.ts";\n',
    "credit settlement import",
)
route = replace_once(route, 'import { revalidatePath } from "next/cache";\n', '', "next cache import")
route = replace_once(route, '  getAiCreditEventsForLogicalRequest,\n', '', "legacy credit events import")
route = replace_once(route, '  reconcileAiCredit,\n', '', "legacy reconcile import")

admission = 'const { failAiAdmission, finalizeAiAdmissionAfterPersistence } = createAskAdmissionSettlement(logAskServerError);\n'
route = replace_once(
    route,
    admission,
    admission + 'const { reconcilePersistedAskCredit, safeReleaseAiCredit } = createAskCreditSettlement({ logAskServerError, logAskStage });\n',
    "credit settlement wiring",
)

start = route.index("async function safeReleaseAiCredit({")
end = route.index("function standaloneEmergencyResponse({", start)
route = route[:start] + route[end:]

start = route.index("function revalidateAskStateViews(")
end = route.index("async function loadPersistedRequest({", start)
route = route[:start] + route[end:]

start = route.index("async function finalizePersistedAskAnswer(input:")
end = route.index("function completedResponseFromPersisted(", start)
durable_adapter = '''async function finalizePersistedAskAnswer(input: {
  carePersistence: CarePersistenceResult; conversationId: string; messageId: string;
  responseData: CompletedAskResponse; requestId: string; supabase: SupabaseClient; userId: string;
}): Promise<PersistedRequestState | null> {
  const result = await finalizeDurableAskAnswer<PersistedRequestState>({
    attemptFinalize: async () => {
      const finalized = await finalizeAskAssistantResponse(input);
      if (!finalized.error && finalized.data === true) return true;
      throw finalized.error || new Error("ASK_RESPONSE_FINALIZE_FAILED");
    },
    createFailure: (failure) => new AskApiError("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, "persistence_failed", failure),
    isMatchingReadback: (durable) => Boolean(
      durable?.assistantMessage?.response_data && durable.assistantMessage.id === input.messageId
    ),
    onRecoveredReadback: (failure) => {
      logAskServerError("response_finalization_readback", failure, { requestId: input.requestId }, 200);
    },
    readback: () => loadPersistedRequestByConversation(input),
  });
  return result.kind === "replay" ? result.state : null;
}

'''
route = route[:start] + durable_adapter + route[end:]

for forbidden in (
    "async function safeReleaseAiCredit(",
    "async function reconcilePersistedAskCredit(",
    "function revalidateAskStateViews(",
    'import { revalidatePath } from "next/cache";',
):
    if forbidden in route:
        raise SystemExit(f"route still owns extracted authority: {forbidden}")
for required in (
    "createAskCreditSettlement({ logAskServerError, logAskStage })",
    "finalizeDurableAskAnswer<PersistedRequestState>",
    "revalidateAskStateViews([",
):
    if required not in route:
        raise SystemExit(f"route missing shared authority wiring: {required}")
route_path.write_text(route)

post_review_path = Path("tests/ask-post-review-finalizer-contract.test.mjs")
post_review = post_review_path.read_text()
count = post_review.count('functionSlice("persistAssistantAnswer", "async function safeReleaseAiCredit")')
if count != 3:
    raise SystemExit(f"post-review boundary: expected 3 old slices, found {count}")
post_review = post_review.replace(
    'functionSlice("persistAssistantAnswer", "async function safeReleaseAiCredit")',
    'functionSlice("persistAssistantAnswer", "function standaloneEmergencyResponse")',
)
post_review_path.write_text(post_review)

task_path = Path("tests/ask-task-execution-contract.test.mjs")
task = task_path.read_text()
start_marker = "for (const disposition of [null, 'release', 'complete']) test(`durable replay preserves settlement authority: ${disposition}`, async () => {"
end_marker = "test('unfinished assistant persistence is presented as incomplete without rewriting reviewed prose', () => {"
start = task.index(start_marker)
end = task.index(end_marker, start)
replacement = '''const creditSettlement = readFileSync(new URL('../app/lib/ai/ask-credit-settlement.ts', import.meta.url), 'utf8');
test('durable replay settlement authority lives in the shared Ask credit boundary', () => {
  assert.match(route, /createAskCreditSettlement\\(\\{ logAskServerError, logAskStage \\}\\)/);
  assert.doesNotMatch(route, /async function (?:safeReleaseAiCredit|reconcilePersistedAskCredit)/);
  assert.match(creditSettlement, /if \\(state\\.disposition !== null\\) continue/);
  assert.match(creditSettlement, /AI_CREDIT_DISPOSITION_CONFLICT/);
});
'''
task = task[:start] + replacement + task[end:]
task_path.write_text(task)

nav_path = Path("tests/navigation-data-freshness.test.mjs")
nav = nav_path.read_text()
nav = replace_once(
    nav,
    'const [ask, route, publication, freshness] = await Promise.all([\n',
    'const [ask, route, publication, freshness, revalidation] = await Promise.all([\n',
    "freshness destructure",
)
nav = replace_once(
    nav,
    '    text("app/lib/navigation/app-data-freshness.ts"),\n  ]);\n',
    '    text("app/lib/navigation/app-data-freshness.ts"),\n    text("app/lib/intelligence/revalidate-ask-state.ts"),\n  ]);\n',
    "freshness module load",
)
old_nav_checks = '''  assert.match(route, /didPersistEffectiveAskState\\(intelligencePersistence, carePersistence\\)/);
  assert.match(route, /revalidatePath\\(path\\)/);
  assert.match(route, /"\\/dashboard"[^\\]]*"\\/pets"[^\\]]*"\\/care-log"/s);
  const invalidation = route.slice(route.indexOf("function revalidateAskStateViews"), route.indexOf("async function loadPersistedRequest"));
  assert.doesNotMatch(invalidation, /"\\/ask"|"\\/shop"/);
'''
new_nav_checks = '''  assert.match(route, /didPersistEffectiveAskState\\(intelligencePersistence, carePersistence\\)/);
  assert.match(route, /revalidateAskStateViews\\(/);
  assert.match(route, /from "\\.\\.\\/\\.\\.\\/lib\\/intelligence\\/revalidate-ask-state\\.ts"/);
  assert.doesNotMatch(route, /function revalidateAskStateViews/);
  assert.match(revalidation, /"\\/dashboard"[^\\]]*"\\/pets"[^\\]]*"\\/care-log"/s);
  assert.doesNotMatch(revalidation, /"\\/ask"|"\\/shop"/);
'''
nav = replace_once(nav, old_nav_checks, new_nav_checks, "freshness ownership assertions")
nav_path.write_text(nav)

credit_test_path = Path("tests/ask-credit-settlement.test.mjs")
credit_test = credit_test_path.read_text()
credit_test = replace_once(
    credit_test,
    'import assert from "node:assert/strict";\n',
    'import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\n',
    "credit test fs import",
)
credit_test = replace_once(
    credit_test,
    'import { createAskCreditSettlement } from "../app/lib/ai/ask-credit-settlement.ts";\n',
    'import { createAskCreditSettlement } from "../app/lib/ai/ask-credit-settlement.ts";\n\nconst route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");\n',
    "credit route fixture",
)
credit_test += '''\n
test("Ask route delegates terminal credit settlement to the shared boundary", () => {
  assert.match(route, /createAskCreditSettlement\\(\\{ logAskServerError, logAskStage \\}\\)/);
  assert.doesNotMatch(route, /async function safeReleaseAiCredit|async function reconcilePersistedAskCredit/);
});
'''
credit_test_path.write_text(credit_test)

durable_test_path = Path("tests/furvise-brain-durable-answer-finalization.test.mjs")
durable_test = durable_test_path.read_text()
durable_test = replace_once(
    durable_test,
    'import assert from "node:assert/strict";\n',
    'import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\n',
    "durable test fs import",
)
durable_test = replace_once(
    durable_test,
    'import { finalizeDurableAskAnswer } from "../app/lib/furvise-brain/durable-answer-finalization.ts";\n',
    'import { finalizeDurableAskAnswer } from "../app/lib/furvise-brain/durable-answer-finalization.ts";\n\nconst route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");\n',
    "durable route fixture",
)
durable_test += '''\n
test("Ask route delegates acknowledgement retry and readback policy to the Brain durable boundary", () => {
  const start = route.indexOf("async function finalizePersistedAskAnswer");
  const end = route.indexOf("function completedResponseFromPersisted", start);
  assert.ok(start >= 0 && end > start);
  const adapter = route.slice(start, end);
  assert.match(adapter, /finalizeDurableAskAnswer/);
  assert.doesNotMatch(adapter, /for \\(let attempt/);
});
'''
durable_test_path.write_text(durable_test)
