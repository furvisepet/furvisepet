import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notice = readFileSync(new URL("../app/components/ask-usage-notice.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");

test("Ask usage notice stays hidden until the allowance is exhausted", () => {
  assert.doesNotMatch(notice, /AI credits included each month/);
  assert.doesNotMatch(notice, /AI credit\$\{usage\.remaining === 1 \? "" : "s"\} left this month/);
  assert.match(notice, /if \(usage\.remaining === 0\)[\s\S]*return null/);
  assert.match(notice, /You&apos;ve used the/);
  assert.match(notice, /Share the full picture in each Ask/);
  for (const label of ["Upgrade to Plus", "View history", "Update pet details", "Prepare vet brief"]) assert.match(notice, new RegExp(label));
  assert.doesNotMatch(notice, /warning|danger|alert/i);
});

test("Ask recovery is compact and never exposes internal diagnostics", () => {
  assert.match(page, /max-w-xl rounded-xl/);
  assert.match(page, /getAskErrorPresentation/);
  assert.match(page, />Try again</);
  assert.match(page, /presentation\.recommendedAction === "edit" \? <button[^>]+onClick=\{onEdit\}/);
  assert.doesNotMatch(page, /Diagnostic:|debugStage|AI_UNAVAILABLE at|ai_provider/);
  assert.doesNotMatch(route, /\? \{ debugStage \}/);
});

test("failed provider or persistence paths do not consume usage", () => {
  const providerFailure = route.slice(route.indexOf("} catch (error) {", route.indexOf("orchestration = await orchestrateAskTurn")), route.indexOf("const reasoning"));
  assert.match(providerFailure, /safeReleaseAiCredit/);
  assert.doesNotMatch(providerFailure, /completeAiCredit/);
  const persistence = route.slice(route.indexOf("async function persistAssistantAnswer"), route.indexOf("async function persistPendingSuggestion"));
  const failedSave = persistence.slice(persistence.indexOf("if (!assistantMessage || messageError)"), persistence.indexOf('logAskStage("assistant message persisted"'));
  assert.match(failedSave, /safeReleaseAiCredit/);
  assert.doesNotMatch(failedSave, /completeAiCredit/);
  assert.equal(route.match(/await completeAiCredit/g)?.length, 2, "foreground completion is retried once");
  assert.match(route, /getAiCreditEventsForLogicalRequest[\s\S]*await reconcileAiCredit/);
});

test("assistant persistence retries idempotently before returning a retryable failure", () => {
  assert.match(route, /loadPersistedRequestByConversation/);
  assert.match(route, /assistant message persisted after idempotent retry/);
  assert.match(route, /request_id: requestId/);
  assert.match(route, /askFailure\("DATABASE_ERROR", FURVISE_ASK_UNAVAILABLE_MESSAGE, 503, \{\}, "persistence_failed"\)/);
});
