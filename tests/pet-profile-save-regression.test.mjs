import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const ownerId = "10000000-0000-4000-8000-000000000001";
const profileId = "10000000-0000-4000-8000-000000000011";
const idempotencyKey = "10000000-0000-4000-8000-000000000101";
const updates = [];
const inserts = [];

const profile = {
  name: "Luna", species: "dog", breed: "Mixed", age: "3", ageUnit: "years", ageUnknown: false,
  weight: "12.5", weightUnit: "lb", weightUnknown: false, currentFood: "Current food", currentFoodUnknown: false,
  mainConcern: "General wellness", otherConcern: "", avoidIngredients: ["Chicken"], avoidIngredientsNoneKnown: false,
  customAvoidIngredient: "", monthlyBudget: "50", sex: "female", routineNote: "Evening walk", wellnessGoal: "activity",
};

const resultRow = { id: profileId, user_id: ownerId };
const mutation = {
  eq() { return this; },
  select() { return this; },
  async single() { return { data: resultRow, error: null }; },
};
const ownership = {
  eq() { return this; },
  async maybeSingle() { return { data: { id: profileId }, error: null }; },
};
const supabase = {
  from(table) {
    assert.equal(table, "dog_profiles");
    return {
      insert(payload) { inserts.push(payload); return mutation; },
      select() { return ownership; },
      update(payload) { updates.push(payload); return mutation; },
    };
  },
};

globalThis.__petProfileSaveFixture = { idempotencyKey, ownerId, supabase };
const mockSources = new Map([
  ["../app/lib/pet-profile-save-validation", "export const validatePetProfileSaveInput = value => ({ ok: true, profile: value });"],
  ["../app/lib/authenticated-api-server", "export const getAuthenticatedApiContext = async () => ({ supabase: globalThis.__petProfileSaveFixture.supabase, userId: globalThis.__petProfileSaveFixture.ownerId });"],
  ["../app/lib/petwise", "export const normalizeAvoidIngredientValues = value => value; export const normalizeSpecies = value => value; export const normalizeWellnessGoal = value => value; export const parsePositiveNumber = Number;"],
  ["../app/lib/security/request", "export const API_BODY_LIMITS = { standard: 1000 }; export class RequestBoundaryError extends Error {}; export const hasOnlyKeys = () => true; export const readBoundedJson = request => request.json();"],
  ["../app/lib/security/idempotency", "export const beginIdempotentRateLimitedOperation = async () => ({ operation: { execute: callback => callback(), key: globalThis.__petProfileSaveFixture.idempotencyKey } });"],
].map(([specifier, source]) => [new URL(specifier, import.meta.url).href, `data:text/javascript,${encodeURIComponent(source)}`]));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { shortCircuit: true, url: "data:text/javascript,export default {}" };
    const unresolvedUrl = specifier.startsWith(".") ? new URL(specifier, context.parentURL).href : "";
    const mockUrl = mockSources.get(unresolvedUrl);
    return mockUrl ? { shortCircuit: true, url: mockUrl } : nextResolve(specifier, context);
  },
});

test("profile save sends only authorized columns to Supabase", async () => {
  const { saveProfile } = await import("../app/lib/pet-profile-api-server.ts");
  const request = () => new Request("http://localhost/api/pets", {
    body: JSON.stringify({ profile }), headers: { "content-type": "application/json" }, method: "POST",
  });

  const patchResponse = await saveProfile(request(), profileId);
  assert.equal(patchResponse.status, 200);
  assert.equal(updates.length, 1);
  assert.equal(inserts.length, 0);
  assert.equal(updates[0].name, profile.name);
  for (const protectedColumn of ["user_id", "idempotency_key", "lifecycle_status", "lifecycle_changed_at", "deceased_at"]) {
    assert.equal(Object.hasOwn(updates[0], protectedColumn), false, protectedColumn);
  }

  const createResponse = await saveProfile(request(), null);
  assert.equal(createResponse.status, 201);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].name, profile.name);
  assert.equal(inserts[0].user_id, ownerId);
  assert.equal(inserts[0].idempotency_key, idempotencyKey);
});
