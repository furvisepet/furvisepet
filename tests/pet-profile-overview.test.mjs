import {PUBLIC_V1_CAPABILITIES} from '../app/lib/public-v1-capabilities.ts';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("profile overview route keeps mobile layout from overflowing", () => {
  const source = readFileSync(new URL("../app/pets/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /overflow-x-hidden/);
  assert.match(source, /min-w-0/);
  assert.doesNotMatch(source, /overflow-x-auto/);
});

test("profile home keeps identity and durable facts while public Vet Brief generation is disabled", () => {
  const source = readFileSync(new URL("../app/pets/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /formatPetDirectoryMetadata\(profile\)/);
  assert.match(source, /buildPetProfileFactRows\(profile\)/);
  assert.equal((source.match(/EDIT PET/g) || []).length, 1);
  assert.equal((source.match(/VET BRIEF/g) || []).length, 0);
  assert.equal(PUBLIC_V1_CAPABILITIES.vetBriefGeneration,false);assert.doesNotMatch(source, /VET BRIEF/);assert.equal(source.includes("/vet-brief"),false);
  assert.doesNotMatch(source, />\s*Log update\s*<|View full history|\/care-log\?pet=|Products for|\/shop\?petId=|Start here|What Furvise remembers|Recent updates|MANAGE PET|Delete pet|MANAGE REMEMBERED DETAILS/);
});
