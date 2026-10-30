// Explicit synthetic structural contrasts. No account/provider/DB operations.
import './helpers/ask-release-loader.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const contract=await import('../app/lib/intelligence/ask-request-contract.ts');
const frame=await import('../app/lib/intelligence/semantic-frame/schema.ts');
const policy=await import('../app/lib/intelligence/ask-wire-policy.mjs');
const direct=await import('../app/lib/intelligence/ask-wire-direct.mjs');
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/ask-wire-codec.json',import.meta.url)));
const copy=structuredClone;
function ctx(text){const c=copy(fixtures.contexts.no_numeric);Object.assign(c,{currentMessage:text,pendingTask:null,completedOwnerNote:null});c.currentTurn.text=text;return c;}
function plan(c){const s=contract.askRequestProviderSchema(frame.proposedSemanticFrameJsonSchema,c),w=policy.createAskWirePlan(s,contract.ASK_REQUEST_INSTRUCTIONS,undefined,()=>{});return direct.createDirectSemanticAskWirePlan(w,w.instructions,contract.askRequestSchema(frame.proposedSemanticFrameJsonSchema,c),()=>{},s,c?.timeZone??'UTC');}
function value(c,basis='general'){const s=contract.askRequestSchema(frame.proposedSemanticFrameJsonSchema,c);return Object.assign(Object.fromEntries(Object.keys(s.properties).map(k=>[k,null])),{version:contract.ASK_REQUEST_VERSION,mode:'conversation',question:c.currentMessage,requirements:[],referenceTurnIds:[],evidenceNeeds:[],profileFields:[],premiseQuotes:[],excludedPetNames:[],petNames:[],terms:[],evidenceBasis:basis,scope:'none',operation:'general',selection:'summary',topic:'general',quantity:null});}
function inverse(p,v){const encoded=p.encode({request:v},()=>{});assert.deepEqual(p.decode(encoded,()=>{}),{request:v});return encoded;}
test('source-free conversation: preserve general intent; exclude original Binder-invalid empty premise and absent pending tasks',()=>{
 const c=ctx('Explain account access.'),p=plan(c),general=value(c);const x=inverse(p,general);assert.doesNotThrow(()=>contract.validateAskRequest(copy(general),c));
 const bad=value(c,'supplied_context');assert.throws(()=>contract.validateAskRequest(copy(bad),c),/missing_supplied_premise/i);assert.throws(()=>p.encode({request:bad},()=>{}));
 for(const intent of ['resume','cancel']){const v=value(c);v.task={intent,sourceTurnId:null,petName:null,answerRequest:null};assert.throws(()=>p.encode({request:v},()=>{}));}
 assert.throws(()=>p.decode({...x,unexpected:true},()=>{}));assert.throws(()=>p.decode({request:{...x.request,kind:'unknown_branch'}},()=>{}));
});
test('supplied USER premise is typed, exact, and still subject to original source grounding',()=>{
 const c=ctx('Sable is resting comfortably. Please rephrase that statement.'),p=plan(c),v=value(c,'supplied_context');v.premiseQuotes=['Sable is resting comfortably.'];inverse(p,v);assert.doesNotThrow(()=>contract.validateAskRequest(copy(v),c));
 const bad=copy(v);bad.premiseQuotes=['UNTRUSTED ABSENT SOURCE'];assert.throws(()=>contract.validateAskRequest(bad,c),/premise_source/i);
});
test('existing authorized task retains exact earlier-owned canonical value without a fabricated premise',()=>{
 const c=ctx('Save this note: Sable is resting comfortably.'),p=plan(c),v=value(c,'supplied_context');v.task={intent:'save',sourceTurnId:c.currentTurn.id,petName:null,answerRequest:null};inverse(p,v);assert.doesNotThrow(()=>contract.validateAskRequest(copy(v),c));
});
