// Fake-provider encoding only; actual response parsing uses real runtime deadlines.
import { createRecursiveAskWirePlan } from "../../app/lib/intelligence/ask-wire-recursive.mjs";
export function recursiveFixturePlan(plan) {
  const transport = createRecursiveAskWirePlan(plan, () => {});
  return { ...transport, encode: value => transport.encode(value, () => {}),
    decode: value => transport.decode(value, () => {}) };
}

// Generate fake provider output through the ACTUAL prepared transport. The
// fixture encoder gets its own finite check; runtime decode keeps its original
// per-response/operation deadline and all original validation.
import assert from 'node:assert/strict';
import {OperationDeadline} from '../../app/lib/ai/execution-deadline.ts';
export function actualTransportFixturePlan(prepared){
 assert.ok(prepared?.transport && typeof prepared.transport.encode==='function');
 assert.deepEqual(prepared.request.text.format.schema,prepared.transport.schema);
 function apply(method,value){
  const deadline=new OperationDeadline(5000);
  const check=()=>deadline.allocate('interpretation',5000);
  check();return prepared.transport[method](value,check);
 }
 return {encode:value=>apply('encode',value),decode:value=>apply('decode',value)};
}
