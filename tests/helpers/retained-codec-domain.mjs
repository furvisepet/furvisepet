// Retained synthetic stress domain: union of existing context-sensitive
// decoder and producer schemas. Neither schema grants Binder authority.
// This test-only codec is not the native runtime transport.
import assert from 'node:assert/strict';
import {createGraphCodec,expand,makeValidator} from '../../app/lib/intelligence/ask-wire-codec.mjs';
import {askRequestSchema,askRequestProviderSchema} from '../../app/lib/intelligence/ask-request-contract.ts';
export function retainedStressCodec(frame,context){
 const decoder={type:'object',additionalProperties:false,required:['request'],properties:{request:askRequestSchema(frame,context)}};
 const producer=askRequestProviderSchema(frame,context);
 const codec=createGraphCodec({type:'object',additionalProperties:false,required:['request'],
  properties:{request:{anyOf:[decoder.properties.request,producer.properties.request]}}});
 const d=expand(decoder),p=expand(producer),dv=makeValidator(d),pv=makeValidator(p);
 return {...codec,membership:value=>({decoder:dv(d,value),producer:pv(p,value)})};
}
export function assertRetainedRoundTrip(codec,canonical){
 const encoded=codec.encode(canonical);
 assert.deepEqual(codec.decode(JSON.parse(JSON.stringify(encoded))),canonical);
 return encoded;
}
export function assertArchivedExactOrRejected(plan,archived,canonical){
 let decoded,error;
 try{decoded=plan.decode(archived);}catch(e){error=e;}
 if(error)assert.match(error.message,/^ASK_WIRE_/);
 else assert.deepEqual(decoded,canonical,'archived wire must never acquire another meaning');
}
