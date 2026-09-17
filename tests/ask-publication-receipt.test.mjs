import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");

test("Ask publishes intelligence saved only from an effective persistence receipt", () => {
  assert.doesNotMatch(
    route,
    /saved:\s*!intelligencePersistenceWarning\s*&&\s*intelligencePersistence\?\.carePersistence\.status\s*!==\s*"failed"/,
  );
  assert.match(
    route,
    /saved:\s*Boolean\(\s*!intelligencePersistenceWarning\s*&&\s*intelligencePersistence\s*&&\s*didPersistEffectiveState\(intelligencePersistence,\s*intelligencePersistence\.carePersistence\)\s*\)/s,
  );
});
