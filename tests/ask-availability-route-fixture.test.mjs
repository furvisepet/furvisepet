import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/ask-staged-route-fixture.mjs';

test('disabled real POST returns before owner, conversation, credit or provider IO', async () => {
 const f=fixture({aiEnabled:false});
 const before=structuredClone(f.rows);
 const response=await f.send('A question that must not reach a provider');
 assert.equal(response.status,503);
 assert.equal((await response.json()).code,'AI_FEATURE_UNAVAILABLE');
 assert.deepEqual(f.rows,before);
 assert.deepEqual(f.state.events,[]);
 assert.equal(f.state.planner,0);
});
test('enabled offline route retains the authentication boundary', async () => {
 const f=fixture({denied:true});
 const response=await f.send('An unauthenticated question');
 assert.equal(response.status,401);
 assert.equal(f.state.planner,0);
 assert.equal(f.rows.ask_conversation_messages.length,0);
});
