// Parse raw psql output captured inside the container (no PowerShell wrapping).
// Usage: node capture-plans.mjs /path/to/candidate-rpc-tests.log
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const log = readFileSync(process.argv[2], 'utf8');
assert.doesNotMatch(log, /ERROR:|FATAL:/);
assert.match(log, /ROLLBACK/);
function jsonAt(text, offset) {
  const start = text.slice(offset).search(/[\[{]/) + offset;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('Incomplete JSON plan');
}
const measurements = [];
for (const match of log.matchAll(/CASE_BEGIN (\w+)\r?\n([\s\S]*?)CASE_END \1/g)) {
  const [ , label, block ] = match;
  const marker = `OUTER ${label}: `;
  assert.ok(block.includes(marker));
  const outer = jsonAt(block, block.indexOf(marker) + marker.length);
  const nested = [...block.matchAll(/plan:\s*/g)].map(m => jsonAt(block, m.index + m[0].length));
  const candidates = nested.filter(p => p['Query Text']?.includes('/* experimental_candidate_any */'));
  assert.equal(candidates.length, label.includes('_rpc_') ? 1 : 0, label);
  measurements.push({ label, outer, internalCandidatePlans: candidates });
}
assert.equal(measurements.length, 84);
console.log(JSON.stringify({
  environment: 'PostgreSQL 17.6; local stage2_validation; 250062 synthetic care rows, 3 owners, 4 pets; VACUUM ANALYZE before reads; authenticated caller for both paths; default planner settings.',
  instrumentation: 'Three alternating warm runs per path/case; EXPLAIN ANALYZE BUFFERS outer plus auto_explain nested actual candidate plans. Nested logging adds overhead to RPC outer time. No cold-cache or production claim.',
  measurements: process.argv[3] ? measurements.filter(m => m.label.startsWith(process.argv[3] + '_')) : measurements,
}, null, 2));
