import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const membership = readFileSync(new URL("../app/membership/page.tsx", import.meta.url), "utf8");

test("Membership promises only current plan limits and shared quality", () => {
  assert.match(membership, /15 Ask per month/);
  assert.match(membership, /55 thoughtful Ask messages every month/);
  assert.match(membership, /One pet/);
  assert.match(membership, /Up to 10 pets/);
  assert.match(membership, /same Furvise reasoning and safety standards/i);
});

test("desktop and mobile comparisons share one truthful row source", () => {
  assert.match(membership, /data-ui="mobile-membership-comparison"/);
  assert.match(membership, /data-ui="desktop-membership-comparison"/);
  assert.equal((membership.match(/rows\.map/g) || []).length, 2);
  assert.match(membership, /\["Care history and tracking", "Included", "Included"\]/);
  assert.match(membership, /\["Reasoning and safety standards", "Same Furvise quality", "Same Furvise quality"\]/);
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
