import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveAskPetSelection } from "../app/lib/ask-pet-selection.ts";
import { activePetsOnly, featureRequiresActivePet, getPetLifecycleStatus } from "../app/lib/pet-lifecycle.ts";
import { executeFurviseApplicationAction, prepareFurviseApplicationActions } from "../app/lib/application-actions/index.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/20260818084249_add_pet_profile_lifecycle_v1.sql";
const migration = read(migrationPath);

test("migration adds a backward-compatible active projection without rewriting existing rows", () => {
  assert.match(migration, /add column if not exists lifecycle_status text not null default 'active'/);
  assert.match(migration, /add column if not exists lifecycle_changed_at timestamptz/);
  assert.match(migration, /add column if not exists deceased_at timestamptz/);
  assert.doesNotMatch(migration, /update public\.dog_profiles\s+set lifecycle_status/i);
  assert.match(migration, /lifecycle_status in \('active', 'deceased', 'archived'\)/);
  assert.match(migration, /validate constraint dog_profiles_lifecycle_status_check/);
  assert.match(migration, /dog_profiles_owner_lifecycle_idx[\s\S]*user_id, lifecycle_status, updated_at desc/);
  assert.match(migration, /tg_op = 'INSERT'[\s\S]*new\.lifecycle_status := 'active'/);
  assert.match(read("app/lib/operations/readiness.ts"), /REQUIRED_CORE_MIGRATION = "20260818084249"/);
});

test("server-owned transition timestamps preserve death provenance on correction", () => {
  assert.match(migration, /v_changed_at timestamptz := clock_timestamp\(\)/);
  assert.match(migration, /new\.lifecycle_changed_at := v_changed_at/);
  assert.match(migration, /new\.lifecycle_status = 'deceased'[\s\S]*new\.deceased_at := v_changed_at/);
  assert.match(migration, /Reacti(?:vation|vation)[\s\S]*preserve[\s\S]*new\.deceased_at := old\.deceased_at/i);
  assert.match(migration, /deceased_at is null or deceased_at <= lifecycle_changed_at/);
  assert.doesNotMatch(read("app/lib/application-actions/executor.ts"), /status === "deceased" \? now : null/);
});

test("Ask lifecycle actions verify server results and never clear deceased provenance on reactivation", async () => {
  const updates = [];
  class Query {
    constructor() { this.value = null; }
    update(value) { this.value = value; updates.push(value); return this; }
    select() { return this; }
    eq() { return this; }
    maybeSingle() {
      if (!this.value) return Promise.resolve({ data: { id: "pet-mani" }, error: null });
      const status = this.value.lifecycle_status;
      return Promise.resolve({ data: {
        id: "pet-mani", lifecycle_status: status, lifecycle_changed_at: "2026-08-18T12:00:00Z",
        deceased_at: status === "deceased" ? "2026-08-18T12:00:00Z" : "2026-08-18T12:00:00Z",
      }, error: null });
    }
  }
  const supabase = { from(table) { assert.equal(table, "dog_profiles"); return new Query(); } };
  const makeAction = (kind, evidence) => prepareFurviseApplicationActions({
    petId: "pet-mani", petName: "Mani", requestId: `request-${kind}`,
    proposals: [{ kind, explicitIntent: true, evidence, input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" } }],
  })[0];
  const deceased = await executeFurviseApplicationAction({ action: makeAction("pet.mark_deceased", "Mani died today"), confirmed: true, sourceMessageId: "message-1", supabase, userId: "user-1" });
  const active = await executeFurviseApplicationAction({ action: makeAction("pet.mark_active", "Mark Mani active again"), confirmed: true, sourceMessageId: "message-2", supabase, userId: "user-1" });
  assert.equal(deceased.action.status, "succeeded");
  assert.equal(active.action.status, "succeeded");
  assert.equal(typeof updates[0].deceased_at, "string");
  assert.equal(Object.hasOwn(updates[1], "deceased_at"), false);
  assert.equal(Object.hasOwn(updates[1], "lifecycle_changed_at"), false);
});

test("reactivation is append-only audited with owner-only RLS", () => {
  assert.match(migration, /create table if not exists public\.pet_profile_lifecycle_events/);
  assert.match(migration, /from_status <> to_status/);
  assert.match(migration, /after update of lifecycle_status/);
  assert.match(migration, /insert into public\.pet_profile_lifecycle_events/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(migration, /revoke all privileges on table public\.pet_profile_lifecycle_events\s+from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select on table public\.pet_profile_lifecycle_events\s+to authenticated, service_role/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all privileges)[\s\S]*to authenticated/i);
});

test("lifecycle audit functions are private, non-callable, and attribution is role-first", () => {
  assert.match(migration, /revoke all on schema private\s+from public, anon, authenticated, service_role/);
  assert.equal((migration.match(/set search_path = pg_catalog, pg_temp/g) || []).length, 2);
  assert.match(migration, /revoke all on function private\.prepare_pet_profile_lifecycle_transition\(\)\s+from public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on function private\.audit_pet_profile_lifecycle_transition\(\)\s+from public, anon, authenticated, service_role/);
  assert.match(migration, /v_actor_role text := coalesce\(current_setting\('request\.jwt\.claim\.role', true\), ''\)/);
  assert.match(migration, /when v_actor_role = 'service_role' then null\s+else v_actor_user_id/);
  assert.match(migration, /when v_actor_role = 'service_role' then 'service_role'\s+when v_actor_user_id is not null then 'authenticated_user'/);
  assert.doesNotMatch(migration, /auth\.role\(\)/);
  assert.doesNotMatch(migration, /insert into pet_profile_lifecycle_events/);
});

test("deletion and account deletion remain separate cascade operations", () => {
  assert.match(migration, /pet_profile_id uuid not null references public\.dog_profiles\(id\) on delete cascade/);
  assert.match(migration, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(read("app/lib/application-actions/executor.ts"), /case "pet\.delete_permanently"[\s\S]*deletePet/);
  assert.match(read("app/api/pets/[id]/route.ts"), /from\("dog_profiles"\)\.delete\(\)/);
});

test("active workflow helpers exclude retained profiles but intentional Ask access remains possible", () => {
  const pets = [
    { id: "active", lifecycle_status: "active", created_at: "2026-01-01" },
    { id: "passed", lifecycle_status: "deceased", created_at: "2025-01-01" },
    { id: "archived", lifecycle_status: "archived", created_at: "2024-01-01" },
  ];
  assert.deepEqual(activePetsOnly(pets).map((pet) => pet.id), ["active"]);
  assert.equal(resolveAskPetSelection({ pets, storedPetId: "passed" }), "active");
  assert.equal(resolveAskPetSelection({ pets, explicitPetId: "passed", storedPetId: "active" }), "passed");
  assert.equal(resolveAskPetSelection({ pets, boundConversationPetId: "archived" }), "archived");
  assert.equal(resolveAskPetSelection({ pets: pets.slice(1), storedPetId: "passed" }), "");
  assert.equal(getPetLifecycleStatus({}), "active");
});

test("routine product and care-plan features require an active pet while Ask and retrospective summaries do not", () => {
  for (const feature of ["product_question", "product_query_interpretation", "product_explanation", "care_plan"]) {
    assert.equal(featureRequiresActivePet(feature), true, feature);
  }
  assert.equal(featureRequiresActivePet("ask"), false);
  assert.equal(featureRequiresActivePet("vet_brief"), false);
  const context = read("app/lib/intelligence/retrieve-context.ts");
  assert.match(context, /featureRequiresActivePet\(feature\)/);
  assert.match(context, /pet\.id === selectedProfile\.id \|\| getPetLifecycleStatus\(pet\) === "active"/);
  assert.match(read("app/api/shop/catalog/route.ts"), /!isActivePet\(memory\.pet\)/);
});

test("Today, homepage, History, profile, Vet Brief, and export honor retained lifecycle state", () => {
  assert.match(read("app/dashboard/page.tsx"), /activePetsOnly\(profileRows\)/);
  assert.match(read("app/components/homepage-client.tsx"), /activePetsOnly\(profiles\)/);
  assert.match(read("app/components/care-log-workspace.tsx"), /canCreateUpdate[\s\S]*isActivePet/);
  assert.match(read("app/pets/[id]/page.tsx"), /lifecycleStatus === "active" && concerns\.length/);
  assert.match(read("app/lib/vet-brief/builder.ts"), /lifecycle_status \|\| "active"\) !== "active"/);
  assert.match(read("app/lib/operations/user-data-export.ts"), /pet_profile_lifecycle_events/);
});

test("rollback-only SQL covers transitions, hostile RLS, retained history, deletion, and trusted cleanup", () => {
  const sql = read("supabase/tests/pet_profile_lifecycle_v1.sql");
  assert.match(sql, /^begin;/);
  assert.match(sql, /active to deceased/);
  assert.match(sql, /deceased to active correction/);
  assert.match(sql, /active to archived/);
  assert.match(sql, /cross-tenant lifecycle mutation succeeded/);
  assert.match(sql, /deceased pet history is no longer readable/);
  assert.match(sql, /permanent pet deletion/);
  assert.match(sql, /service-role lifecycle transition/);
  assert.match(sql, /authenticated lifecycle audit privileges are not select-only/);
  assert.match(sql, /service-role lifecycle audit privileges are not select-only/);
  assert.match(sql, /anonymous lifecycle audit privileges were not fully revoked/);
  assert.match(sql, /authenticated lifecycle transition attribution is invalid/);
  assert.match(sql, /system lifecycle transition attribution is invalid/);
  assert.match(sql, /account deletion/);
  assert.match(sql, /rollback;\s*$/);
});
