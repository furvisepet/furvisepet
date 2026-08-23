import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAskConversationResponse, parseAskConversationResponse } from "../app/lib/ask.mjs";
import {
  FURVISE_ACTION_KINDS,
  containsUnverifiedStateClaim,
  enforceVerifiedStateClaims,
  executeFurviseApplicationAction,
  getFurviseActionPolicy,
  getFurviseMemoryDefinition,
  parseModelApplicationActions,
  prepareFurviseApplicationActions,
  shouldAutoExecuteAction,
} from "../app/lib/application-actions/index.ts";
import { getAskPresentationMode, shouldShowSuggestedQuestions } from "../app/lib/ask-experience.ts";
import { orchestrateAskTurn } from "../app/lib/ai/ask-orchestrator.ts";
import { buildVetBriefDraft } from "../app/lib/vet-brief/builder.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const askRoute = read("app/api/ask/route.ts");
const actionRoute = read("app/api/ask/actions/[messageId]/route.ts");
const askPage = read("app/ask/page.tsx");
const reasoning = read("app/lib/ai/ask-reasoning.ts");

test("the typed action registry covers application domains with server-owned safety policy", () => {
  for (const kind of [
    "pet.read", "pet.update_profile", "pet.mark_deceased", "pet.mark_active", "pet.archive", "pet.delete_permanently",
    "memory.list", "memory.set_preference", "memory.forget_preference", "memory.edit_detail",
    "care_history.add", "care_history.edit", "care_history.remove", "care_history.query",
    "care_state.resolve", "care_state.reopen", "vet_brief.prepare", "navigation.open_pet_profile",
  ]) assert.ok(FURVISE_ACTION_KINDS.includes(kind), kind);
  assert.equal(getFurviseActionPolicy("navigation.open_pet_profile").safetyClass, "READ_ONLY");
  assert.equal(getFurviseActionPolicy("memory.set_preference").safetyClass, "LOW_RISK_REVERSIBLE");
  assert.equal(getFurviseActionPolicy("pet.mark_deceased").confirmationPolicy, "always");
  assert.equal(getFurviseActionPolicy("pet.delete_permanently").safetyClass, "DESTRUCTIVE");
});

test("model actions require grounded evidence and are rebound to the server-selected pet", () => {
  const source = "Change Mani's weight to 4.2 kg.";
  const proposals = parseModelApplicationActions([{
    kind: "pet.update_profile", explicitIntent: true, evidence: "Change Mani's weight to 4.2 kg",
    input: { field: "weight", value: "4.2 kg", title: null, detail: null, category: null, target: "selected" },
  }, {
    kind: "pet.delete_permanently", explicitIntent: true, evidence: "delete her",
    input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
  }], source);
  assert.equal(proposals.length, 1);
  const [action] = prepareFurviseApplicationActions({ proposals, petId: "pet-mani", petName: "Mani", requestId: "request-1", sourceMessage: source });
  assert.equal(action.petId, "pet-mani");
  assert.equal(action.authorizationScope, "owned_pet");
  assert.equal(action.safetyClass, "LOW_RISK_REVERSIBLE");
  assert.equal(shouldAutoExecuteAction(action), true);
});

test("a model cannot manufacture explicit owner intent to auto-execute a mutation", () => {
  const [action] = prepareFurviseApplicationActions({
    petId: "pet-mani", petName: "Mani", requestId: "request-untrusted-intent",
    sourceMessage: "Mani weighs 4.2 kg",
    proposals: [{
      kind: "pet.update_profile", explicitIntent: true, evidence: "Mani weighs 4.2 kg",
      input: { field: "weight", value: "4.2 kg", title: null, detail: null, category: null, target: "selected" },
    }],
  });
  assert.equal(action.explicitIntent, false);
  assert.equal(shouldAutoExecuteAction(action), false);
  assert.equal(action.status, "proposed");
});

test("uncertain death cannot produce a lifecycle mutation while confirmed death requires confirmation", () => {
  const input = (evidence, explicitIntent = true) => ({
    kind: "pet.mark_deceased", explicitIntent, evidence,
    input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
  });
  assert.equal(prepareFurviseApplicationActions({ proposals: [input("I think she may have died")], petId: "pet", petName: "Mani", requestId: "r" }).length, 0);
  const [confirmed] = prepareFurviseApplicationActions({ proposals: [input("Mani died today")], petId: "pet", petName: "Mani", requestId: "r" });
  assert.equal(confirmed.status, "confirmation_required");
  assert.equal(confirmed.confirmationPolicy, "always");
  assert.equal(confirmed.kind, "pet.mark_deceased");
});

test("authoritative mutation claims are removed unless an executor verified success", () => {
  for (const claim of [
    "I saved that to her history.",
    "Okay, I'll treat the Hindi one as removed and keep English only.",
    "Her profile has been updated.",
  ]) {
    assert.equal(containsUnverifiedStateClaim(claim), true, claim);
    assert.equal(containsUnverifiedStateClaim(enforceVerifiedStateClaims(claim, false)), false, claim);
  }
  assert.equal(enforceVerifiedStateClaims("Her profile has been updated.", true), "Her profile has been updated.");
  assert.equal(enforceVerifiedStateClaims("That's the relevant part. If you want, I can help make a checklist.", false), "That's the relevant part");
  assert.match(askRoute, /enforceAnswerStateClaims\(orchestration\.answer\)/);
  assert.match(askRoute, /executeActionCapability/);
  assert.doesNotMatch(askRoute, /executeFurviseApplicationAction/);
});

test("USER singleton memory is distinct from PET and ephemeral CONVERSATION state", () => {
  assert.deepEqual(getFurviseMemoryDefinition("preferred_language"), { scope: "USER", cardinality: "singleton", durable: true });
  assert.deepEqual(getFurviseMemoryDefinition("food_sensitivity"), { scope: "PET", cardinality: "multiple", durable: true });
  assert.deepEqual(getFurviseMemoryDefinition("current_turn_reference"), { scope: "CONVERSATION", cardinality: "multiple", durable: false });
  assert.match(reasoning, /singleton USER communication preferences/);
  assert.match(reasoning, /A newer singleton value replaces the older value/);
});

test("language replacement executes against canonical memory and supersedes conflicting canonical and legacy rows", async () => {
  const db = preferenceSupabaseMock();
  const planned = prepareFurviseApplicationActions({
    petId: "pet-mani", petName: "Mani", requestId: "request-language",
    proposals: [{
      kind: "memory.set_preference", explicitIntent: true, evidence: "Forget Hindi and keep English",
      input: { field: "preferred_language", value: "English", title: null, detail: null, category: null, target: "selected" },
    }, {
      kind: "memory.forget_preference", explicitIntent: true, evidence: "Forget Hindi",
      input: { field: "preferred_language", value: null, title: null, detail: null, category: null, target: "selected" },
    }],
  });
  assert.equal(planned.length, 1);
  const [action] = planned;
  const result = await executeFurviseApplicationAction({ action, confirmed: false, sourceMessageId: "message-user", supabase: db.client, userId: "user-1" });
  assert.equal(result.action.status, "succeeded");
  assert.equal(result.action.resultMessage, "The preferred language was changed to English.");
  assert.ok(db.updates.some((item) => item.table === "furvise_memories" && item.value.status === "superseded"));
  assert.ok(db.updates.some((item) => item.table === "dog_memories" && item.value.status === "superseded"));
  assert.equal(db.rpcCalls[0].name, "persist_furvise_intelligence");
  assert.equal(db.rpcCalls[0].args.p_learnings[0].subjectType, "owner");
  assert.equal(db.rpcCalls[0].args.p_learnings[0].factKey, "preferred_language");
});

test("language replacement cannot claim success when an old conflicting preference remains active", async () => {
  const db = preferenceSupabaseMock("dog_memories");
  const [action] = prepareFurviseApplicationActions({
    petId: "pet-mani", petName: "Mani", requestId: "request-language-failure",
    proposals: [{
      kind: "memory.set_preference", explicitIntent: true, evidence: "Switch to French",
      input: { field: "preferred_language", value: "French", title: null, detail: null, category: null, target: "selected" },
    }],
  });
  const result = await executeFurviseApplicationAction({ action, confirmed: false, sourceMessageId: "message-user", supabase: db.client, userId: "user-1" });
  assert.equal(result.action.status, "failed");
  assert.equal(result.action.resultMessage, null);
  assert.equal(result.changed, false);
});

test("application actions round-trip in the canonical Ask response", () => {
  const [action] = prepareFurviseApplicationActions({
    petId: "pet-mani", petName: "Mani", requestId: "request-nav",
    proposals: [{
      kind: "navigation.open_pet_profile", explicitIntent: true, evidence: "Take me to her profile",
      input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
    }],
  });
  const response = buildAskConversationResponse({ title: "Furvise", summary: "Here you go.", sections: [], safetyNote: null }, { applicationActions: [action] });
  const parsed = parseAskConversationResponse(response);
  assert.equal(parsed.applicationActions[0].kind, "navigation.open_pet_profile");
  assert.equal(parsed.applicationActions[0].href, "/pets/pet-mani");
  assert.equal(parsed.applicationActions[0].status, "proposed");
});

test("the confirmation endpoint accepts only a persisted action id and decision", () => {
  assert.match(actionRoute, /hasOnlyKeys\(rawBody, \["actionId", "decision"\]\)/);
  assert.match(actionRoute, /executeActionCapability/);
  assert.match(actionRoute, /assistantMessageId: messageId/);
  assert.match(actionRoute, /userId: auth\.userId/);
  assert.doesNotMatch(actionRoute, /response_data|parseStoredApplicationActions/);
  assert.doesNotMatch(actionRoute, /OPENAI|runAdmittedAiOperation|reserveAiCredit|completeAiCredit/);
});

test("executor denies an action for a pet the authenticated user does not own", async () => {
  const [action] = prepareFurviseApplicationActions({
    petId: "pet-other", petName: "Other", requestId: "request-owner",
    proposals: [{
      kind: "pet.update_profile", explicitIntent: true, evidence: "Change her weight to 4.2 kg",
      input: { field: "weight", value: "4.2 kg", title: null, detail: null, category: null, target: "selected" },
    }],
  });
  const client = {
    from(table) {
      assert.equal(table, "dog_profiles");
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      };
    },
  };
  const execution = await executeFurviseApplicationAction({ action, confirmed: false, sourceMessageId: "message-user", supabase: client, userId: "user-1" });
  assert.equal(execution.action.status, "failed");
  assert.equal(execution.changed, false);
  assert.equal(execution.audit.authorization, "denied");
});

test("confirmation-required and destructive actions cannot execute before confirmation", async () => {
  for (const kind of ["pet.mark_deceased", "pet.archive", "pet.delete_permanently"]) {
    const [action] = prepareFurviseApplicationActions({
      petId: "pet-mani", petName: "Mani", requestId: `request-${kind}`,
      proposals: [{
        kind, explicitIntent: true, evidence: kind === "pet.mark_deceased" ? "Mani died today" : kind === "pet.archive" ? "Archive Mani" : "Delete Mani",
        input: { field: null, value: null, title: null, detail: null, category: null, target: "selected" },
      }],
    });
    const execution = await executeFurviseApplicationAction({
      action,
      confirmed: false,
      sourceMessageId: "message-user",
      supabase: { from() { throw new Error("storage must not be touched before confirmation"); } },
      userId: "user-1",
    });
    assert.equal(execution.action.status, "confirmation_required", kind);
    assert.equal(execution.changed, false, kind);
  }
});

test("stale acknowledgement titles do not inherit legacy urgent presentation", async () => {
  const routine = concern({ severity: "routine", status: "monitoring" });
  const routineResult = await orchestrateAskTurn({ concerns: [routine], message: "ok", petName: "Mani", generationInput: {}, generate: async () => { throw new Error("should not generate"); } });
  assert.equal(routineResult.safetyLevel, "normal");
  assert.equal(routineResult.answer.title, "Furvise");
  assert.doesNotMatch(routineResult.answer.title, /Urgent care guidance/);

  const urgent = concern({ severity: "urgent", status: "active", normalized_key: "breathing", title: "Breathing trouble" });
  const urgentResult = await orchestrateAskTurn({ concerns: [urgent], message: "thanks", petName: "Mani", generationInput: {}, generate: async () => { throw new Error("should not generate"); } });
  assert.equal(urgentResult.safetyLevel, "urgent");
  assert.match(urgentResult.answer.title, /breathing still needs urgent attention/i);
});

test("grief is a distinct non-playful mode and suppresses generic suggestions", () => {
  const grief = { answerType: "direct_answer", sections: [], safetyNote: null, urgency: "routine", interactionMode: "grief" };
  assert.equal(getAskPresentationMode(grief, "so what now"), "grief");
  assert.equal(shouldShowSuggestedQuestions(grief, "so what now"), false);
  assert.match(reasoning, /responseMode=grief_support/);
  assert.match(askPage, /data-ui="furvise-assistant-identity"><BrandMark showName=\{false\} size=\{24\}/);
  assert.doesNotMatch(askPage, /nav-ask-v1\.webp/);
  assert.match(askPage, /messageVariant === "GRIEF" \|\| lifecycleStatus !== "active" \? \["copy"\]/);
});

test("deceased-pet summaries are retrospective and do not fabricate a future appointment", () => {
  const draft = buildVetBriefDraft({
    profile: profile({ lifecycle_status: "deceased", deceased_at: "2026-08-18T10:00:00Z" }),
    careEntries: [], memories: [], conversation: [{ role: "user", text: "Can you summarize everything that happened?" }],
    from: "2026-08-01", to: "2026-08-18",
  });
  assert.equal(draft.document.title, "Furvise Care History Summary");
  assert.equal(draft.document.reasonForVisit, "Retrospective care-history summary");
  assert.deepEqual(draft.document.questionsForVeterinarian, []);
  assert.doesNotMatch(JSON.stringify(draft.document), /next vet visit/i);
});

test("lifecycle schema is approval-gated and Ask defaults safely before it exists", () => {
  const proposal = read("docs/schema-proposals/furvise-pet-lifecycle-v1.sql");
  assert.match(proposal, /APPROVAL-GATED SCHEMA PROPOSAL/);
  assert.match(proposal, /lifecycle_status in \('active', 'deceased', 'archived'\)/);
  assert.match(proposal, /retain history/i);
  assert.doesNotMatch(read("supabase/schema.sql"), /lifecycle_status/);
});

test("one canonical assistant surface uses restrained semantic accents and action cards", () => {
  assert.match(askPage, /data-ask-semantic/);
  assert.match(askPage, /bg-\[var\(--assistant-response-surface\)\]/);
  assert.match(askPage, /data-ui="furvise-application-actions"/);
  assert.match(askPage, /data-action-safety/);
  assert.match(askPage, /data-action-status="succeeded"/);
  assert.doesNotMatch(askPage, /presentation === "casual" \? "w-fit[\s\S]*assistant-response-strong/);
});

test("pet characterization and follow-up governance are evidence based", () => {
  assert.match(reasoning, /Derive pet characterizations from supplied concrete observations/);
  assert.match(reasoning, /avoid generic flattering labels/);
  assert.match(reasoning, /Never write assistant offers beginning If you want, I can/);
  assert.match(askRoute, /enforceVerifiedStateClaims/);
});

function concern(overrides = {}) {
  return {
    id: "concern-1", user_id: "user-1", pet_profile_id: "pet-mani", title: "Mirror scratching",
    normalized_key: "mirror_scratching", status: "monitoring", severity: "routine", source_care_entry_id: null,
    opened_at: "2026-08-18T00:00:00Z", updated_at: "2026-08-18T01:00:00Z", resolved_at: null, resolution_note: null,
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    id: "pet-mani", user_id: "user-1", name: "Mani", species: "cat", breed: null,
    age_value: 3, age_unit: "years", weight_value: 4.2, weight_unit: "kg", current_food: null,
    main_concern: null, wellness_goal: null, avoid_ingredients: [], monthly_budget: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-08-18T00:00:00Z", ...overrides,
  };
}

function preferenceSupabaseMock(failedUpdateTable = "") {
  const updates = [];
  const rpcCalls = [];
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.limitValue = null; this.operation = "select"; this.value = null; }
    select() { return this; }
    update(value) { this.operation = "update"; this.value = value; updates.push({ table: this.table, value }); return this; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    in(key, value) { this.filters.push([key, value]); return this; }
    limit(value) { this.limitValue = value; return this; }
    maybeSingle() {
      if (this.table === "dog_profiles") return Promise.resolve({ data: { id: "pet-mani" }, error: null });
      if (this.table === "furvise_memories") return Promise.resolve({ data: { id: "memory-english" }, error: null });
      return Promise.resolve({ data: null, error: null });
    }
    then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); }
    result() {
      if (this.operation === "update") return this.table === failedUpdateTable
        ? { data: null, error: { message: "simulated update failure" } }
        : { data: [{ id: "updated" }], error: null };
      if (this.table === "furvise_memories") return { data: [
        { id: "memory-english", fact_key: "preferred_language", category: "communication_preference" },
        { id: "memory-hindi", fact_key: "language_preference", category: "communication_preference" },
      ], error: null };
      if (this.table === "dog_memories") return { data: [{ id: "legacy-hindi", type: "preference", text: "speak Hindi only" }], error: null };
      return { data: [], error: null };
    }
  }
  const client = {
    from(table) { return new Query(table); },
    rpc(name, args) { rpcCalls.push({ name, args }); return Promise.resolve({ data: [{ memories_created: 1, memories_superseded: 1 }], error: null }); },
  };
  return { client, updates, rpcCalls };
}
