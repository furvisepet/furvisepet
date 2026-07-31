import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TODAY_EVENT_ACTIONS, TODAY_EVERYTHING_NORMAL_ACTION } from "../app/lib/today.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("exception-first labels and deterministic titles match the product contract", () => {
  assert.deepEqual(TODAY_EVENT_ACTIONS.map(({ label, title }) => [label, title]), [
    ["Food changed", "Food change"], ["New symptom", "Symptom"], ["Medication or treatment", "Treatment"],
    ["Vet visit", "Vet visit"], ["Behavior changed", "Behavior change"], ["Routine changed", "Routine change"], ["Add photo", "Photo note"],
  ]);
  assert.equal(TODAY_EVERYTHING_NORMAL_ACTION.note, "Everything seemed normal today.");
  assert.equal(TODAY_EVERYTHING_NORMAL_ACTION.title, "Normal check-in");
});

test("Today copy is optional, humane, and free of daily pressure", () => {
  const today = read("app/dashboard/page.tsx");
  assert.match(today, /Anything worth remembering\?/);
  assert.match(today, /Save a change, symptom, treatment, appointment/);
  assert.match(today, /A change in appetite, behavior, food, symptoms, medication, routine, or anything else…/);
  assert.doesNotMatch(today, /checked in today|Complete today|streak|Do not forget/i);
});

test("one submission invokes one care-entry write and clears only after success", () => {
  const today = read("app/dashboard/page.tsx");
  const handler = today.slice(today.indexOf("async function saveQuickUpdate"), today.indexOf("function focusQuickNote"));
  assert.equal((handler.match(/createCareEntry\(/g) || []).length, 1);
  assert.match(handler, /await createCareEntry[\s\S]*setQuickNote\(""\)[\s\S]*setSelectedQuickAction\(null\)/);
  const catchBlock = handler.slice(handler.indexOf("catch"), handler.indexOf("finally"));
  assert.doesNotMatch(catchBlock, /setQuickNote|setSelectedQuickAction/);
});
