import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAskUsageLimit, evaluateShopSearchUsageLimit, evaluatePetLimit, getPaidGateMessage, getPlanCapabilities, isEarlyAccessFreeUnlockEnabled } from "../app/lib/billing/plan-limits.ts";

test("plan capabilities define generous free and future plus limits", () => {
  const free = getPlanCapabilities("free");
  const plus = getPlanCapabilities("plus");
  const unknown = getPlanCapabilities("enterprise");

  assert.equal(free.maxPets, 1);
  assert.equal(free.careLog, "unlimited");
  assert.equal(free.dashboard, true);
  assert.equal(free.curatedProducts, true);
  assert.equal(free.aiCreditsMonthlyLimit, 50);
  assert.equal(free.askFurviseMonthlyLimit, 15);
  assert.equal(free.productsAiMonthlyLimit, 50);
  assert.equal(free.shopSearchMonthlyLimit, 50);
  assert.equal(free.productQuestionMonthlyLimit, 50);
  assert.equal(free.longHistoryPatternDetection, false);
  assert.equal(free.vetPrepExports, false);
  assert.equal(free.liveProductResearch, false);
  assert.equal(plus.aiCreditsMonthlyLimit, 500);
  assert.equal(plus.askFurviseMonthlyLimit, 55);
  assert.equal(plus.productsAiMonthlyLimit, 500);
  assert.equal(plus.longHistoryPatternDetection, true);
  assert.equal(plus.vetPrepExports, true);
  assert.equal(plus.liveProductResearch, true);
  assert.equal(unknown.id, "free");
});

test("early access unlock affects hard gates only", () => {
  assert.equal(isEarlyAccessFreeUnlockEnabled({ NEXT_PUBLIC_EARLY_ACCESS_FREE_UNLOCKS: "true" }), true);
  assert.equal(isEarlyAccessFreeUnlockEnabled({ EARLY_ACCESS_FREE_UNLOCKS: "true" }), true);
  assert.equal(isEarlyAccessFreeUnlockEnabled({}), false);

  const freeCore = getPlanCapabilities("free");
  assert.equal(freeCore.careLog, "unlimited");
  assert.equal(freeCore.dashboard, true);
  assert.equal(freeCore.curatedProducts, true);
});

test("pet limit gates new pets but never edits existing pets", () => {
  assert.equal(evaluatePetLimit({ isEditingExistingPet: false, petCount: 0, planId: "free", earlyAccessUnlocked: false }).allowed, true);
  const blocked = evaluatePetLimit({ isEditingExistingPet: false, petCount: 1, planId: "free", earlyAccessUnlocked: false });
  assert.equal(blocked.hardBlocked, true);
  assert.equal(blocked.message, "Your free plan includes 1 pet. Upgrade will unlock additional pets.");
  assert.doesNotMatch(blocked.message || "", new RegExp(`2\\s+${"pets"}|two\\s+${"pets"}|more\\s+${"pets"}`, "i"));
  assert.equal(evaluatePetLimit({ isEditingExistingPet: true, petCount: 5, planId: "free", earlyAccessUnlocked: false }).allowed, true);

  const early = evaluatePetLimit({ isEditingExistingPet: false, petCount: 1, planId: "free", earlyAccessUnlocked: true });
  assert.equal(early.allowed, true);
  assert.match(early.softNotice || "", /Early access/);
  assert.match(early.softNotice || "", /1 pet/);
});

test("legacy Ask usage UI mirrors the launch Free allowance during compatibility", () => {
  assert.equal(evaluateAskUsageLimit({ monthlyCount: 14, planId: "free", earlyAccessUnlocked: false }).allowed, true);
  const blocked = evaluateAskUsageLimit({ monthlyCount: 15, planId: "free", earlyAccessUnlocked: false });
  assert.equal(blocked.hardBlocked, true);
  assert.equal(blocked.remaining, 0);
  const early = evaluateAskUsageLimit({ monthlyCount: 30, planId: "free", earlyAccessUnlocked: true });
  assert.equal(early.allowed, true);
});

test("legacy product usage gate mirrors the shared 50-credit allowance during compatibility", () => {
  assert.equal(evaluateShopSearchUsageLimit({ monthlyCount: 49, planId: "free", earlyAccessUnlocked: false }).allowed, true);
  const blocked = evaluateShopSearchUsageLimit({ monthlyCount: 50, planId: "free", earlyAccessUnlocked: false });
  assert.equal(blocked.hardBlocked, true);
  assert.equal(blocked.remaining, 0);
  assert.match(blocked.message || "", /AI credits/);
  const early = evaluateShopSearchUsageLimit({ monthlyCount: 81, planId: "free", earlyAccessUnlocked: true });
  assert.equal(early.allowed, true);
  assert.match(early.softNotice || "", /extra product searches/);
});

test("paid gate messages exist", () => {
  assert.match(getPaidGateMessage("longHistoryPatternDetection"), /Furvise Plus/);
  assert.match(getPaidGateMessage("vetPrepExports"), /Furvise Plus/);
  assert.match(getPaidGateMessage("liveProductResearch"), /once it is built/);
});
