import assert from "node:assert/strict";
import test from "node:test";
import { textMatchesReadPredicate } from "../app/lib/furvise-brain/read-text.ts";

const predicate = (...terms) => ({ kind: "text_any", terms });

test("text predicates preserve token boundaries while accepting regular inflections", () => {
  assert.equal(textMatchesReadPredicate("The activity was tracked yesterday.", predicate("track")), true);
  assert.equal(textMatchesReadPredicate("Several daily tracks were recorded.", predicate("track")), true);
  assert.equal(textMatchesReadPredicate("The pet is walking normally.", predicate("walk")), true);
  assert.equal(textMatchesReadPredicate("Medication was unchanged.", predicate("cat")), false);
  assert.equal(textMatchesReadPredicate("Seafood was avoided.", predicate("food")), false);
});

test("multi-token predicates remain contiguous and ordered", () => {
  assert.equal(textMatchesReadPredicate("usual walks were recorded", predicate("usual walk")), true);
  assert.equal(textMatchesReadPredicate("walks were usual", predicate("usual walk")), false);
});
