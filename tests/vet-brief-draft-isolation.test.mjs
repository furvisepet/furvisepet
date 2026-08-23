import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  enforceVetBriefDraftAccountBoundary,
  getVetBriefDraftStorageKey,
  readVetBriefClientDraft,
  removeVetBriefClientDraft,
  saveVetBriefClientDraft,
} from "../app/lib/vet-brief/client-drafts.ts";
import { VET_BRIEF_DISCLAIMER } from "../app/lib/vet-brief/types.ts";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const petA = "11111111-1111-4111-8111-111111111111";
const petB = "22222222-2222-4222-8222-222222222222";
const briefA = "33333333-3333-4333-8333-333333333333";
const briefB = "44444444-4444-4444-8444-444444444444";

test("draft storage is bound to the exact account, pet, and brief", () => {
  const storage = new MemoryStorage();
  const draft = clientDraft("User A private review text");
  assert.equal(
    getVetBriefDraftStorageKey(scope(userA, petA, briefA)),
    `furvise:vet-brief-draft:v2:${userA}:${petA}:${briefA}`,
  );
  saveVetBriefClientDraft(storage, scope(userA, petA, briefA), draft);

  assert.deepEqual(readVetBriefClientDraft(storage, scope(userA, petA, briefA)), draft);
  assert.equal(readVetBriefClientDraft(storage, scope(userB, petA, briefA)), null);
  assert.equal(readVetBriefClientDraft(storage, scope(userA, petB, briefA)), null);
  assert.equal(readVetBriefClientDraft(storage, scope(userA, petA, briefB)), null);
  assert.equal(readVetBriefClientDraft(storage, scope(userA, petA, null)), null);
});

test("account transitions remove foreign and legacy Vet Brief state but preserve the active account", () => {
  const storage = new MemoryStorage();
  saveVetBriefClientDraft(storage, scope(userA, petA, null), clientDraft("A"));
  saveVetBriefClientDraft(storage, scope(userB, petB, null), clientDraft("B"));
  storage.setItem(`furvise:vet-brief-draft:${petA}:new`, JSON.stringify(clientDraft("legacy A")));

  enforceVetBriefDraftAccountBoundary(storage, userB);
  assert.equal(readVetBriefClientDraft(storage, scope(userA, petA, null)), null);
  assert.equal(storage.getItem(`furvise:vet-brief-draft:${petA}:new`), null);
  assert.equal(readVetBriefClientDraft(storage, scope(userB, petB, null))?.document.ownerNotes, "B");

  enforceVetBriefDraftAccountBoundary(storage, null);
  assert.equal(readVetBriefClientDraft(storage, scope(userB, petB, null)), null);
});

test("mismatched, malformed, and replayed envelopes fail closed", () => {
  const storage = new MemoryStorage();
  const exact = scope(userA, petA, briefA);
  const key = getVetBriefDraftStorageKey(exact);
  storage.setItem(key, JSON.stringify({ ...clientDraft("wrong owner"), briefId: briefA, petId: petA, userId: userB, version: 2 }));
  assert.equal(readVetBriefClientDraft(storage, exact), null);
  assert.equal(storage.getItem(key), null);

  storage.setItem(key, "not-json");
  assert.equal(readVetBriefClientDraft(storage, exact), null);
  assert.equal(storage.getItem(key), null);

  saveVetBriefClientDraft(storage, exact, clientDraft("confirmed once"));
  removeVetBriefClientDraft(storage, exact);
  assert.equal(readVetBriefClientDraft(storage, exact), null);
});

test("the page validates ownership and entitlement before hydration and remounts at identity boundaries", () => {
  const page = read("app/vet-brief/page.tsx");
  const route = read("app/api/vet-briefs/draft/route.ts");
  const auth = read("app/lib/auth-session.ts");
  const newDraftBranch = page.slice(page.indexOf("if (!petId)"), page.indexOf("const draft = await fetchDraft"));

  assert.ok(newDraftBranch.indexOf("await validateDraftScope(petId)") < newDraftBranch.indexOf("readVetBriefClientDraft"));
  assert.match(page, /key=\{`\$\{user\.id\}:\$\{petId\}:\$\{existingBriefId \|\| "new"\}`\}/);
  assert.match(page, /payload\.brief\.petProfileId !== petId/);
  assert.match(route, /export async function GET\(request: Request\)/);
  assert.match(route, /\.eq\("id", petId\)\.eq\("user_id", auth\.userId\)/);
  assert.match(auth, /enforceVetBriefDraftAccountBoundary\(window\.localStorage, session\?\.user\?\.id \|\| null\)/);
});

function scope(userId, petId, briefId) { return { userId, petId, briefId }; }

function clientDraft(ownerNotes) {
  return {
    document: {
      documentVersion: 1,
      title: "Vet brief",
      generatedAt: "2026-08-23T12:00:00.000Z",
      dateRange: { from: "2026-08-01", to: "2026-08-23" },
      pet: { name: "Rocky", species: "dog", breed: "Mixed", age: "4 years", weight: "20 kg", photoUrl: null },
      reasonForVisit: "Routine review",
      ownerReportedChanges: [], concernTimeline: [], foodChanges: [], productsUsed: [], medicationsSupplements: [], relevantCareHistory: [], reportedPatterns: [], questionsForVeterinarian: [], missingInformation: [],
      ownerNotes,
      excludedSections: [], includePetPhoto: false, disclaimer: VET_BRIEF_DISCLAIMER,
    },
    sourceEntryIds: ["55555555-5555-4555-8555-555555555555"],
  };
}

function read(path) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }

class MemoryStorage {
  #values = new Map();
  get length() { return this.#values.size; }
  getItem(key) { return this.#values.get(key) ?? null; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key) { this.#values.delete(key); }
  setItem(key, value) { this.#values.set(key, String(value)); }
}
