// Local-only actual server cancellation. No fixture data, provider or HTTP calls.
// Locks only dog_profiles in the named disposable database, then ROLLBACK.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
const args = ['exec', '-i', 'furvise-stage2-db-2788f0b', 'psql', '-X', '-U', 'postgres', '-d', 'stage2_validation', '-v', 'ON_ERROR_STOP=1'];
const blocker = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
let output = '', diagnostics = '';
blocker.stdout.on('data', bytes => { output += bytes; });
blocker.stderr.on('data', bytes => { diagnostics += bytes; });
const closed = once(blocker, 'close');
try {
  blocker.stdin.write("begin; set local lock_timeout='2s'; lock table public.dog_profiles in access exclusive mode; select 'LOCK_READY';\n");
  const deadline = Date.now() + 5000;
  while (!output.includes('LOCK_READY') && Date.now() < deadline && blocker.exitCode === null) await new Promise(resolve => setTimeout(resolve, 25));
  assert.match(output, /LOCK_READY/, diagnostics);
  for (const ms of [250, 8000]) {
    const started = Date.now();
    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 12000, input:
      `\\set VERBOSITY verbose\nset statement_timeout='${ms}ms'; set role authenticated; select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',false); select * from public.read_ask_history_candidates('93000000-0000-4000-8000-000000000011',array['vomit']);\n`.replace('\\\\set', '\\set') });
    const elapsedMs = Date.now() - started;
    console.log(JSON.stringify({ timeoutMs: ms, elapsedMs, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message }));
    assert.equal(result.error, undefined);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /57014: canceling statement due to statement timeout/);
    assert.ok(elapsedMs >= ms - 50 && elapsedMs < ms + 3000);
  }
} finally {
  blocker.stdin.end('rollback;\n');
  await closed;
  console.log(JSON.stringify({ blockerStatus: blocker.exitCode, output, diagnostics }));
}
assert.match(output, /ROLLBACK/);
