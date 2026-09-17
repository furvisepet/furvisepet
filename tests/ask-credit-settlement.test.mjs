import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settlement = readFileSync(new URL("../app/lib/ai/ask-credit-settlement.ts", import.meta.url), "utf8");

test("Ask credit release records a durable release disposition before reconciliation", () => {
  const release = settlement.slice(
    settlement.indexOf("async function safeReleaseAiCredit"),
    settlement.indexOf("async function reconcilePersistedAskCredit"),
  );
  const disposition = release.indexOf('disposition: "release"');
  const reconcile = release.indexOf("await reconcileAiCredit");
  assert.ok(disposition > -1 && reconcile > disposition);
  assert.match(release, /if \(isAiCreditIntegrityError\(error\)\) throw error/);
  assert.doesNotMatch(release, /disposition:\s*"complete"/);
});

test("Ask replay reconciliation preserves terminal dispositions and rejects multiple charges", () => {
  assert.match(settlement, /if \(state\.disposition !== null\) continue/);
  assert.match(settlement, /states\.filter\(\(state\) => state\.disposition === "complete"\)\.length > 1/);
  assert.match(settlement, /AI_CREDIT_DISPOSITION_CONFLICT/);
  assert.match(settlement, /if \(state\.status !== "reserved"\) continue/);
  assert.match(settlement, /if \(isAiCreditIntegrityError\(error\)\) throw error/);
});

test("development without the ledger migration never invents a settlement", () => {
  assert.match(settlement, /usage\.ledgerMode === "development_missing_migration"\) return usage/);
  assert.doesNotMatch(settlement, /development_missing_migration[\s\S]{0,220}setAiCreditDisposition/);
});
