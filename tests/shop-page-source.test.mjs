import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Results remains product-free", () => {
  const results = read("app/results/page.tsx");
  assert.doesNotMatch(results, /ProductCard|View product|Why this product\?|best price|live availability/i);
  assert.match(results, /Care summary/);
  assert.match(results, /What to log next/);
  assert.match(results, /What to ask the vet/);
});
