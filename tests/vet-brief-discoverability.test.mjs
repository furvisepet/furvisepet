import {PUBLIC_V1_CAPABILITIES} from '../app/lib/public-v1-capabilities.ts';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const petsPage = readFileSync(new URL("../app/pets/page.tsx", import.meta.url), "utf8");
const petProfilePage = readFileSync(new URL("../app/pets/[id]/page.tsx", import.meta.url), "utf8");
const vetBriefServer = readFileSync(new URL("../app/lib/vet-brief/server.ts", import.meta.url), "utf8");

test("the Pets directory leaves Vet brief discovery to deeper product surfaces", () => {
  assert.doesNotMatch(petsPage, /vet-brief|Vet brief/);
});

test("the pet profile does not expose disabled public Vet Brief generation", () => {
  assert.equal(PUBLIC_V1_CAPABILITIES.vetBriefGeneration,false);assert.doesNotMatch(petProfilePage, /VET BRIEF/);assert.equal(petProfilePage.includes("/vet-brief"),false);
  assert.match(petProfilePage, /<SecondaryButton href=\{`\/pets\/\$\{petId\}\/edit`\}>EDIT PET<\/SecondaryButton>/);
});

test("Vet Brief remains server-authorized for confirmed accounts with a separate generation allowance", () => {
  assert.match(vetBriefServer, /!entitlements\.capabilities\.vetPrepExports/);
  assert.match(vetBriefServer, /Vet Brief access is unavailable for this account\./);
});
