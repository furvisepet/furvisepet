import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveAskPetSelection } from "../app/lib/ask-pet-selection.ts";
import { activePetsOnly, featureRequiresActivePet, getPetLifecycleStatus } from "../app/lib/pet-lifecycle.ts";
import { bindLifecyclePlan } from "../app/lib/furvise-brain/lifecycle-plan.ts";
import { prepareBoundLifecycleAction } from "../app/lib/application-actions/planner.ts";
import { authorizeFurviseActionExecution } from "../app/lib/furvise-brain/action-organ.ts";

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
  const readiness = read("app/lib/operations/readiness.ts");
  assert.match(readiness, /REQUIRED_SECURITY_MIGRATION_NAMES/);
  assert.match(readiness, /"add_pet_profile_lifecycle_v1"/);
});

test("server-owned transition timestamps preserve death provenance on correction", () => {
  assert.match(migration, /v_changed_at timestamptz := clock_timestamp\(\)/);
  assert.match(migration, /new\.lifecycle_changed_at := v_changed_at/);
  assert.match(migration, /new\.lifecycle_status = 'deceased'[\s\S]*new\.deceased_at := v_changed_at/);
  assert.match(migration, /Reacti(?:vation|vation)[\s\S]*preserve[\s\S]*new\.deceased_at := old\.deceased_at/i);
  assert.match(migration, /deceased_at is null or deceased_at <= lifecycle_changed_at/);
  assert.doesNotMatch(read("app/lib/application-actions/index.ts"), /executor\.ts/);
});

test("Ask lifecycle transitions use capabilities; durable SQL preserves prior death provenance",()=>{
 const pet={id:"pet-mani",name:"Mani",user_id:"user-1",lifecycle_status:"deceased"};
 const text="Apply the requested transition.",context={owner:{userId:"user-1"},eligiblePets:[pet],
  currentMessage:text,currentTurn:{id:"source",role:"user",text},lifecycleActionState:{ownerId:"user-1",complete:true,actions:[]}};
 const plan=bindLifecyclePlan({pendingDisposition:"keep",transition:{targetPetName:"Mani",toState:"active"},
  requiredSubjectState:null,authorizationQuote:text},context);
 const action=prepareBoundLifecycleAction(plan,"r");
 assert.equal(action.kind,"pet.mark_active");assert.equal(action.confirmationPolicy,"always");
 assert.throws(()=>authorizeFurviseActionExecution({action,capabilityId:"cap",mode:"auto"}),/CONFIRMATION|AUTO_NOT_AUTHORIZED/);
 const sql=read("supabase/migrations/20260923072555_preserve_canonical_replace_body_fidelity.sql");
 const start=sql.indexOf("  elsif v_error is null and v.action_kind in ('pet.mark_deceased'"),end=sql.indexOf("  elsif v_error is null then",start),branch=sql.slice(start,end);
 assert.match(branch,/when 'pet.mark_active' then 'active'/);
 assert.doesNotMatch(branch,/deceased_at\s*=/);
 assert.match(migration,/new\.deceased_at := old\.deceased_at/);
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
  assert.doesNotMatch(read("app/lib/application-actions/index.ts"), /executor\.ts/);
  assert.match(read("app/api/pets/[id]/route.ts"), /\.rpc\("delete_pet_profile_for_user"/);
  assert.match(read("supabase/migrations/20260821021825_harden_entitlement_and_pet_data_boundaries.sql"), /delete from public\.dog_profiles[\s\S]*where id = p_pet_id and user_id = p_user_id/);
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
});

test("Today, homepage, History, profile, Vet Brief, and export honor retained lifecycle state", () => {
  assert.match(read("app/today/page.tsx"), /activePetsOnly\(profileRows\)/);
  assert.doesNotMatch(read("app/components/homepage-client.tsx"), /loadDogProfilesWithMemories|activePetId|petState/);
  assert.match(read("app/components/care-log-workspace.tsx"), /canCreateUpdate[\s\S]*isActivePet/);
  assert.match(read("app/pets/[id]/page.tsx"), /formatPetDirectoryMetadata\(profile\)/);
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
