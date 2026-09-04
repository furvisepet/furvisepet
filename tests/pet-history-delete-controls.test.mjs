import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const petPage = read("app/dogs/[id]/edit/page.tsx");
const petCompatibilityPage = read("app/pets/[id]/edit/page.tsx");
const petClientState = read("app/lib/pet-delete-client-state.ts");
const petRoute = read("app/api/pets/[id]/route.ts");
const petBoundary = read("supabase/migrations/20260821050646_repair_permanent_pet_delete_admin_role.sql");
const history = read("app/components/history-archive.tsx");
const supabaseClient = read("app/lib/supabase.ts");
const careRoute = read("app/api/care-entries/[id]/route.ts");
const historyMigration = read("supabase/migrations/20260811120000_add_history_lifecycle_dismissal.sql");
const lifecycleFoundation = read("supabase/migrations/20260810230000_add_lifecycle_integrity_foundation.sql");

test("pet delete is a loaded-page secondary section shared by both compatibility routes", () => {
  assert.match(petCompatibilityPage, /export \{ default \} from "\.\.\/\.\.\/\.\.\/dogs\/\[id\]\/edit\/page"/);
  assert.ok(petPage.indexOf("<SimplePetProfileForm") < petPage.indexOf("DELETE PET"));
  assert.match(petPage, /loading[\s\S]*SimplePetProfileForm[\s\S]*delete-pet-heading/);
  const header = petPage.slice(petPage.indexOf("<PageHeader"), petPage.indexOf("/>", petPage.indexOf("<PageHeader")));
  assert.doesNotMatch(header, /actions=|primaryAction=|Delete pet/);
});

test("pet delete confirmation names the pet and requires exact DELETE", () => {
  assert.match(petPage, /Permanently delete \{petName\}\?/);
  assert.match(petPage, /deleteConfirmation !== "DELETE"/);
  assert.match(petPage, /disabled=\{deleting \|\| deleteConfirmation !== "DELETE"\}/);
  assert.match(petPage, /Limited provenance and security records may be retained/);
  assert.match(petPage, /session is older than 15 minutes/);
});

test("pet delete uses the authenticated idempotent API contract and cannot double submit", () => {
  assert.match(petPage, /idempotentClientFetch\([\s\S]*`\/api\/pets\/\$\{encodeURIComponent\(petId\)\}`/);
  assert.match(petPage, /body: JSON\.stringify\(\{ confirmation: "DELETE" \}\)/);
  assert.match(petPage, /Authorization: `Bearer \$\{data\.session\.access_token\}`/);
  assert.match(petPage, /method: "DELETE"/);
  assert.match(petPage, /`pet-delete:\$\{petId\}`/);
  assert.match(petPage, /if \(deleting \|\| deleteConfirmation !== "DELETE" \|\| !authUser\) return/);
  assert.match(petPage, /disabled=\{deleting/);
});

test("successful pet deletion clears canonical browser state and navigates without the dirty guard", () => {
  for (const evidence of [
    /clearActivePetId\(storage\.localStorage, petId\)/,
    /clearEditPetOnboardingDraft\(storage\.localStorage, petId\)/,
    /removeAskDraft\(storage\.localStorage, null, petId\)/,
    /clearVetBriefClientDraftsForPet\(storage\.localStorage, userId, petId\)/,
    /removeLocalPhoto\("pet", petId\)/,
  ]) assert.match(petClientState, evidence);
  assert.match(petPage, /deletionCompletedRef\.current = true/);
  assert.match(petPage, /markAppDataChanged\(\)/);
  assert.match(petPage, /router\.replace\("\/pets"\)/);
  assert.match(petPage, /router\.refresh\(\)/);
  assert.match(petPage, /if \(deletionCompletedRef\.current\) return/);
});

test("pet failures retain confirmation and surface recent-auth, rate-limit, and retryable errors", () => {
  assert.match(petPage, /response\.status === 404[\s\S]*finishPetDeletion/);
  assert.match(petPage, /response\.status === 429/);
  assert.match(petPage, /response\.status === 503/);
  assert.match(petPage, /setDeleteError/);
  assert.doesNotMatch(petPage, /catch[\s\S]{0,250}router\.(?:push|replace)/);
  assert.match(petRoute, /code: recentAuth\.code/);
  assert.match(petRoute, /sign in again before permanently deleting this pet/);
});

test("pet delete backend authority remains authenticated, owner-bound, confirmed, recent, and service-only", () => {
  assert.match(petRoute, /getAuthenticatedApiContext\(request\)/);
  assert.match(petRoute, /\.confirmation !== "DELETE"/);
  assert.match(petRoute, /requireRecentInteractiveAuthentication\(auth\)/);
  assert.match(petRoute, /operationType: "profile\.delete"/);
  assert.match(petRoute, /\.eq\("id", id\)\.eq\("user_id", auth\.userId\)/);
  assert.match(petRoute, /p_pet_id: id, p_user_id: auth\.userId/);
  assert.match(petBoundary, /auth\.role\(\)[\s\S]*'service_role'/);
  assert.match(petBoundary, /revoke all[\s\S]*public, anon, authenticated, service_role/);
  assert.match(petBoundary, /grant execute[\s\S]*to service_role/);
});

test("History rows open details and removal requires a deliberate confirmation", () => {
  assert.match(history, /onClick=\{\(event\) => onOpen\(entry, event\.currentTarget\)\}/);
  assert.match(history, />Remove from history<\/button>/);
  assert.match(history, /data-ui="history-remove-confirmation"/);
  assert.match(history, /Remove this entry from History\?/);
  assert.match(history, /onClick=\{prepareRemoval\}/);
  assert.match(history, /onClick=\{\(\) => void removeFromHistory\(\)\}/);
});

test("History removal uses the existing authenticated idempotent DELETE integration", () => {
  assert.match(history, /await removeCareEntryFromHistory\(entryId\)/);
  assert.match(supabaseClient, /removeCareEntryFromHistory[\s\S]*`\/api\/care-entries\/\$\{entryId\}`[\s\S]*method: "DELETE"/);
  assert.match(supabaseClient, /authenticatedApiFetch[\s\S]*headers\.set\("authorization", `Bearer \$\{token\}`\)/);
  assert.match(supabaseClient, /idempotentClientFetch\(path, authenticatedInit, `\$\{method\}:\$\{path\}`\)/);
  assert.match(history, /if \(!displayedEntry \|\| removing\) return/);
  assert.match(history, /disabled=\{removing\}/);
});

test("History success removes only the selected row while preserving filters and refreshing dependents", () => {
  assert.match(history, /entries\.filter\(\(entry\) => entry\.id !== entryId\)/);
  assert.match(history, /params\.delete\("entry"\)/);
  assert.doesNotMatch(history, /removeFromHistory[\s\S]{0,1200}setSearch\(|removeFromHistory[\s\S]{0,1200}setSelectedPet\(|removeFromHistory[\s\S]{0,1200}setSelectedCategory\(|removeFromHistory[\s\S]{0,1200}setSelectedWhen\(/);
  assert.match(history, /markAppDataChanged\(\)/);
  assert.match(history, /hasAnyHistoryArchiveEntries\(\)\.then\(setHasAnyHistory\)/);
  assert.match(history, /setHasAnyHistory\(false\)/);
  assert.doesNotMatch(history, /location\.reload/);
});

test("History failures retain the row and confirmation with an announced bounded error", () => {
  const removal = history.slice(history.indexOf("async function removeFromHistory"), history.indexOf("return (", history.indexOf("async function removeFromHistory")));
  assert.match(removal, /catch \(removeFailure\)[\s\S]*setRemoveError/);
  assert.doesNotMatch(removal.slice(removal.indexOf("catch")), /setEntries|setActiveEntry\(null\)|removeHistoryEntrySearchParameter/);
  assert.match(history, /aria-live="assertive"/);
  assert.match(history, /role="alert"/);
});

test("History detail dialog contains focus, supports Escape, and returns focus deliberately", () => {
  assert.match(history, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(history, /querySelectorAll<HTMLElement>[\s\S]*button:not\(\[disabled\]\)/);
  assert.match(history, /event\.key === "Tab"/);
  assert.match(history, /event\.key !== "Escape" \|\| removing/);
  assert.match(history, /openerRef\.current\?\.focus\(\)/);
  assert.match(history, /removeButtonRef\.current\?\.focus\(\)/);
  assert.match(history, /removalStatusRef\.current\?\.focus\(\)/);
  assert.match(history, /max-h-\[100dvh\][\s\S]*overflow-y-auto/);
});

test("History backend remains owner-bound, tombstoned, isolated, and provenance-preserving", () => {
  assert.match(careRoute, /getAuthenticatedApiContext\(request\)/);
  assert.match(careRoute, /operationType: "care\.remove_history"/);
  assert.match(careRoute, /\.eq\("id", id\)\.eq\("user_id", context\.userId\)/);
  assert.match(careRoute, /remove_my_care_entry/);
  assert.match(careRoute, /p_stop_tracking: true/);
  assert.doesNotMatch(careRoute, /from\("pet_care_entries"\)\.delete\(\)/);
  assert.match(historyMigration, /v_user uuid := auth\.uid\(\)/);
  assert.match(historyMigration, /where id = p_entry_id and user_id = v_user for update/);
  assert.match(historyMigration, /deleted_at = now\(\)[\s\S]*deletion_reason = 'user_removed'/);
  assert.doesNotMatch(historyMigration, /delete from public\.pet_care_entries/);
  assert.doesNotMatch(historyMigration, /delete from public\.pet_care_episode_events/);
  assert.match(lifecycleFoundation, /revoke delete on public\.pet_care_entries from authenticated/);
});
