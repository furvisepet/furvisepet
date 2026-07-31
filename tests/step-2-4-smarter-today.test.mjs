import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTodayEntryDraft, buildTodayRecentEntries, getLocalGreeting, SERVER_SAFE_GREETING, toggleTodayQuickAction } from "../app/lib/today.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex").toUpperCase();

test("local greeting boundaries retain the server-safe fallback", () => {
  assert.equal(SERVER_SAFE_GREETING, "Welcome back");
  for (const hour of [5, 11]) assert.equal(getLocalGreeting(hour), "Good morning");
  for (const hour of [12, 16]) assert.equal(getLocalGreeting(hour), "Good afternoon");
  for (const hour of [17, 21]) assert.equal(getLocalGreeting(hour), "Good evening");
  for (const hour of [22, 4]) assert.equal(getLocalGreeting(hour), "Welcome back");
  assert.match(read("app/components/today-greeting.tsx"), /useSyncExternalStore\(subscribe, getBrowserGreeting, getServerGreeting\)/);
});

test("Today categories are single-select and produce one deterministic entry draft", () => {
  assert.equal(toggleTodayQuickAction(null, "food_changed"), "food_changed");
  assert.equal(toggleTodayQuickAction("food_changed", "food_changed"), null);
  assert.equal(toggleTodayQuickAction("food_changed", "new_symptom"), "new_symptom");
  assert.deepEqual(buildTodayEntryDraft("food_changed", "Started salmon food."), { category: "food", note: "Started salmon food.", title: "Food change" });
  assert.deepEqual(buildTodayEntryDraft(null, "Plain note."), { category: "general", note: "Plain note.", title: "Note" });
  assert.deepEqual(buildTodayEntryDraft("vet_visit", "   "), { category: "vet_visit", note: "Vet visit.", title: "Vet visit" });
  assert.equal(buildTodayEntryDraft(null, "   "), null);
});

test("Today is exception-first and one normal action creates one row", () => {
  const source = read("app/dashboard/page.tsx");
  const model = read("app/lib/today.ts");
  for (const label of ["Food changed", "New symptom", "Medication or treatment", "Vet visit", "Behavior changed", "Routine changed", "Add photo"]) assert.match(model, new RegExp(label));
  for (const removed of ["Ate normally", "Drank normally", "Energy normal", "Stool normal", "Mood normal"]) assert.doesNotMatch(source + model, new RegExp(removed));
  assert.match(model, /Everything seemed normal today\./);
  assert.equal((source.match(/createCareEntry\(/g) || []).length, 2);
  assert.match(source, /setEntries\(\(current\) => \[\{ \.\.\.entry, pet_name: petName \}, \.\.\.current\]\)/);
});

test("Today recent history remains newest-first and capped at three", () => {
  const rows = buildTodayRecentEntries([
    { id: "old", pet_profile_id: "pet", occurred_at: "2026-07-17T12:00:00Z" },
    { id: "new", pet_profile_id: "pet", occurred_at: "2026-07-20T12:00:00Z" },
    { id: "third", pet_profile_id: "pet", occurred_at: "2026-07-18T12:00:00Z" },
    { id: "second", pet_profile_id: "pet", occurred_at: "2026-07-19T12:00:00Z" },
  ], "pet");
  assert.deepEqual(rows.map((row) => row.id), ["new", "second", "third"]);
});

test("brand assets and mobile clearance remain protected", () => {
  assert.match(read("app/components/app-page.tsx"), /app-mobile-nav-clearance/);
  assert.match(read("app/globals.css"), /--mobile-nav-clearance:[\s\S]*24px/);
  assert.equal(hash("public/brand/logo.png"), "D24A7A73878FB4692918D140D69DC9D803281D53FF2704AC51B5720A782BECB6");
  assert.equal(hash("app/favicon.ico"), "6E33AAE904FB4A5A8EBC6CE15EE8846C692F154B92FB0EEAC3278B0351444557");
});
