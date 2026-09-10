import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 2 feature behavior is declared in one shared mode registry", () => {
  const modes = read("app/lib/intelligence/feature-modes.ts");
  for (const feature of ["ask", "vet_brief"]) {
    assert.match(modes, new RegExp(`${feature}: mode\\(`));
  }
  assert.match(modes, /contextPolicy:/);
  assert.match(modes, /persistencePolicy:/);
});

test("feature learning persistence is ownership-scoped and retry-idempotent", () => {
  const migration = read("supabase/migrations/20260728050000_add_feature_intelligence_persistence.sql");
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /intelligence_request_id/);
  assert.match(migration, /create unique index if not exists/);
  assert.match(migration, /persist_furvise_feature_intelligence/);
  assert.match(migration, /security definer/);
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
