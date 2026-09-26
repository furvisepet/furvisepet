import assert from "node:assert/strict";
import test from "node:test";
import { fixture, proposal } from "./helpers/ask-route-ordering.mjs";
test("append route fixture constructs", () => {
  const f=fixture({proposal:proposal()});
  assert.equal(typeof f.send,"function");
  assert.ok(f.state);
});
