import assert from "node:assert/strict";
import test from "node:test";
import { FURVISE_V1_RELEASE, getV1ReleaseForPage } from "../app/lib/release-notes.ts";

test("the unshipped V1 announcement has no release date and is excluded from public production notes", () => {
  assert.equal(FURVISE_V1_RELEASE.status, "draft");
  assert.equal(FURVISE_V1_RELEASE.publishedAt, null);
  assert.equal(getV1ReleaseForPage(), null);
  assert.equal(getV1ReleaseForPage({ preview: false }), null);
});
test("preview copy includes Ask and the journal without a readiness guarantee", () => {
  const draft = getV1ReleaseForPage({ preview: true });
  assert.equal(draft, FURVISE_V1_RELEASE);
  const text = JSON.stringify(draft);
  for (const feature of ["Write naturally", "A space for each pet", "Today and History", "Ask about pet care"]) assert.ok(text.includes(feature));
  assert.doesNotMatch(text, /90%|100%|guaranteed|coming soon/i);
  assert.match(text, /does not diagnose/);
  assert.match(text, /incomplete or wrong/);
});
