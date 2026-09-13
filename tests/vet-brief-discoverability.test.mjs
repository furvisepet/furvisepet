import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const petsPage = readFileSync(new URL("../app/pets/page.tsx", import.meta.url), "utf8");
const petProfilePage = readFileSync(new URL("../app/pets/[id]/page.tsx", import.meta.url), "utf8");
const vetBriefServer = readFileSync(new URL("../app/lib/vet-brief/server.ts", import.meta.url), "utf8");

test("the Pets directory leaves Vet brief discovery to deeper product surfaces", () => {
  assert.doesNotMatch(petsPage, /vet-brief|Vet brief/);
});

test("the pet profile exposes Vet Brief as a pet-scoped primary action", () => {
  assert.match(petProfilePage, /<PrimaryButton href=\{`\/vet-brief\?pet=\$\{petId\}&source=pet-profile`\}>VET BRIEF<\/PrimaryButton>/);
  assert.match(petProfilePage, /<SecondaryButton href=\{`\/pets\/\$\{petId\}\/edit`\}>EDIT PET<\/SecondaryButton>/);
});

test("Vet Brief remains server-authorized as a Plus capability", () => {
  assert.match(vetBriefServer, /entitlements\.effectivePlan !== "plus"/);
  assert.match(vetBriefServer, /!entitlements\.capabilities\.vetPrepExports/);
  assert.match(vetBriefServer, /Furvise Plus is required for Vet Visit Briefs\./);
});
