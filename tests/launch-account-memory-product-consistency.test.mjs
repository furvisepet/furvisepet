import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeAuthEmail, buildOAuthCallbackUrl } from "../app/lib/auth-identity.ts";
import { removeInactiveMemoryClaimsFromConversation } from "../app/lib/intelligence/memory-lifecycle/filter-conversation.ts";
import { classifyShopQueryCapability } from "../app/lib/shop-query.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("account email identity is normalized and OAuth redirects stay internal", () => {
  assert.equal(normalizeAuthEmail("  Luna.Owner@Example.COM "), "luna.owner@example.com");
  assert.match(buildOAuthCallbackUrl("https://furvise.test/", "https://evil.test"), /next=%2Ftoday/);
  const login = read("app/login/page.tsx");
  assert.match(login, /Continue with Google/);
  assert.doesNotMatch(login, /Continue with Apple|Account created\. Check your inbox/);
});

test("inactive memories remove older matching conversation evidence", () => {
  const turns = [
    { id: "old", role: "user", text: "I usually shop at Costco because it is close to me.", createdAt: "2026-07-01T00:00:00Z" },
    { id: "old-assistant", role: "furvise", text: "I will keep Costco in mind.", createdAt: "2026-07-01T00:01:00Z" },
    { id: "new", role: "user", text: "I shop at Costco again now.", createdAt: "2026-07-30T00:00:00Z" },
  ];
  const result = removeInactiveMemoryClaimsFromConversation(turns, [{
    fact_key: "preferred_retailer",
    fact_value: "Costco because it is close to me",
    normalized_value: "costco because it is close to me",
    status: "rejected",
    updated_at: "2026-07-29T00:00:00Z",
  }]);
  assert.deepEqual(result.map((turn) => turn.id), ["new"]);
});

test("superseded budget conversation evidence is filtered before Ask context", () => {
  const turns = [{ id: "old", role: "user", text: "I prefer products under $30.", createdAt: "2026-07-01T00:00:00Z" }];
  const result = removeInactiveMemoryClaimsFromConversation(turns, [{
    fact_key: "product_budget_preference",
    fact_value: "under $30",
    normalized_value: "under $30",
    status: "superseded",
    updated_at: "2026-07-29T00:00:00Z",
  }]);
  assert.equal(result.length, 0);
});

test("all shared memory context paths start from active lifecycle rows", () => {
  const context = read("app/lib/intelligence/retrieve-context.ts");
  const vetBrief = read("app/api/vet-briefs/route.ts");
  const profileLoader = read("app/lib/supabase.ts");
  assert.match(context, /from\("furvise_memories"\)[\s\S]*?eq\("status", "active"\)/);
  assert.match(context, /from\("dog_memories"\)[\s\S]*?eq\("status", "active"\)/);
  assert.match(vetBrief, /furvise_memories[\s\S]*?eq\("status", "active"\)/);
  assert.match(profileLoader, /loadDogProfileWithMemoriesForUser[\s\S]*?dog_memories[\s\S]*?eq\("status", "active"\)/);
});

test("Product requests split deterministic browsing from guided AI", () => {
  assert.equal(classifyShopQueryCapability("dental"), "deterministic");
  assert.equal(classifyShopQueryCapability("soft dental chew under $25 without chicken"), "deterministic");
  assert.equal(classifyShopQueryCapability("Find the best thing for Luna because she hates hard chews and I want something affordable but premium"), "guided_ai");
});

test("exhausted guided Product requests retain deterministic results and explicit UI", () => {
  const route = read("app/api/shop/interpret-query/route.ts");
  const page = read("app/shop/page.tsx");
  const classifyAt = route.indexOf("const capability = classifyShopQueryCapability(query)");
  const usageAt = route.indexOf("usage = await loadShopUsage(context)", classifyAt);
  assert.ok(classifyAt > -1 && usageAt > classifyAt);
  assert.match(route, /creditsExhausted: true/);
  assert.match(route, /mode: "deterministic"/);
  assert.match(page, /\["dental", "food", "grooming"\]/);
  assert.doesNotMatch(page, /if \(searchCapReached\) return/);
  assert.match(page, /Product details and direct browsing are still available/);
});

test("memory migration enforces one active identity and service-only repair", () => {
  const migration = read("supabase/migrations/20260729010000_harden_memory_lifecycle_retrieval.sql");
  assert.match(migration, /furvise_memories_one_active_fact_idx/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /revoke all on function public\.repair_pet_memory_lifecycle[\s\S]*authenticated/);
  assert.match(migration, /grant execute[\s\S]*service_role/);
});
