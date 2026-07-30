import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildVetBriefDraft } from "../app/lib/vet-brief/builder.ts";
import { generateVetBriefPdf } from "../app/lib/vet-brief/pdf.ts";
import { getVetBriefFilename, parseVetBriefDocument } from "../app/lib/vet-brief/schema.ts";

const profile = {
  id: "pet-owner-safe",
  user_id: "user-private",
  name: "Rocky",
  species: "dog",
  breed: "Labrador Retriever",
  age_value: 4,
  age_unit: "years",
  weight_value: 31,
  weight_unit: "kg",
  current_food: "Salmon kibble",
  main_concern: "Itchy skin",
  wellness_goal: "general_wellness",
  avoid_ingredients: [],
  monthly_budget: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-07-24T00:00:00Z",
};

const entries = [
  careEntry("symptom-1", "symptom", "2026-07-02", "Scratching after dinner", "The owner noticed scratching after dinner.", "mild"),
  careEntry("food-1", "food", "2026-07-05", "Changed food", "Switched to salmon kibble.", null),
  careEntry("med-1", "medication", "2026-07-08", "Fish oil supplement", "Owner gave the saved label amount.", null),
  careEntry("product-1", "grooming", "2026-07-09", "Used oatmeal shampoo", "Owner used oatmeal shampoo once.", null),
  careEntry("unrelated-1", "activity", "2026-07-10", "Long walk", "Enjoyed a long walk at the park.", null),
  careEntry("old-1", "symptom", "2026-01-10", "Old cough", "Coughed once.", null),
];

const conversation = [
  { role: "user", text: "I think Rocky might have an allergy because he seems itchy after dinner." },
  { role: "furvise", response: { answerType: "vet_prep", urgency: "routine", sections: [{ heading: "Questions for your veterinarian", items: ["Could the timing help narrow down what to track?"] }] } },
];

test("Vet Visit Brief includes only recorded facts and keeps suspicions owner-attributed", () => {
  const { document, sourceEntryIds } = buildVetBriefDraft({ profile, careEntries: entries, memories: [], conversation, from: "2026-07-01", to: "2026-07-24", generatedAt: "2026-07-24T12:00:00Z" });
  assert.equal(document.pet.breed, "Labrador Retriever");
  assert.match(document.ownerReportedChanges.map((item) => item.text).join(" "), /Owner reported: I think Rocky might have an allergy/);
  assert.doesNotMatch(document.ownerReportedChanges.map((item) => item.text).join(" "), /Rocky has an allergy\./);
  assert.deepEqual(sourceEntryIds.sort(), ["med-1", "product-1", "symptom-1"].sort());
  assert.doesNotMatch(JSON.stringify(document), /Long walk|Old cough|user-private|pet-owner-safe/);
});

test("Vet Visit Brief shows missing values without filling gaps", () => {
  const sparse = { ...profile, breed: null, age_value: null, age_unit: null, weight_value: null, weight_unit: null, current_food: null };
  const { document } = buildVetBriefDraft({ profile: sparse, careEntries: [], memories: [], from: "2026-07-01", to: "2026-07-24", generatedAt: "2026-07-24T12:00:00Z" });
  assert.equal(document.pet.breed, "Not recorded");
  assert.equal(document.pet.age, "Not recorded");
  assert.equal(document.pet.weight, "Not recorded");
  assert.match(document.missingInformation.join(" "), /Current medication not saved/);
  assert.equal(document.reasonForVisit, "Not recorded");
});

test("Vet Visit Brief date filtering and relevance exclude unrelated history", () => {
  const { document } = buildVetBriefDraft({ profile, careEntries: entries, memories: [], reasonForVisit: "Discuss itchy skin and a food change", from: "2026-07-04", to: "2026-07-08", generatedAt: "2026-07-24T12:00:00Z" });
  const text = JSON.stringify(document);
  assert.match(text, /Changed food/);
  assert.match(text, /Fish oil supplement/);
  assert.doesNotMatch(text, /Scratching after dinner|Long walk|Old cough/);
});

test("confirmed user edits are preserved and removed items stay removed", () => {
  const { document } = buildVetBriefDraft({ profile, careEntries: entries, memories: [], from: "2026-07-01", to: "2026-07-24", generatedAt: "2026-07-24T12:00:00Z" });
  const edited = parseVetBriefDocument({ ...document, reasonForVisit: "Owner-confirmed wellness review", ownerReportedChanges: [], ownerNotes: "Please discuss travel planning." });
  assert.ok(edited);
  assert.equal(edited.reasonForVisit, "Owner-confirmed wellness review");
  assert.equal(edited.ownerNotes, "Please discuss travel planning.");
  assert.deepEqual(edited.ownerReportedChanges, []);
});

test("Vet Visit Brief PDF filename is stable and PDF omits internal and affiliate fields", async () => {
  const { document } = buildVetBriefDraft({ profile, careEntries: entries, memories: [], from: "2026-07-01", to: "2026-07-24", generatedAt: "2026-07-24T12:00:00Z" });
  const bytes = await generateVetBriefPdf(document);
  const a4Bytes = await generateVetBriefPdf(document, { pageSize: "a4" });
  const pdf = await PDFDocument.load(bytes);
  const a4Pdf = await PDFDocument.load(a4Bytes);
  assert.equal(getVetBriefFilename("Rocky Jr.", document.generatedAt), "furvise-vet-brief-rocky-jr-2026-07-24.pdf");
  assert.ok(pdf.getPageCount() >= 1);
  assert.equal(Math.round(a4Pdf.getPage(0).getSize().width), 595);
  assert.equal(Math.round(a4Pdf.getPage(0).getSize().height), 842);
  const generator = read("app/lib/vet-brief/pdf.ts");
  assert.doesNotMatch(generator, /sourceEntryIds|user_id|affiliate|provider/);
});

test("Vet Visit Brief persistence is private, versioned, and owner-scoped", () => {
  const migration = read("supabase/migrations/20260724020000_add_vet_visit_briefs.sql");
  const collection = read("app/api/vet-briefs/route.ts");
  const item = read("app/api/vet-briefs/[id]/route.ts");
  assert.match(migration, /alter table public\.vet_visit_briefs enable row level security/);
  assert.match(migration, /using \(user_id = auth\.uid\(\)\)/);
  assert.match(migration, /revoke all on table public\.vet_visit_briefs from anon/);
  assert.match(collection, /\.eq\("user_id", context\.userId\)/);
  assert.match(item, /\.eq\("user_id", context\.userId\)/);
  assert.match(collection, /previous\.version \+ 1/);
});

test("Vet Visit Brief review is mobile-ready, explicit, and analytics receives no document content", () => {
  const page = read("app/vet-brief/page.tsx");
  const printPage = read("app/vet-briefs/[id]/print/page.tsx");
  const ask = read("app/ask/page.tsx");
  assert.match(page, /Choose review or preview/);
  assert.match(page, /Confirm brief/);
  assert.match(page, /Download PDF/);
  assert.match(page, /Save draft/);
  assert.match(page, /Information not yet recorded/);
  assert.match(page, /Document outline/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /Urgent guidance remains in Ask and is not copied into this document/);
  assert.doesNotMatch(page, /trackAskEvent\([^)]*(document|reasonForVisit|ownerNotes)/);
  assert.doesNotMatch(printPage, /AppPage|SignedInHeader|affiliate|product promotion/i);
  assert.match(ask, /source=ask/);
  assert.match(ask, /hasLikelyVetConcern/);
  assert.match(ask, /likelyVetConcern && response\.urgency !== "urgent"/);
});

test("Vet Visit Brief builder introduces no diagnosis or treatment claims", () => {
  const builder = read("app/lib/vet-brief/builder.ts");
  assert.doesNotMatch(builder, /\b(diagnosed with|treat with|prescribe|confirmed allergy|caused by)\b/i);
  assert.match(builder, /Owner reported:/);
  assert.match(builder, /Saved care history shows:/);
});

function careEntry(id, category, date, title, note, severity) {
  return { id, user_id: "user-private", pet_profile_id: "pet-owner-safe", category, title, note, severity, occurred_at: `${date}T12:00:00Z`, created_at: `${date}T12:00:00Z`, updated_at: `${date}T12:00:00Z` };
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
