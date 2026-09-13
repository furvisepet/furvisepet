import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Ask marks request activity around exactly one guarded submission", async () => {
  const page = await text("app/ask/page.tsx");
  assert.match(page, /askRequestActiveRef\.current = true;[\s\S]*setAskRequestActive\(true\);[\s\S]*idempotentClientFetch\("\/api\/ask"/);
  assert.match(page, /finally \{[\s\S]*askRequestActiveRef\.current = false;[\s\S]*setAskRequestActive\(false\);/);
  assert.equal((page.match(/idempotentClientFetch\("\/api\/ask"/g) || []).length, 1);
  assert.match(page, /if \(!prompt \|\| composerUnavailable \|\| askRequestActiveRef\.current\) return/);
});

test("server invalidation targets downstream state and never the active Ask route", async () => {
  const route = await text("app/api/ask/route.ts");
  const invalidation = route.slice(route.indexOf("function revalidateAskStateViews"), route.indexOf("function textPayloadValue"));
  assert.match(invalidation, /"\/dashboard"/);
  assert.match(invalidation, /"\/pets"/);
  assert.match(invalidation, /"\/care-log"/);
  assert.doesNotMatch(invalidation, /"\/ask"|router\.refresh|location\.reload/);
});

test("major navigation is visibly guarded while Ask is answering", async () => {
  const [header, activity] = await Promise.all([
    text("app/components/app-header.tsx"), text("app/lib/navigation/ask-request-activity.ts"),
  ]);
  assert.match(header, /useAskRequestActive\(\)/);
  assert.match(header, /Furvise is answering/);
  assert.match(header, /event\.preventDefault\(\)/);
  assert.match(header, /isAskRequestActive\(\)/);
  assert.match(activity, /setAskRequestActive/);
  assert.doesNotMatch(`${header}\n${activity}`, /router\.refresh|window\.location\.reload/);
});

test("freshness is published only after a successful terminal response", async () => {
  const page = await text("app/ask/page.tsx");
  const requestStart = page.indexOf("const result = await request;");
  const successMark = page.indexOf("if (payload.dataChanged) markAppDataChanged();");
  const finallyBlock = page.indexOf("askRequestActiveRef.current = false;", successMark);
  assert.ok(requestStart >= 0 && successMark > requestStart && finallyBlock > successMark);
});

test("in-progress responses retain the canonical idempotency key", async () => {
  const client = await text("app/lib/security/idempotency/client.ts");
  assert.match(client, /payload\?\.code !== "REQUEST_IN_PROGRESS" && payload\?\.code !== "AI_REQUEST_ALREADY_ACTIVE"/);
});
