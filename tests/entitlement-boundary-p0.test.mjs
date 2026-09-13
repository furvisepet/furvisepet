import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseEffectiveEntitlements } from "../app/lib/billing/entitlement-types.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const vetServer = read("app/lib/vet-brief/server.ts");
const migration = read("supabase/migrations/20260821021825_harden_entitlement_and_pet_data_boundaries.sql");

function entitlement(effectivePlan, vetPrepExports, overrides = {}) {
  return parseEffectiveEntitlements({
    access_role: "consumer",
    billing_plan: effectivePlan,
    effective_plan: effectivePlan,
    live_product_research: effectivePlan === "plus",
    long_history_pattern_detection: effectivePlan === "plus",
    products_paid_functionality: effectivePlan === "plus",
    vet_prep_exports: vetPrepExports,
    max_pets: effectivePlan === "plus" ? 10 : 1,
    monthly_ai_credits: effectivePlan === "plus" ? 500 : 50,
    ...overrides,
  });
}

test("Vet Brief shared request context enforces the canonical paid capability and fails closed", () => {
  assert.equal(entitlement("free", false)?.capabilities.vetPrepExports, false);
  assert.equal(entitlement("plus", true)?.capabilities.vetPrepExports, true);
  assert.match(vetServer, /await resolveEffectiveEntitlements\(supabase\)/);
  assert.match(vetServer, /entitlements\.effectivePlan !== "plus" \|\| !entitlements\.capabilities\.vetPrepExports/);
  assert.match(vetServer, /error instanceof EntitlementResolutionError[\s\S]*status: 503/);
  assert.match(vetServer, /status: 403/);
});

test("every Vet Brief API entry point evaluates the shared server boundary before resource access", () => {
  for (const path of [
    "app/api/vet-briefs/route.ts",
    "app/api/vet-briefs/draft/route.ts",
    "app/api/vet-briefs/[id]/route.ts",
    "app/api/vet-briefs/[id]/pdf/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /await getVetBriefRequestContext\(request\)/, path);
    assert.match(source, /if \("response" in (?:context|auth)\) return (?:context|auth)\.response/, path);
  }
  assert.doesNotMatch(vetServer, /NEXT_PUBLIC_EARLY_ACCESS_FREE_UNLOCKS|EARLY_ACCESS_FREE_UNLOCKS/);
  assert.doesNotMatch(vetServer, /request\.(?:json|formData)\(/);
  assert.match(migration, /private\.resolve_account_entitlements\(auth\.uid\(\)\)/);
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(migration, new RegExp(`create policy "vet_visit_briefs_${operation}_own"[\\s\\S]*public\\.has_vet_brief_entitlement\\(\\)`));
  }
});

test("entitlement decisions cover expired, cancelled, stale, forged, active Plus, and retrospective use", () => {
  for (const serverResolvedNonEntitled of [
    entitlement("free", false),
    entitlement("free", false, { billing_plan: "plus" }),
  ]) {
    assert.equal(serverResolvedNonEntitled?.effectivePlan, "free");
    assert.equal(serverResolvedNonEntitled?.capabilities.vetPrepExports, false);
  }
  const activePlus = entitlement("plus", true);
  assert.equal(activePlus?.effectivePlan, "plus");
  assert.equal(activePlus?.capabilities.vetPrepExports, true);
  assert.match(read("app/api/vet-briefs/draft/route.ts"), /retrospective = \(context\.pet\.lifecycle_status \|\| "active"\) !== "active"/);
  assert.doesNotMatch(vetServer, /lifecycle_status|client.*plan|body.*plan/i);
});

test("pet table privileges preserve profile fields while reserving lifecycle state and deletion", () => {
  assert.match(migration, /alter table public\.dog_profiles force row level security/);
  assert.match(migration, /drop policy if exists "Users can delete their dog profiles"/);
  assert.match(migration, /revoke insert, update, delete on table public\.dog_profiles[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant update \([\s\S]*name[\s\S]*routine_note[\s\S]*updated_at[\s\S]*\) on table public\.dog_profiles to authenticated/);
  assert.doesNotMatch(migration.match(/grant update \([\s\S]*?to authenticated;/)?.[0] || "", /lifecycle_status|lifecycle_changed_at|deceased_at|user_id|idempotency_key/);
});

test("permanent deletion is service-only, owner-bound, confirmed, and idempotently gated", () => {
  const route = read("app/api/pets/[id]/route.ts");
  const client = read("app/lib/supabase.ts");
  assert.match(route, /confirmation\?\: unknown \}\)\.confirmation !== "DELETE"/);
  assert.match(route, /beginIdempotentRateLimitedOperation\(\{ operationType: "profile\.delete"[\s\S]*retention: "destructive"/);
  assert.match(route, /\.rpc\("delete_pet_profile_for_user", \{ p_pet_id: id, p_user_id: auth\.userId \}\)/);
  assert.match(client, /body: JSON\.stringify\(\{ confirmation: "DELETE" \}\)/);
  assert.match(migration, /current_setting\('request\.jwt\.claim\.role', true\)[\s\S]*<> 'service_role'/);
  assert.match(migration, /where id = p_pet_id and user_id = p_user_id/);
  assert.match(migration, /revoke all on function public\.delete_pet_profile_for_user\(uuid, uuid\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.delete_pet_profile_for_user\(uuid, uuid\)[\s\S]*to service_role/);
});
