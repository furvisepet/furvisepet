import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";

test("Ask concurrency retains newest UI state, owned replay, bounded calls and mutation denial",()=>{
 const expectedNames=[
  "last conversation selection wins against late successes and late failures",
  "leaving a conversation during loading invalidates its completion",
  "Ask marks request activity around exactly one guarded submission",
  "in-progress responses retain the canonical idempotency key",
  "reloaded first turn recovers its original payload and credit identity through a full hash match",
  "completed replay and already-canonical claims are returned without another claim",
  "concurrent admissions share the same durable two call counter",
  "a logical turn cannot be reused for changed content",
  "public Ask mutation endpoints retain authenticated denial without any database or provider access",
  "anonymous callers cannot use retired action or suggestion APIs",
  "invalid action identities remain uniformly unavailable",
  "read-only public handlers cannot import or dispatch privileged mutation execution even under a changed flag",
  "central origin rejection is preserved by both disabled endpoints",
 ];
 // Every listed name is an exact, fixed test title, with no regex operators.
 const pattern=expectedNames.map(name=>"^"+name+"$").join("|");
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const files=["tests/ask-first20-reliability.test.mjs","tests/ask-inflight-navigation.test.mjs",
  "tests/ask-restored-retry.test.mjs","tests/v27-ask-two-call-limit.test.mjs","tests/ask-read-only-actions.test.mjs"];
 const result=spawnSync(process.execPath,["scripts/run-tests.mjs","--test-concurrency=1","--test-reporter=tap","--test-name-pattern="+pattern,...files],{
  cwd:new URL("..",import.meta.url),env,encoding:"utf8",maxBuffer:10000000,timeout:120000});
 assert.equal(result.error,undefined,result.error?.message);
 for(const name of expectedNames)assert.ok(result.stdout.split("\n").some(line=>line.startsWith("ok ")&&line.includes(name)),name+"\n"+result.stdout+result.stderr);
 assert.ok(result.stdout.split("\n").some(line=>line.trim()==="# tests "+expectedNames.length),result.stdout);
 assert.equal(result.status,0,result.stdout+result.stderr);
});
