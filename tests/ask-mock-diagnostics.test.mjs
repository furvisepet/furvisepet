import test from 'node:test';
import assert from 'node:assert/strict';
import {trackedFixtureProvider,settleFixtureInterpretation} from './helpers/ask-wire-contract.mjs';

test('provider fixture assertion is preserved even when interpreter wraps it as transport', async()=>{
 const original=new assert.AssertionError({message:'wire schema differs'});
 const provider=trackedFixtureProvider(async()=>{throw original;});
 const interpretation=provider.create().catch(()=>{throw Error('ASK_INTERPRETATION_TRANSPORT');});
 await assert.rejects(settleFixtureInterpretation(interpretation,provider,true),error=>error===original);
});
test('a genuine interpreter rejection remains testable',async()=>{
 const provider=trackedFixtureProvider(async()=>({output_text:'{}'}));
 const interpretation=(async()=>{await provider.create();throw Error('ASK_REQUEST_CONTRACT_READ_TICKET');})();
 const result=await settleFixtureInterpretation(interpretation,provider,true);
 assert.match(result.message,/ASK_REQUEST_CONTRACT_READ_TICKET/);
});
test('expected rejection cannot silently accept a successful interpretation',async()=>{
 const provider=trackedFixtureProvider(async()=>({output_text:'{}'}));
 await assert.rejects(settleFixtureInterpretation(Promise.resolve({}),provider,true),/expected interpretation to reject/);
});
test('unexpected interpreter errors are retained',async()=>{
 const provider=trackedFixtureProvider(async()=>({output_text:'{}'}));
 const original=Error('actual interpreter failure');
 await assert.rejects(settleFixtureInterpretation(Promise.reject(original),provider),error=>error===original);
});

test('transport failure cannot satisfy an expected contract rejection',async()=>{
 const provider=trackedFixtureProvider(async()=>({output_text:'{}'}));
 const error=Object.assign(Error('transport'),{diagnostics:{providerErrorCode:'ASK_INTERPRETATION_TRANSPORT'}});
 await assert.rejects(settleFixtureInterpretation(Promise.reject(error),provider,true),/transport failure is not an expected contract rejection/);
});
