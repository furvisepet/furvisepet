import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isRetryableOperationResponse as retryable } from '../app/lib/security/idempotency/retryable-response.ts';
const ask='ask.submit.persisted_answer_v2';
test('Ask concurrency and provider refusal remain retryable with the same canonical key',()=>{
 for(const [status,code] of [[409,'RATE_LIMIT'],[429,'RATE_LIMIT'],[409,'ANSWER_ALREADY_ACTIVE'],[429,'TEMPORARY_PROVIDER_FAILURE']]) assert.equal(retryable(ask,status,{success:false,code}),true);
 const operation=readFileSync('app/lib/security/idempotency/operation.ts','utf8');
 assert.match(operation,/isRetryableOperationResponse\(input.operationType, response.status, body\)[\s\S]*?failStoredOperation\([\s\S]*?retryable: true/);
});
test('successful answers, genuine conflicts, plan limits and other operations stay terminal',()=>{
 for(const [operation,status,body] of [[ask,200,{success:true}],[ask,409,{success:false,code:'IDEMPOTENCY_CONFLICT'}],[ask,429,{success:false,code:'PLAN_LIMIT'}],[ask,409,{success:true,code:'RATE_LIMIT'}],['care.save',409,{success:false,code:'RATE_LIMIT'}],[ask,403,{success:false,code:'RATE_LIMIT'}]]) assert.equal(retryable(operation,status,body),false);
 assert.equal(retryable('care.save',503,{}),true);
});
