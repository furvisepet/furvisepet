import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 2 feature behavior is declared in one shared mode registry", () => {
  const modes = read("app/lib/intelligence/feature-modes.ts");
  for (const feature of ["product_question", "product_query_interpretation", "safety_followup", "vet_brief"]) {
    assert.match(modes, new RegExp(`${feature}: mode\\(`));
  }
  assert.match(modes, /contextPolicy:/);
  assert.match(modes, /persistencePolicy:/);
  assert.match(modes, /safetyPolicy:/);
});

test("product question uses live shared context, safety, execution, credits, and persistence", () => {
  const route = read("app/api/shop/product-question/route.ts");
  assert.match(route, /buildFurviseContext\(\{/);
  assert.match(route, /resolveProductSafety\(liveContext\)/);
  assert.match(route, /runFeatureIntelligence\(\{/);
  assert.match(route, /feature: "product_question"/);
  assert.match(route, /runWithAiCredit/);
  assert.match(route, /persistFeatureIntelligenceLearnings/);
  assert.doesNotMatch(route, /createAiAnalysisProvider/);
});

test("product query interpretation remains deterministic for structured category choices", () => {
  const route = read("app/api/shop/interpret-query/route.ts");
  assert.match(route, /classifyShopQueryCapability\(query\)/);
  assert.match(route, /deterministic: true/);
  assert.match(route, /feature: "product_query"/);
  assert.match(route, /feature: "product_query_interpretation"/);
  assert.match(route, /buildFallbackShopQueryInterpretation/);
  assert.doesNotMatch(route, /createAiAnalysisProvider/);
});

test("click-only product explanations use the same live engine without durable search learning", () => {
  const route = read("app/api/shop/explain-product-fit/route.ts");
  const modes = read("app/lib/intelligence/feature-modes.ts");
  assert.match(route, /buildFurviseContext\(\{/);
  assert.match(route, /resolveProductSafety\(liveContext\)/);
  assert.match(route, /runFeatureIntelligence\(\{/);
  assert.match(route, /feature: "product_explanation"/);
  assert.doesNotMatch(route, /createAiAnalysisProvider|loadPetMemoryContext/);
  assert.match(modes, /product_explanation:[\s\S]*?care: false, memories: false/);
});

test("feature intelligence schema cannot emit SQL and product facts stay server-owned", () => {
  const modes = read("app/lib/intelligence/feature-modes.ts");
  const question = read("app/api/shop/product-question/route.ts");
  assert.match(modes, /never produce SQL/i);
  assert.match(modes, /Never invent ingredients, availability, warnings, suitability/i);
  assert.match(question, /loadShopCatalogProductById/);
  assert.match(question, /filtered\.products\.find/);
});

test("feature learning persistence is ownership-scoped and retry-idempotent", () => {
  const migration = read("supabase/migrations/20260728050000_add_feature_intelligence_persistence.sql");
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /intelligence_request_id/);
  assert.match(migration, /create unique index if not exists/);
  assert.match(migration, /persist_furvise_feature_intelligence/);
  assert.match(migration, /security definer/);
});

test("safety follow-up preserves legacy payload aliases while loading live owned context", () => {
  const route = read("app/api/safety-followup/route.ts");
  const page = read("app/results/page.tsx");
  assert.match(route, /input\.followUpQuestions \?\? input\.questions/);
  assert.match(route, /input\.followUpAnswers \?\? input\.answers/);
  assert.match(route, /buildFurviseContext\(\{/);
  assert.match(route, /feature: "safety_followup"/);
  assert.match(route, /petId, supabase: auth\.supabase, userId: auth\.userId/);
  assert.doesNotMatch(route, /validateDogProfileInput|createAiAnalysisProvider|analyzeSafetyFollowup/);
  assert.match(page, /petId=\{dogProfileId\}/);
  assert.match(page, /body: JSON\.stringify\(\{[\s\S]*?petId,/);
});

test("safety follow-up uses shared safety, persistence, and a legacy response adapter", () => {
  const route = read("app/api/safety-followup/route.ts");
  const schema = read("app/lib/intelligence/safety-followup.ts");
  assert.match(route, /runFeatureIntelligence\(\{/);
  assert.match(route, /runWithAiCredit/);
  assert.match(route, /applySafetyFloor/);
  assert.match(route, /persistFeatureIntelligenceLearnings/);
  assert.match(route, /adaptSafetyFollowupToLegacy/);
  for (const level of ["routine", "monitor", "urgent", "emergency", "recently_resolved"]) {
    assert.match(schema, new RegExp(`"${level}"`));
  }
  assert.match(schema, /reasoningSummary/);
  assert.match(schema, /shoppingSuppressed/);
});

test("safety state follows owner answers rather than warning terms in generated questions", () => {
  const route = read("app/api/safety-followup/route.ts");
  assert.match(route, /answers\.map\(\(answer\) => answer\.answer\)\.join/);
  assert.match(route, /followUpQuestions: questions/);
  assert.match(route, /followUpAnswers: answers/);
});

test("Vet Brief generation uses live shared context and the unified credit ledger", () => {
  const route = read("app/api/vet-briefs/draft/route.ts");
  assert.match(route, /buildFurviseContext\(\{/);
  assert.match(route, /dateRange: \{ from, to \}/);
  assert.match(route, /feature: "vet_brief"/);
  assert.match(route, /runFeatureIntelligence\(\{/);
  assert.match(route, /runWithAiCredit/);
  assert.match(route, /parseIntelligenceVetBrief/);
  assert.doesNotMatch(route, /createAiAnalysisProvider|loadPetMemoryContext/);
});

test("Vet Brief keeps deterministic rendering, Not recorded, and source traceability", () => {
  const route = read("app/api/vet-briefs/draft/route.ts");
  const schema = read("app/lib/intelligence/vet-brief.ts");
  const persistence = read("app/api/vet-briefs/route.ts");
  assert.match(route, /buildVetBriefDraft/);
  assert.match(schema, /parseVetBriefDocument/);
  assert.match(schema, /allowedSourceIds/);
  assert.match(schema, /document\.pet.*baseline\.pet/);
  assert.match(persistence, /pet_concerns/);
  assert.match(persistence, /furvise_memories/);
});

test("loading saved or confirmed Vet Briefs does not spend another credit", () => {
  const page = read("app/vet-brief/page.tsx");
  const collection = read("app/api/vet-briefs/route.ts");
  const item = read("app/api/vet-briefs/[id]/route.ts");
  const restoredBranch = page.slice(page.indexOf("const savedDraft = readSavedDraft"), page.indexOf("const draft = await fetchDraft"));
  assert.doesNotMatch(restoredBranch, /fetchDraft|runWithAiCredit/);
  assert.doesNotMatch(collection + item, /runWithAiCredit|runFeatureIntelligence/);
  assert.match(page, /getOrCreateClientMutationKey\(`vet-brief-draft:/);
});

test("Vet Brief refresh preserves explicit owner-authored settings", () => {
  const route = read("app/api/vet-briefs/draft/route.ts");
  const page = read("app/vet-brief/page.tsx");
  assert.match(page, /existingDocument: existingDocument \|\| undefined/);
  assert.match(route, /reasonForVisit: existing\.reasonForVisit/);
  assert.match(route, /ownerNotes: existing\.ownerNotes/);
  assert.match(route, /excludedSections: existing\.excludedSections/);
});
