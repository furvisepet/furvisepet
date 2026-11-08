import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoutineUtterance } from '../app/lib/intelligence/routine-utterance.ts';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const id = n => `89100000-0000-4000-8000-${String(n).padStart(12,'0')}`;

const pet = { id: id(11), user_id: id(1), name: 'Cedar', sex: 'male' };
const parse = (q, pets = [pet], owner = id(1)) => parseRoutineUtterance(q, pet, pets, owner);
test('whole question requires an owned, unambiguous pet and valid calendar date', () => {
  assert.equal(parse("What did Cedar’s September 15 care note say about his routine?").issue, 'missing_year');
  assert.deepEqual(parse("What did Cedar’s September 15, 2021 care note say about his routine?"), { issue: null, date: '2021-09-15' });
  assert.equal(parse("What did Cedar’s February 30 care note say about his routine?").issue, 'invalid_date');
  assert.equal(parse("What did Cedar’s February 29 care note say about his routine?").issue, 'missing_year');
  assert.equal(parse("What did Cedar’s February 29, 2021 care note say about his routine?").issue, 'invalid_date');
  for (const q of ["What did Cedar’s September 15 care note say about his medication and routine?", "What did Cedar’s September 15 care note say about her routine?", "What did Other’s September 15 care note say about his routine?", "What did Cedar’s September 15 care note say about his routine? And medication?"]) assert.equal(parse(q), null, q);
  assert.equal(parse("What did Cedar’s September 15 care note say about his routine?", [pet, {...pet, id: id(12)}]), null);
  assert.equal(parse("What did Cedar’s September 15 care note say about his routine?", [pet], id(2)), null);
  const special = {...pet, name: 'C.*'};
  assert.equal(parseRoutineUtterance("What did C.*’s September 15 care note say about his routine?", special, [special], id(1)).issue, 'missing_year');
  assert.equal(parseRoutineUtterance("What did Cat’s September 15 care note say about his routine?", special, [special], id(1)), null);
});

test('authenticated Ask route clarifies before provider or note reads', () => {
  const result = spawnSync(process.execPath, ['--experimental-transform-types', fileURLToPath(new URL('./helpers/routine-year-route-check.mjs', import.meta.url))], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
