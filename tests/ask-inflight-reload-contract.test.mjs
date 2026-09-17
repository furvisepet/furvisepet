import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('first-turn reload recovery is GET-only and content-free', async()=>{
 const [page,route,recovery]=await Promise.all([
  text('app/ask/page.tsx'), text('app/api/ask/route.ts'), text('app/lib/ask-inflight-recovery.ts')
 ]);
 assert.match(page,/persistPendingAskRecovery\(window\.sessionStorage/);
 assert.match(page,/fetch\(`\/api\/ask\?requestId=/);
 assert.match(page,/method: "GET"/);
 assert.equal((page.match(/idempotentClientFetch\("\/api\/ask"/g)||[]).length,1);
 assert.doesNotMatch(recovery,/prompt|question|message|user_text|response_data/);
 assert.match(route,/ANSWER_ALREADY_ACTIVE[\s\S]*conversationId: state\.conversationId[\s\S]*userMessageId: state\.userMessageId/);
});

test('recovery adopts server conversation and never reconstructs a POST',async()=>{
 const page=await text('app/ask/page.tsx');
 assert.match(page,/persistPendingAskRecovery\(window\.sessionStorage, \{ \.\.\.pending, conversationId/);
 assert.match(page,/setActiveConversationId\(conversationId\)/);
 assert.match(page,/replaceAskLocation\(\{ conversationId \}\)/);
 assert.match(page,/pollPendingFirstTurn/);
 assert.doesNotMatch(page,/pollPendingFirstTurn[\s\S]{0,1800}method: "POST"/);
});
