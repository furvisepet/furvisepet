import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
const publication = readFileSync(new URL("../app/lib/intelligence/finalize-ask-publication.ts", import.meta.url), "utf8");

test("Ask publishes intelligence saved only from an effective persistence receipt", () => {
  assert.doesNotMatch(
    publication,
    /saved:\s*!intelligencePersistenceWarning\s*&&\s*intelligencePersistence\?\.carePersistence\.status\s*!==\s*"failed"/,
  );
  assert.match(
    publication,
    /saved:\s*Boolean\(\s*!intelligencePersistenceWarning\s*&&\s*intelligencePersistence\s*&&\s*didPersistEffectiveAskState\(intelligencePersistence,\s*intelligencePersistence\.carePersistence\)\s*\)/s,
  );
});

test("the Ask route delegates final success publication instead of owning a second serializer", () => {
  assert.match(route, /finalize-ask-publication/);
  assert.match(route, /buildSuccessfulAskResponse\(/);
  assert.doesNotMatch(route, /function\s+successfulAnswerResponse\s*\(/);
  assert.doesNotMatch(route, /function\s+didPersistEffectiveState\s*\(/);
});
