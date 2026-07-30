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
  assert.match(notice, /You have used this month&apos;s AI credits\./);
  for (const label of ["Upgrade plan", "View care history", "Update pet details", "Prepare vet brief"]) assert.match(notice, new RegExp(label));
  assert.doesNotMatch(notice, /warning|danger|alert/i);
});

test("Ask recovery is compact and never exposes internal diagnostics", () => {
  assert.match(page, /max-w-xl rounded-xl/);
  assert.match(page, /FURVISE_ANSWER_UNAVAILABLE_MESSAGE/);
  assert.match(page, />Try again</);
  assert.match(page, />Edit question</);
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
  assert.equal(route.match(/await completeAiCredit/g)?.length, 2);
});

test("assistant persistence retries idempotently before returning an unsaved answer", () => {
  assert.match(route, /loadPersistedRequestByConversation/);
  assert.match(route, /assistant message persisted after idempotent retry/);
  assert.match(route, /request_id: requestId/);
});
