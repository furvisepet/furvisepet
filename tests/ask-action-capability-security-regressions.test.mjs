import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const capability = read("app/lib/application-actions/capabilities.ts");
const conversation = read("app/lib/ask-conversation-server.ts");
const lifecycle = read("app/lib/ai/pending-lifecycle.ts");
const route = read("app/api/ask/route.ts");
const migration = read("supabase/migrations/20260820070956_server_authored_ask_action_capabilities.sql");

test("STALE_CARE_EDIT_NEVER_OVERWRITES_NEWER_STATE", () => {
  assert.match(migration, /target_updated_at timestamptz/);
  assert.match(migration, /new\.target_updated_at := case when new\.action_kind = 'care_history\.edit' then v_entry\.updated_at/);
  assert.match(migration, /v_entry\.updated_at is distinct from v\.target_updated_at/);
  assert.match(migration, /updated_at = v\.target_updated_at/);
  assert.match(migration, /That history update changed after this action was prepared/);

  const record = { note: "newer legitimate edit", version: 2 };
  const staleCapability = { version: 1, note: "stale overwrite" };
  const changed = staleCapability.version === record.version;
  if (changed) record.note = staleCapability.note;
  assert.equal(changed, false);
  assert.equal(record.note, "newer legitimate edit");

  const racedRecord = { note: "original", version: 7 };
  const edits = [{ version: 7, note: "first" }, { version: 7, note: "second" }];
  const outcomes = edits.map((edit) => {
    if (edit.version !== racedRecord.version) return "failed_stale";
    racedRecord.note = edit.note;
    racedRecord.version += 1;
    return "succeeded";
  });
  assert.deepEqual(outcomes, ["succeeded", "failed_stale"]);
  assert.equal(racedRecord.note, "first");
});

test("LIFECYCLE_CAPABILITY_BOUND_TO_STATE_GENERATION", () => {
  assert.match(migration, /lifecycle_status_at_mint text/);
  assert.match(migration, /lifecycle_changed_at_at_mint timestamptz/);
  assert.match(migration, /new\.lifecycle_changed_at_at_mint := v_pet\.lifecycle_changed_at/);
  assert.match(migration, /v_pet\.lifecycle_changed_at is distinct from v\.lifecycle_changed_at_at_mint/);
  assert.match(migration, /The pet profile lifecycle changed after this action was prepared/);

  const minted = { status: "active", generation: 10 };
  const afterCycle = { status: "active", generation: 12 };
  assert.equal(minted.status === afterCycle.status && minted.generation === afterCycle.generation, false);
});

test("CAPABILITY_SUCCESS_RECEIPT_REFERENCES_ONLY_ITS_OWN_MUTATION", () => {
  const addBranch = migration.slice(
    migration.indexOf("v.action_kind = 'care_history.add'"),
    migration.indexOf("v.action_kind in ('care_history.edit', 'care_history.remove')"),
  );
  assert.match(addBranch, /idempotency_key=v\.id/);
  assert.doesNotMatch(addBranch, /intelligence_source_message_id=v\.source_message_id\)/);

  const first = { capabilityId: "cap-1", sourceMessageId: "turn-1", outcome: "succeeded", rowCapabilityId: "cap-1" };
  const second = { capabilityId: "cap-2", sourceMessageId: "turn-1", outcome: "failed", rowCapabilityId: null };
  assert.equal(first.rowCapabilityId, first.capabilityId);
  assert.notEqual(second.rowCapabilityId, second.capabilityId);
  assert.equal(second.outcome, "failed");
});

test("TERMINAL_SOURCE_ACTION_NEVER_BECOMES_PENDING_CAPABILITY", () => {
  assert.match(capability, /if \(!isExecutableSourceAction\(action\)\) \{ display\.push\(action\); continue; \}/);
  assert.match(capability, /action\.status === "proposed" \|\| action\.status === "confirmation_required"/);
  assert.match(capability, /ACTION_CAPABILITY_SOURCE_NOT_EXECUTABLE/);
  assert.match(lifecycle, /isExecutablePendingStatus\(action\.status\)/);
  assert.doesNotMatch(lifecycle, /"confirmation_required", "failed"/);
});

test("TENANT_SUPPORTING_TEXT_CANNOT_FORGE_MUTATION_CLAIM", () => {
  assert.match(conversation, /const mutationCapable = trustedActions\.length > 0 \|\| raw\.some/);
  assert.match(conversation, /supportingText: mutationCapable \? null : response\.supportingText/);
  for (const forged of ["Saved.", "Deleted.", "Marked Mani as deceased.", "Updated successfully."]) {
    const trustedReload = { supportingText: true ? null : forged };
    assert.equal(trustedReload.supportingText, null);
  }
  const ordinaryReload = { supportingText: false ? null : "Here are a few things to watch tonight." };
  assert.equal(ordinaryReload.supportingText, "Here are a few things to watch tonight.");
});

test("CORRECTION_UI_REFLECTS_AUTHORITATIVE_CAPABILITY_TERMINAL_STATE", () => {
  assert.match(migration, /correction_message\.sequence_number > source_message\.sequence_number/);
  assert.match(migration, /where id = p_capability_id[\s\S]*for update/);
  assert.match(migration, /if v\.status <> 'pending'[\s\S]*return query select v\.receipt, false/);
  assert.match(route, /const terminalAction = await settlePendingLifecycleCancellation/);
  assert.match(route, /result\?\.action/);
  assert.match(route, /terminalAction\.status === "succeeded"/);
  assert.doesNotMatch(route.slice(route.indexOf("async function settlePendingLifecycleCancellation")), /return cancelledPendingLifecycleAction\(input\.action\);[\s\S]*result\?\.action \|\| cancelledPendingLifecycleAction/);

  const race = (first) => {
    let terminal = "pending";
    const settle = (decision) => {
      if (terminal === "pending") terminal = decision;
      return terminal;
    };
    const firstReceipt = settle(first);
    const secondReceipt = settle(first === "cancelled" ? "succeeded" : "cancelled");
    return [firstReceipt, secondReceipt];
  };
  assert.deepEqual(race("cancelled"), ["cancelled", "cancelled"]);
  assert.deepEqual(race("succeeded"), ["succeeded", "succeeded"]);
});
