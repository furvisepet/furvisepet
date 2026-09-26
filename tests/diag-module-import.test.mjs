import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
registerHooks({ resolve(s,c,next) {
  if (s==="server-only") return {shortCircuit:true,url:"data:text/javascript,export {}"};
  if (s.endsWith("/care-authority-client.ts")) return {shortCircuit:true,url:"data:text/javascript,export const createCanonicalCareAuthorityClient=()=>({});"};
  if (s.endsWith("/security/idempotency/admin-client.ts")) return {shortCircuit:true,url:"data:text/javascript,export const createIdempotencyAdminClient=()=>({});"};
  if (s.endsWith("/ask-conversation-authority.ts")) return {shortCircuit:true,url:"data:text/javascript,export const completeAskConversationTurn=()=>({});export const updateAskAssistantResponse=()=>({});"};
  if (s.startsWith(".") && c.parentURL?.startsWith("file:")) {
    for (const ext of [".ts",".tsx",".mjs"]) {
      const url=new URL(s+ext,c.parentURL); if (existsSync(url)) return next(url.href,c);
    }
  }
  return next(s,c);
}});
test("module import prepareAppendTurn", async () => {
  const mod=await import("../../app/lib/intelligence/append-turn.ts");
  assert.equal(typeof mod.prepareAppendTurn,"function");
});
