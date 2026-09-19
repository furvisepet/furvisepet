import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { prepareFurviseApplicationActions } from '../app/lib/application-actions/planner.ts';

test('typed navigation actions resolve to existing application pages', () => {
  for (const [kind, label] of [
    ['navigation.open_care_history', 'care history'],
    ['navigation.open_memories', 'memories'],
    ['navigation.open_vet_brief', 'Vet Brief'],
    ['navigation.open_pet_profile', 'profile'],
  ]) {
    const actions = prepareFurviseApplicationActions({
      proposals: [{ kind, explicitIntent: false, evidence: `Open Mani's ${label}`,
        input: { field: null, value: null, title: null, detail: null, category: null, target: 'selected' } }],
      petId: 'test-pet', petName: 'Mani', requestId: 'navigation-destinations',
      sourceMessage: `Open Mani's ${label}`,
    });
    assert.equal(actions.length, 1);
    const path = new URL(actions[0].href, 'https://furvise.test').pathname.replace('test-pet', '[id]');
    assert.ok(existsSync(new URL(`../app${path}/page.tsx`, import.meta.url)), kind);
  }
});
