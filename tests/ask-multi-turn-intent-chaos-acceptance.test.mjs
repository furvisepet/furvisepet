import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Ask multi-turn intent chaos preserves durable task and mutation authority',()=>{
  const env={...process.env}; delete env.NODE_TEST_CONTEXT;
  const result=spawnSync(process.execPath,[
    '--experimental-transform-types','--test','--test-reporter=tap','scripts/audits/ask-multi-turn-intent-chaos.cases.mjs',
    'tests/ask-task-continuation.test.mjs','tests/furvise-brain-working-memory.test.mjs',
  ],{cwd:new URL('..',import.meta.url),env,encoding:'utf8',maxBuffer:10_000_000});
  for(const name of ['save-that without established subject','verified save then explicit cancellation','subject correction switches later pronouns','switching to Pepper','fresh historical read after save/cancel','a later explicit save targets'])assert.ok(result.stdout.split(/\r?\n/).some(line=>/^ok /.test(line)&&line.includes(name)),name);
  assert.match(result.stdout,/# tests 38/);
  assert.equal(result.status,0,result.stdout+result.stderr);
});
