import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const petsPage = readFileSync(new URL("../app/pets/page.tsx", import.meta.url), "utf8");
const vetBriefServer = readFileSync(new URL("../app/lib/vet-brief/server.ts", import.meta.url), "utf8");

test("active pets expose a direct Vet brief action", () => {
  assert.match(petsPage, /href=\{`\/vet-brief\?pet=\$\{profile\.id\}`\}>Vet brief/);
});

test("Vet Brief remains server-authorized as a Plus capability", () => {
  assert.match(vetBriefServer, /entitlements\.effectivePlan !== "plus"/);
  assert.match(vetBriefServer, /!entitlements\.capabilities\.vetPrepExports/);
  assert.match(vetBriefServer, /Furvise Plus is required for Vet Visit Briefs\./);
});
