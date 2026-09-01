import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAskDraftKey, persistAskDraft, readAskDraft } from "../app/lib/ask-draft.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const today = read("app/dashboard/page.tsx");
const css = read("app/dashboard/today-v2.module.css");

test("Today V2 is one continuous present-tense file", () => {
  assert.match(today, /data-ui="today-v2-file"/);
  assert.match(today, /formatTodayPetContext\(selectedProfile\)/);
  assert.match(today, /<h1 className=\{styles\.todayTitle\}>TODAY<\/h1>/);
  assert.match(today, /data-ui="today-v2-timeline"[\s\S]*data-ui="today-v2-live-edge"/);
  for (const copy of ["Nothing on the file yet.", "When something matters, put it here.", "WHAT HAPPENED?", "REMEMBER", "ASK ABOUT", "Full story"]) {
    assert.match(today, new RegExp(copy.replace(/[.?]/g, "\\$&")));
  }
});

test("old dashboard and profile-completion UI is absent", () => {
  for (const removed of [
    "Furvise is getting to know",
    "Make ",
    "Monthly care budget",
    "Ingredients to avoid",
    "Main care goal",
    "Complete profile",
    "Everything seems normal",
    "Recent History",
    "Add update",
    "Good evening",
    "Anything worth remembering?",
  ]) assert.doesNotMatch(today, new RegExp(removed, "i"));
  assert.doesNotMatch(today, /TODAY_EVENT_ACTIONS\.map|ToggleButton|LocalPetIdentity|today-profile-focus/);
});

test("Remember reuses one authoritative write and stays on dashboard", () => {
  const handler = today.slice(today.indexOf("async function saveRememberedNote"), today.indexOf("function openDetails"));
  assert.equal((handler.match(/createCareEntry\(/g) || []).length, 1);
  assert.match(handler, /await createCareEntry[\s\S]*setEntries\(\(current\) => \[\{ \.\.\.entry[\s\S]*setRememberNote\(""\)/);
  assert.doesNotMatch(handler, /location\.|router\.|redirect/);
  const catchBlock = handler.slice(handler.indexOf("catch"), handler.indexOf("finally"));
  assert.doesNotMatch(catchBlock, /setRememberNote|setEntries/);
});

test("Ask uses the canonical pet-scoped draft handoff without auto-submit", () => {
  const storage = new Map();
  const adapter = {
    getItem: (key) => storage.get(key) || null,
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, value),
  };
  persistAskDraft(adapter, null, "pet-1", "What changed?");
  assert.equal(getAskDraftKey(null, "pet-1"), "furvise:ask-draft:new:pet-1");
  assert.equal(readAskDraft(adapter, null, "pet-1"), "What changed?");
  assert.match(today, /persistAskDraft\(window\.localStorage, null, selectedProfile\.id, askDraft\.trim\(\)\)/);
  assert.match(today, /window\.location\.assign\(`\/ask\?pet=\$\{encodeURIComponent\(selectedProfile\.id\)\}`\)/);
  assert.doesNotMatch(today, /\/api\/ask|ask\(askDraft|autoSubmit/);
});

test("Today actions are forest, restrained, and free of marketing artwork", () => {
  assert.match(css, /\.primaryAction \{[\s\S]*border-radius: var\(--radius-sm\);[\s\S]*background: var\(--deep-forest\);[\s\S]*color: var\(--warm-cream\)/);
  assert.doesNotMatch(`${today}\n${css}`, /warm-orange|action-primary|heron|flamingo|hummingbird|deer|goat|bird|gradient/);
  assert.doesNotMatch(today, /â€”/);
});
