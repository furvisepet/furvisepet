import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const membership = readFileSync(new URL("../app/membership/page.tsx", import.meta.url), "utf8");

test("Membership promises only current plan limits and one shared-quality clarification", () => {
  assert.match(membership, /FREE_ASK_ALLOWANCE/);
  assert.match(membership, /PLUS_ASK_ALLOWANCE/);
  assert.match(membership, /"1 pet"/);
  assert.match(membership, /Up to 10 pets/);
  assert.match(membership, /Plus gives you more room to use Furvise\. It does not change Furvise&apos;s safety standards\./);
});

test("plan features appear once in consumer pricing cards", () => {
  assert.match(membership, /aria-label="Furvise membership plans"/);
  assert.match(membership, /"Care history"/);
  assert.match(membership, /PLAN_CAPABILITIES\.plus\.vetPrepExports \? \["Vet Brief"\]/);
  assert.doesNotMatch(membership, /Compare plans|Care history and tracking|same reasoning and safety standards/i);
});

test("Membership contains no unbuilt or falsely exclusive paid promises", () => {
  for (const promise of [
    "Live product research",
    "Premium product functionality",
    "Longer-history pattern detection",
    "Longer-history patterns",
    "Vet prep exports",
    "product capabilities",
  ]) assert.doesNotMatch(membership, new RegExp(promise, "i"), promise);
});
