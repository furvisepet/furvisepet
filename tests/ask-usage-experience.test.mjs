import ts from "typescript";
import {functionSource} from "./helpers/production-function-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notice = readFileSync(new URL("../app/components/ask-usage-notice.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
const creditSettlement = readFileSync(new URL("../app/lib/ai/ask-credit-settlement.ts", import.meta.url), "utf8");

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
  const ast=ts.createSourceFile("route.ts",route,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  let providerFailure;
  function visit(node){
   if(ts.isTryStatement(node)&&node.tryBlock.getText(ast).includes("loadReadOnlyContext("))providerFailure=node.catchClause.block.getText(ast);
   ts.forEachChild(node,visit);
  }
  visit(ast);assert.ok(providerFailure);
  assert.match(providerFailure,/safeReleaseAiCredit/);
  assert.doesNotMatch(providerFailure,/completeAiCredit/);
  const persistence=functionSource(route,"persistReadOnlyAnswer");
  const terminal=persistence.indexOf("await finalizePersistedAskAnswer(");
  const charge=persistence.indexOf("await completeAiCredit(");
  assert.ok(terminal>=0&&terminal<charge);
  const publication=functionSource(route,"executeAskRequest").slice(functionSource(route,"executeAskRequest").indexOf("buildReadOnlyPublication("));
  assert.match(publication,/catch\(error\)[\s\S]*safeReleaseAiCredit/);
  assert.equal((persistence.match(/await completeAiCredit/g)||[]).length,1,"one foreground settlement; recovery belongs to the idempotent ledger");
  assert.match(route, /createAskCreditSettlement/);
  assert.doesNotMatch(route, /async function (?:safeReleaseAiCredit|reconcilePersistedAskCredit)/);
  assert.match(creditSettlement, /getEvents: getAiCreditEventsForLogicalRequest/);
  assert.match(creditSettlement, /await ledger\.reconcile/);
  assert.match(creditSettlement, /optional_credit_reconciliation/);
});

test("assistant persistence recovers owned readback and rejects an unavailable save", () => {
 const persistence=functionSource(route,"persistReadOnlyAnswer");
 assert.match(persistence,/loadPersistedRequestByConversation/);
 assert.match(persistence,/isDeepStrictEqual/);
 assert.match(persistence,/completeAskConversationTurn\(\{[\s\S]*requestId,/);
 assert.match(persistence,/new AskApiError\("DATABASE_ERROR",FURVISE_ASK_UNAVAILABLE_MESSAGE,503/);
 assert.match(functionSource(route,"finalizePersistedAskAnswer"),/finalizeDurableAskAnswer[\s\S]*isDeepStrictEqual/);
});
