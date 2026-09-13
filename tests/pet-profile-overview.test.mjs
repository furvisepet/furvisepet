import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("profile overview route keeps mobile layout from overflowing", () => {
  const source = readFileSync(new URL("../app/pets/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /overflow-x-hidden/);
  assert.match(source, /min-w-0/);
  assert.doesNotMatch(source, /overflow-x-auto/);
});

test("profile home keeps identity and durable facts plus the pet-scoped Vet Brief entry", () => {
  const source = readFileSync(new URL("../app/pets/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /formatPetDirectoryMetadata\(profile\)/);
  assert.match(source, /buildPetProfileFactRows\(profile\)/);
  assert.equal((source.match(/EDIT PET/g) || []).length, 1);
  assert.equal((source.match(/VET BRIEF/g) || []).length, 1);
  assert.match(source, /href=\{`\/vet-brief\?pet=\$\{petId\}&source=pet-profile`\}/);
  assert.doesNotMatch(source, />\s*Log update\s*<|View full history|\/care-log\?pet=|Products for|\/shop\?petId=|Start here|What Furvise remembers|Recent updates|MANAGE PET|Delete pet|MANAGE REMEMBERED DETAILS/);
});
