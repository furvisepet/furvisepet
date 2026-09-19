import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const disclosures = readFileSync(new URL("../app/lib/billing/membership-copy.ts", import.meta.url), "utf8");
const membership = readFileSync(new URL("../app/membership/page.tsx", import.meta.url), "utf8");

test("Membership promises only current plan limits and one shared-quality clarification", () => {
  assert.match(membership, /FREE_ASK_ALLOWANCE/);
  assert.match(membership, /PLUS_ASK_ALLOWANCE/);
  assert.match(membership, /"1 pet profile"/);
  assert.match(membership, /PLAN_CAPABILITIES\.plus\.maxPets/);
  assert.match(membership, /VET_BRIEF_USAGE_TERMS/);
  assert.match(disclosures, /failed preparation does not/);
  assert.match(membership, /MEMBERSHIP_CANCELLATION_TERMS/);
  assert.match(disclosures, /Cancel in Membership → Manage billing/);
  assert.match(disclosures, /end of your current paid period/);
});

test("plan features appear once in consumer pricing cards", () => {
  assert.match(membership, /aria-label="Furvise membership plans"/);
  assert.match(membership, /"Unlimited lifetime care history"/);
  assert.match(membership, /PLUS_VET_BRIEF_ALLOWANCE/);
  assert.doesNotMatch(membership, /Compare plans|Care history and tracking|same reasoning and safety standards/i);
});

test("Membership contains no unbuilt or falsely exclusive paid promises", () => {
  for (const promise of [
    "Live product research",
    "Premium product functionality",
    "Longer-history pattern detection",
    "Long-history pattern detection",
    "Longer-history patterns",
    "Vet prep exports",
    "product capabilities",
  ]) assert.doesNotMatch(membership, new RegExp(promise, "i"), promise);
});
