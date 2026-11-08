import assert from 'node:assert/strict';
import {fixture} from './ask-staged-route-fixture.mjs';
for (const [question, expected] of [
  ["What did Cedar’s September 15 care note say about his routine?", /Which year was that care note from/],
  ["What did Cedar’s February 30 care note say about his routine?", /date isn’t valid/],
]) {
  const f = fixture({engineCapabilities:true, fullCatalogPipeline:true});
  const res = await f.send(question);
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify({body, errors:f.state.errors.map(x=>x.error?.message)}));
  assert.match(JSON.stringify(body), expected);
  assert.equal(f.state.planner, 0);
  assert.ok(!(f.state.queries || []).some(q => q.table === 'pet_care_entries'));
}

for (const question of [
  "What did Cedar’s September 15, 2021 care note say about his routine?",
  "What did Cedar’s September 15 care note say about his medication and routine?",
]) {
  let admitted = 0;
  const f = fixture({engineCapabilities:true, fullCatalogPipeline:true,
    admitAiOperation: async () => { admitted++; throw Error('offline admission sentinel'); }});
  const res = await f.send(question);
  const body = await res.json();
  assert.equal(admitted, 1, JSON.stringify({body, errors:f.state.errors.map(x=>x.error?.message)}));
  assert.doesNotMatch(JSON.stringify(body), /Which year was that care note from/);
}
