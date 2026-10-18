import test from 'node:test';
import assert from 'node:assert/strict';
import {engineFixture as fixture, proposal} from './helpers/ask-route-ordering.mjs';
const {ASK_INTERPRETATION_LIMITS} = await import('../app/lib/intelligence/interpret-ask.ts');
const {ASK_INTERPRETATION_MAX_OUTPUT_TOKENS} = await import('../app/lib/ai/ask-provider.ts');
const {FURVISE_ANSWER_UNAVAILABLE_MESSAGE} = await import('../app/lib/furvise-output.ts');

// Fail on the actual early route outcome instead of waiting forever for a
// provider callback which cannot occur. This does not advance the fake clock
// or alter the provider deadline/abort/credit/write assertions.
async function awaitProviderEntry(began,pending){
 return Promise.race([began,pending.then(response=>{
  throw Error('ASK_TEST_PROVIDER_NOT_REACHED:'+response.status);
 })]);
}

test('provider-entry wait refuses an actual early authorization denial',async()=>{
 const f=fixture({denied:true,providerCreate:()=>{throw Error('UNAUTHORIZED_PROVIDER_CALL');}});
 await assert.rejects(awaitProviderEntry(new Promise(()=>{}),f.send()),/ASK_TEST_PROVIDER_NOT_REACHED:401/);
 assert.equal(f.state.planner,0);
 assert.equal(f.state.credit,null);
});

test('interpretation uses its canonical stage-specific output budget', () => {
   assert.equal(ASK_INTERPRETATION_LIMITS.outputTokens, Math.min(ASK_INTERPRETATION_MAX_OUTPUT_TOKENS,8192));
});

test('interpretation deadline fails closed through POST: one planner, no retrieve/write, released credit', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'info', () => {});
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.parse('2026-09-20T12:00:00Z')});
  let signal, finish, started, providerRequest;
  const began = new Promise(resolve => { started = resolve; });
  const f = fixture({creditLedger:true,realProviderLog:true,
    providerCreate:(request,options) => {
      providerRequest = request;
      signal = options.signal;
      started();
      return new Promise(resolve => { finish = resolve; });
    },
  });
  const pending = f.send();
  await awaitProviderEntry(began,pending);
   assert.equal(providerRequest.max_output_tokens, ASK_INTERPRETATION_LIMITS.outputTokens);
  assert.equal(ASK_INTERPRETATION_LIMITS.timeoutMs,25000);
  assert.equal(f.state.planner,1);
  assert.equal(f.state.credit.status,'reserved');
  t.mock.timers.tick(25000);
  const response = await pending;
  const body = await response.json();
  assert.equal(response.status,503,JSON.stringify(f.state.errors));
  assert.equal(body.success,false);
  assert.equal(body.message,FURVISE_ANSWER_UNAVAILABLE_MESSAGE);
  assert.equal(signal.aborted,true);
  assert.equal(f.state.planner,1);
  assert.deepEqual(f.state.credit,{status:'released',disposition:'release'});
  assert.equal(f.rows.pet_care_entries.length,2);
  assert.equal(f.rows.ask_action_capabilities.length,0);
  assert.equal(f.rows.ask_conversation_messages.filter(row=>row.role==='furvise').length,0);
  assert.ok(!f.state.events.some(event=>event==='read:pet_care_entries'||event.startsWith('heart:')||event.startsWith('lungs:')));
  const trace = f.state.traces.at(-1);
  assert.equal(trace.creditState,'released');
  assert.equal(trace.creditDisposition,'release');
  const failure = warn.mock.calls.find(call=>call.arguments[0]==='[Ask provider] stage failed')?.arguments[1];
  assert.ok(failure?.requestId);
  assert.equal(failure.elapsedMs,25000);
  assert.equal(failure.timedOut,true);
  assert.equal(failure.ticketArrived,false);
  assert.equal(failure.providerErrorCode,'ASK_INTERPRETATION_TIMEOUT');
  assert.equal(failure.providerCallCount,1);
  const before = structuredClone({events:f.state.events,rows:f.rows,credit:f.state.credit});
  finish({output_text:JSON.stringify(proposal())});
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual({events:f.state.events,rows:f.rows,credit:f.state.credit},before);
  assert.equal(f.state.planner,1);
});
