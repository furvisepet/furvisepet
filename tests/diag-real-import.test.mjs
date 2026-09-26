import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({ resolve(s,c,next) {
  if (s==="server-only") return {shortCircuit:true,url:"data:text/javascript,export {}"};
  return next(s,c);
}});
test("real import prepareAppendTurn", async()=> {
  const mod=await import("../../app/lib/intelligence/append-turn.ts");
  assert.equal(typeof mod.prepareAppendTurn,"function");
});
