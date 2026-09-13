import test from 'node:test';
import assert from 'node:assert/strict';
import { isTerminalVetBriefFailure } from '../app/lib/vet-brief/request.ts';

test('only known completed failures allow a new explicit brief attempt', () => {
  assert.equal(isTerminalVetBriefFailure(503, { code: 'VET_BRIEF_PREPARATION_FAILED' }), true);
  assert.equal(isTerminalVetBriefFailure(503, { error: 'The Vet Visit Brief could not be prepared right now. Try again in a moment.' }), true);
  for (const [status,payload] of [[503,null],[503,{error:'upstream timeout'}],[504,{}],[409,{code:'REQUEST_IN_PROGRESS'}],[409,{code:'AI_REQUEST_ALREADY_ACTIVE'}],[429,{code:'RATE_LIMITED'}],[200,{}]]) assert.equal(isTerminalVetBriefFailure(status,payload), false);
});
