import assert from "node:assert/strict";
import test from "node:test";

import { revalidateAskStateViews } from "../app/lib/intelligence/revalidate-ask-state.ts";

test("Ask state invalidation refreshes shared app views and each unique pet scope", () => {
  const paths = [];
  revalidateAskStateViews(["pet-a", "pet-a", "pet-b", ""], (path) => paths.push(path));

  assert.deepEqual(paths.slice(0, 5), [
    "/dashboard",
    "/today",
    "/pets",
    "/history",
    "/care-log",
  ]);
  assert.deepEqual(paths.slice(5), [
    "/pets/pet-a",
    "/pets/pet-a/care",
    "/pets/pet-a/memories",
    "/dogs/pet-a/care",
    "/dogs/pet-a/memories",
    "/pets/pet-b",
    "/pets/pet-b/care",
    "/pets/pet-b/memories",
    "/dogs/pet-b/care",
    "/dogs/pet-b/memories",
  ]);
  assert.equal(paths.includes("/ask"), false);
  assert.equal(paths.includes("/shop"), false);
});

test("Ask state invalidation never multiplies duplicate pet paths", () => {
  const paths = [];
  revalidateAskStateViews(["pet-a", "pet-a", "pet-a"], (path) => paths.push(path));
  assert.equal(paths.filter((path) => path === "/pets/pet-a").length, 1);
  assert.equal(paths.filter((path) => path === "/dogs/pet-a/care").length, 1);
});
