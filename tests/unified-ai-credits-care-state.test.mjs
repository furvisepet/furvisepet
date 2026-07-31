import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { orchestrateAskTurn } from "../app/lib/ai/ask-orchestrator.ts";
import { concernFromCareEntry, shouldReopenConcern } from "../app/lib/ai/concern-engine.ts";
import { classifyUserTurn } from "../app/lib/ai/turn-classifier.ts";
import {
  AiCreditLedgerError,
  buildDevelopmentAiCreditFallback,
  getAiCreditLedgerDiagnostic,
  getMonthlyAiAllowance,
  isMissingAiUsageTableError,
} from "../app/lib/ai/usage-ledger.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260727020000_add_unified_ai_credits_and_care_state.sql");
const correctiveMigration = read("supabase/migrations/20260728020000_fix_ai_credit_rpc_ambiguity.sql");
const concernResolutionMigration = read("supabase/migrations/20260728030000_fix_concern_resolution_and_safety_state.sql");
const stateSuggestionMigration = read("supabase/migrations/20260728060000_idempotent_state_suggestions.sql");
const sqlVerification = read("supabase/tests/ai_credit_rpc_verification.sql");
const askRoute = read("app/api/ask/route.ts");
const askPage = read("app/ask/page.tsx");
const contextBuilder = read("app/lib/ai/context-builder.ts");
const suggestionRoute = read("app/api/ask/suggestions/[id]/route.ts");

const activeBreathingConcern = {
  id: "concern-1",
  user_id: "user-1",
  pet_profile_id: "pet-1",
  title: "Shortness of breath",
  normalized_key: "breathing",
  status: "active",
  severity: "urgent",
  source_care_entry_id: "entry-1",
  opened_at: "2026-07-27T09:00:00.000Z",
  updated_at: "2026-07-27T09:00:00.000Z",
  resolved_at: null,
  resolution_note: null,
};

const generationInput = {
  careEntries: [],
  conversationTurns: [],
  locale: "en-CA",
  memories: [],
  productFeedback: [],
  profiles: [],
  question: "She is breathing normally now.",
  recentUpdates: [],
  requestId: "00000000-0000-4000-8000-000000000001",
};

function generatedResult(overrides = {}) {
  return {
    answer: { title: "Furvise", summary: "I’m glad Mani seems better. Keep an eye on breathing and energy for a little while.", sections: [], safetyNote: null },
    userIntent: "status update",
    relevantContextIds: [],
    referencedRecords: [],
    safetyLevel: "monitor",
    shoppingSuppressed: false,
    suggestedFollowUps: [],
    proposedHistoryUpdate: { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null },
    responseMode: "conversational",
    model: "test-model",
    ...overrides,
  };
}

test("the free plan exposes one shared 50-credit monthly allowance", () => {
  assert.equal(getMonthlyAiAllowance("user-1", "free"), 50);
  for (const feature of ["ask", "product_question", "product_explanation", "safety_followup", "vet_brief", "care_plan"]) {
    assert.match(migration, new RegExp(`'${feature}'`));
  }
  assert.match(migration, /unique index if not exists ai_usage_events_user_request_unique[\s\S]*user_id, request_id/);
  assert.match(migration, /status in \('reserved', 'completed', 'released'\)/);
});

test("corrective credit RPCs qualify table columns without changing their contracts", () => {
  for (const signature of [
    /reserve_ai_credit\([\s\S]*returns table\(reservation_status text, credits_used integer, remaining integer\)/,
    /complete_ai_credit\([\s\S]*returns table\(event_status text, credits_used integer, remaining integer\)/,
    /release_ai_credit\([\s\S]*returns table\(event_status text, credits_used integer, remaining integer\)/,
  ]) assert.match(correctiveMigration, signature);
  assert.match(correctiveMigration, /sum\(monthly_usage\.credits_used\)/);
  assert.match(correctiveMigration, /monthly_usage\.status/);
  assert.match(correctiveMigration, /usage_event\.user_id/);
  assert.match(correctiveMigration, /usage_event\.request_id/);
  assert.match(correctiveMigration, /coalesce\(usage_event\.completed_at, now\(\)\)/);
  assert.match(correctiveMigration, /returning usage_event\.\* into v_event/);
  assert.doesNotMatch(correctiveMigration, /sum\(credits_used\)|where user_id\s*=|where request_id\s*=|coalesce\(completed_at,/i);
  assert.match(correctiveMigration, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(correctiveMigration, /grant execute on function public\.reserve_ai_credit\(uuid, text, integer\) to authenticated/);
});

test("SQL verification covers reservation, idempotency, completion, release, limits, usage, and isolation", () => {
  for (const phrase of [
    "first reservation failed",
    "second reservation failed",
    "repeated request ID was not idempotent",
    "completion failed",
    "release failed",
    "monthly usage expected 2",
    "limit behavior failed",
    "second user was not isolated",
  ]) assert.match(sqlVerification, new RegExp(phrase, "i"));
  assert.match(sqlVerification, /^begin;[\s\S]*rollback;\s*$/);
});

test("development fallback recognizes only a proven missing usage table", () => {
  const missing = new AiCreditLedgerError("usage_read_failed", {
    code: "PGRST205",
    details: null,
    hint: "Perhaps the migration is missing",
    message: "Could not find the table 'public.ai_usage_events' in the schema cache",
  }, "ai_usage_events", "select");
  const permission = new AiCreditLedgerError("usage_read_failed", {
    code: "42501",
    details: "RLS rejected the query",
    hint: "Check the policy",
    message: "permission denied for table ai_usage_events",
  }, "ai_usage_events", "select");
  const unrelated = new AiCreditLedgerError("usage_read_failed", {
    code: "PGRST205",
    message: "Could not find the table 'public.other_table' in the schema cache",
  }, "other_table", "select");

  assert.equal(isMissingAiUsageTableError(missing), true);
  assert.equal(isMissingAiUsageTableError(permission), false);
  assert.equal(isMissingAiUsageTableError(unrelated), false);
  assert.deepEqual(buildDevelopmentAiCreditFallback("free"), {
    allowed: true,
    count: 0,
    ledgerMode: "development_missing_migration",
    limit: 50,
    monthKey: buildDevelopmentAiCreditFallback("free").monthKey,
    planId: "free",
    remaining: 50,
  });
  assert.deepEqual(getAiCreditLedgerDiagnostic(permission), {
    code: "42501",
    details: "RLS rejected the query",
    hint: "Check the policy",
    message: "permission denied for table ai_usage_events",
    operation: "select",
    resource: "ai_usage_events",
    stage: "usage_read_failed",
  });
});

test("Ask development fallback skips reservations and production still returns a database error", () => {
  assert.match(askRoute, /process\.env\.NODE_ENV === "development" && isMissingAiUsageTableError\(error\)/);
  assert.match(askRoute, /buildDevelopmentAiCreditFallback\(planId\)/);
  assert.match(askRoute, /usage\.ledgerMode === "development_missing_migration"[\s\S]*runFurviseIntelligence/);
  assert.match(askRoute, /else \{[\s\S]*askFailure\("DATABASE_ERROR"[\s\S]*"usage_lookup"/);
  assert.match(askRoute, /databaseCode:[\s\S]*databaseDetails:[\s\S]*databaseHint:[\s\S]*resource:[\s\S]*userIdPresent:/);
});

test("a recovery statement is classified before urgent handling and gets one conversational generation", async () => {
  let generations = 0;
  const result = await orchestrateAskTurn({
    concerns: [activeBreathingConcern],
    generationInput,
    message: "She is breathing normally now.",
    petName: "Mani",
    generate: async (input) => {
      generations += 1;
      assert.equal(input.concernStateHint, "resolved");
      return generatedResult();
    },
  });
  assert.equal(generations, 1);
  assert.equal(result.handledWithoutAi, false);
  assert.equal(result.intent, "resolution");
  assert.equal(result.suggestion?.type, "concern_resolution");
  assert.equal(result.suggestion?.concernId, activeBreathingConcern.id);
  assert.equal(result.suggestion?.payload.title, "Breathing returned to normal");
  assert.equal(result.suggestion?.payload.severity, "resolved");
  assert.match(result.suggestion?.details || "", /Owner reported that Mani appears well/);
});

test("an unrelated question with an urgent concern receives one context-aware generation", async () => {
  let generations = 0;
  const result = await orchestrateAskTurn({
    concerns: [activeBreathingConcern],
    generationInput: { ...generationInput, question: "Should I feed Mani now?" },
    message: "Should I feed Mani now?",
    petName: "Mani",
    generate: async (input) => { generations += 1; assert.equal(input.concernStateHint, "unrelated"); return generatedResult({ safetyLevel: "urgent" }); },
  });
  assert.equal(generations, 1);
  assert.equal(result.handledWithoutAi, false);
  assert.equal(result.safetyLevel, "urgent");
});

test("urgent concern follow-ups distinguish improvement, still active, recurrence, and immediate worsening", () => {
  assert.equal(classifyUserTurn("she is good", { hasActiveConcern: true }).concernState, "improved");
  assert.equal(classifyUserTurn("breathing normally now", { hasActiveConcern: true }).concernState, "resolved");
  assert.equal(classifyUserTurn("still breathing hard", { hasActiveConcern: true }).concernState, "still_active");
  assert.equal(classifyUserTurn("it came back", { hasActiveConcern: true }).concernState, "recurrence");
  const collapse = classifyUserTurn("she collapsed", { hasActiveConcern: true });
  assert.equal(collapse.concernState, "worsening");
  assert.equal(collapse.immediateEmergency, true);
});

test("still-active and recurrence replies reach the conversational model with urgent constraints", async () => {
  for (const [message, expectedState] of [["still breathing hard", "still_active"], ["it came back", "recurrence"]]) {
    let hint = "";
    const result = await orchestrateAskTurn({
      concerns: [activeBreathingConcern], generationInput: { ...generationInput, question: message }, message, petName: "Mani",
      generate: async (input) => { hint = input.concernStateHint; return generatedResult({ safetyLevel: "urgent" }); },
    });
    assert.equal(hint, expectedState);
    assert.equal(result.handledWithoutAi, false);
    assert.equal(result.safetyLevel, "urgent");
  }
});

test("an immediate emergency bypasses generation once but later replies are reclassified", async () => {
  let generations = 0;
  const emergency = await orchestrateAskTurn({
    concerns: [activeBreathingConcern], generationInput,
    message: "Mani has open-mouth breathing now", petName: "Mani",
    generate: async () => { generations += 1; return generatedResult(); },
  });
  assert.equal(generations, 0);
  assert.equal(emergency.handledWithoutAi, true);
  assert.equal(emergency.safetyLevel, "urgent");
  const improved = await orchestrateAskTurn({
    concerns: [activeBreathingConcern], generationInput,
    message: "she is good", petName: "Mani",
    generate: async () => { generations += 1; return generatedResult(); },
  });
  assert.equal(generations, 1);
  assert.equal(improved.handledWithoutAi, false);
  assert.equal(improved.suggestion?.type, "concern_resolution");
});

test("a resolved concern no longer forces emergency handling on unrelated questions", async () => {
  let hint = "";
  const result = await orchestrateAskTurn({
    concerns: [{ ...activeBreathingConcern, status: "resolved", resolved_at: "2026-07-27T10:00:00.000Z" }],
    generationInput, message: "How can I help Mani become friendlier?", petName: "Mani",
    generate: async (input) => { hint = input.concernStateHint; return generatedResult({ safetyLevel: "normal" }); },
  });
  assert.equal(hint, "unrelated");
  assert.equal(result.safetyLevel, "normal");
  assert.equal(result.handledWithoutAi, false);
});

test("saving an improvement appends history and resolves without deleting the urgent entry", () => {
  const resolver = concernResolutionMigration.slice(concernResolutionMigration.indexOf("create or replace function public.resolve_concern_suggestion"), concernResolutionMigration.indexOf("create or replace function public.repair_resolved_concern_suggestions"));
  assert.match(resolver, /insert into public\.pet_care_entries/);
  assert.match(resolver, /update public\.pet_concerns as concern_row[\s\S]*set status = 'resolved'/);
  assert.match(resolver, /resolved_at = now\(\)/);
  assert.doesNotMatch(resolver, /delete from public\.pet_care_entries/);
  assert.match(resolver, /resolvedConcernKeys/);
  assert.match(resolver, /status in \('active', 'monitoring', 'reopened'\)[\s\S]*resolved_at is null/);
});

test("resolution entries cannot reopen the linked concern and repair is dry-run by default", () => {
  assert.match(concernResolutionMigration, /new\.concern_id is not null[\s\S]*returned to normal/);
  assert.match(concernResolutionMigration, /repair_resolved_concern_suggestions\(p_apply boolean default false\)/);
  assert.match(concernResolutionMigration, /grant execute on function public\.repair_resolved_concern_suggestions\(boolean\) to service_role/);
});

test("active concern loading excludes resolved and monitoring rows while recent resolution stays separate", () => {
  const activeLoader = contextBuilder.slice(contextBuilder.indexOf("export async function loadActiveConcerns"), contextBuilder.indexOf("export async function loadRecentlyResolvedConcerns"));
  assert.match(activeLoader, /\.in\("status", \["active", "reopened"\]\)/);
  assert.match(activeLoader, /\.is\("resolved_at", null\)/);
  assert.doesNotMatch(activeLoader, /monitoring/);
  assert.match(contextBuilder, /loadRecentlyResolvedConcerns[\s\S]*\.eq\("status", "resolved"\)/);
});

test("only current urgent answers use danger styling and monitoring has a distinct neutral warning surface", () => {
  assert.match(askPage, /response\.urgency === "urgent"/);
  assert.match(askPage, /response\.urgency === "monitor"/);
  assert.match(askPage, /pw-danger-surface/);
  assert.match(askPage, /pw-warning-surface/);
});

test("low-value acknowledgements do not require generation", async () => {
  assert.equal(classifyUserTurn("thanks").isLowValueAcknowledgement, true);
  const result = await orchestrateAskTurn({
    concerns: [],
    generationInput: { ...generationInput, question: "thanks" },
    message: "thanks",
    petName: "Mani",
    generate: async () => { throw new Error("AI should not be called"); },
  });
  assert.equal(result.handledWithoutAi, true);
  assert.equal(result.suggestion, null);
});

test("resolved concerns reopen when a matching concern returns", () => {
  const entry = {
    id: "entry-2",
    pet_profile_id: "pet-1",
    user_id: "user-1",
    title: "Breathing trouble returned",
    note: "Labored breathing started again.",
    category: "symptom",
    severity: "severe",
    occurred_at: "2026-07-28T09:00:00.000Z",
    created_at: "2026-07-28T09:01:00.000Z",
  };
  const resolved = { ...activeBreathingConcern, status: "resolved", resolved_at: "2026-07-27T12:00:00.000Z" };
  assert.equal(concernFromCareEntry(entry)?.key, "breathing");
  assert.equal(shouldReopenConcern(resolved, entry), true);
  assert.match(concernResolutionMigration, /v_existing\.status = 'resolved'[\s\S]*status = 'reopened'/);
});

test("suggestion actions are state-only and never touch the AI ledger", () => {
  assert.match(suggestionRoute, /apply_furvise_state_suggestion/);
  assert.match(stateSuggestionMigration, /create or replace function public\.apply_furvise_state_suggestion[\s\S]*insert into public\.pet_care_entries[\s\S]*status = 'resolved'/);
  assert.doesNotMatch(suggestionRoute, /reserveAiCredit|completeAiCredit|runWithAiCredit/);
});

test("Ask reserves before generation and completes only after a saved assistant answer", () => {
  const reserve = askRoute.indexOf('reserveAiCredit({ feature: "ask"');
  const generation = askRoute.indexOf("runFurviseIntelligence", reserve);
  const assistantInsert = askRoute.indexOf('.from("ask_conversation_messages")', askRoute.indexOf("async function persistAssistantAnswer"));
  const complete = askRoute.indexOf("completeAiCredit", assistantInsert);
  assert.ok(reserve > -1 && reserve < generation);
  assert.ok(assistantInsert > generation && assistantInsert < complete);
  assert.match(askRoute, /safeReleaseAiCredit/);
  assert.match(askRoute, /handledWithoutAi/);
  assert.match(askRoute, /creditsUsed/);
});

test("ownership and RLS remain scoped to the authenticated user", () => {
  assert.match(askRoute, /eq\("pet_profile_id", petId\)[\s\S]*eq\("user_id", userId\)/);
  assert.match(migration, /ai_usage_events_select_own[\s\S]*user_id = auth\.uid\(\)/);
  assert.match(migration, /pet_concerns_select_own[\s\S]*user_id = auth\.uid\(\)/);
  assert.match(migration, /ai_update_suggestions_select_own[\s\S]*user_id = auth\.uid\(\)/);
});

test("user-facing paths do not expose raw diagnostics", () => {
  const page = read("app/ask/page.tsx");
  assert.doesNotMatch(page, /debugStage|AI_UNAVAILABLE at|provider status|stack trace/i);
  assert.doesNotMatch(page, /No AI credit used/);
  assert.match(page, /Save improvement/);
  assert.match(page, /Not now/);
});

test("product browsing remains available when generation credits are exhausted", () => {
  const page = read("app/shop/page.tsx");
  const interpretRoute = read("app/api/shop/interpret-query/route.ts");
  assert.doesNotMatch(page, /canSearch[\s\S]{0,180}usage\.allowed/);
  assert.match(interpretRoute, /const fallback = \(\) => \{[\s\S]*buildFallbackShopQueryInterpretation/);
  assert.match(interpretRoute, /if \(!usage\.allowed\)[\s\S]*interpretation: fallback\(\)[\s\S]*limitReached: true/);
});
