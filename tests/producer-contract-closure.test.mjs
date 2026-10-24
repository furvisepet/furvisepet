import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {assertCalculationDomains,assertOperandContracts,alternatives,assertAnchorGuidance,assertAnchorInstructions} from './helpers/producer-contract-inventory.mjs';
import {verifyCurrentPolicy,assertFinalReadGuidance} from './helpers/producer-policy-review.mjs';
import {POLICY_BUNDLE} from '../app/lib/intelligence/ask-wire-policy.generated.mjs';
registerHooks({resolve(s,c,n){if(s==='server-only')return{url:'data:text/javascript,export {}',shortCircuit:true};if(s.startsWith('.'))for(const suffix of['.ts','/index.ts']){const u=new URL(s+suffix,c.parentURL);if(existsSync(u))return n(u.href,c);}return n(s,c);}});
globalThis.fetch=async()=>{throw Error('CONTROLLED_CONTRACT_NO_NETWORK');};
const{askRequestProviderSchema,askRequestSchema,ASK_REQUEST_INSTRUCTIONS}=await import('../app/lib/intelligence/ask-request-contract.ts');
const schema=askRequestProviderSchema({}),inventory=JSON.parse(readFileSync(new URL('./fixtures/ask-producer-contract-current.json',import.meta.url),'utf8'));
test('complete producer calculation domains and each operand alternative retain independent closed authority',()=>{assertCalculationDomains(schema);});
test('operand contract validator rejects role removal, injected numeric value and wrong recorded authority',()=>{
 for(const change of['role','value','authority']){
  const bad=structuredClone(schema),v=bad.properties.request.anyOf.find(v=>v.properties.calculatePlan?.type==='object'&&v.properties.readTicket?.properties?.authority?.enum?.includes('stored_report'));
  const o=alternatives(v.properties.calculatePlan.properties.calculations.items.anyOf[0].properties.operands.items)[0];
  if(change==='role')o.required=o.required.filter(k=>k!=='role');
  if(change==='value'){o.properties.value={type:'number'};o.required.push('value');}
  if(change==='authority')v.properties.readTicket.properties.authority.enum=['effective_fact'];
  assert.throws(()=>assertOperandContracts(bad),undefined,change);
 }
});
test('producer domain validator rejects missing branches, added operators and unavailable operand alternatives',()=>{
 const missing=structuredClone(schema);missing.properties.request.anyOf=missing.properties.request.anyOf.filter(v=>!v.properties.readTicket?.properties?.authority?.enum?.includes('stored_report')||v.properties.calculatePlan?.type!=='object');assert.throws(()=>assertCalculationDomains(missing));
 const bad=structuredClone(schema),v=bad.properties.request.anyOf.find(v=>v.properties.calculatePlan?.type==='object'&&v.properties.readTicket?.properties?.authority?.enum?.includes('stored_report'));v.properties.calculatePlan.properties.calculations.items.anyOf[0].properties.operator.enum=['sum'];assert.throws(()=>assertCalculationDomains(bad));
});
test('current policy review detects a missing source section, dropped literal guard and unknown annotation disposition',()=>{
 verifyCurrentPolicy(POLICY_BUNDLE,ASK_REQUEST_INSTRUCTIONS,inventory);
 assert.throws(()=>verifyCurrentPolicy(POLICY_BUNDLE,ASK_REQUEST_INSTRUCTIONS.split('\n').slice(1).join('\n'),inventory));
 for(const key of['rules','annotationHashes']){
  const bad=structuredClone(POLICY_BUNDLE);bad[key]=bad[key].slice(1);assert.throws(()=>verifyCurrentPolicy(bad,ASK_REQUEST_INSTRUCTIONS,inventory));
 }
});
test('anchor guidance retains both authority proofs and fail-closed exclusions under mutation',()=>{
 const s=askRequestSchema({}).properties.readTicket.anyOf.find(s=>s.properties?.selection.type==='object').properties.selection.description;
 assertAnchorGuidance(s);assertAnchorInstructions(ASK_REQUEST_INSTRUCTIONS);
 assert.throws(()=>assertAnchorGuidance(s.replace('stored_report','removed')));
 assert.throws(()=>assertAnchorInstructions(ASK_REQUEST_INSTRUCTIONS.replaceAll('never drop the anchor or fall back to whole history','removed')));
});

test('current USER premise availability follows actual numeric context without losing saved-source alternatives',()=>{
 const q='Convert 2 kg to g.',numeric={owner:{userId:'synthetic-owner'},currentMessage:q,currentTurn:{id:'current',role:'user',text:q},conversationTurns:[],eligiblePets:[],timeZone:'UTC'};
 const withPremises=askRequestProviderSchema({},numeric);assertCalculationDomains(withPremises);
 const noQuantity={...numeric,currentMessage:'Read the saved observation.',currentTurn:{...numeric.currentTurn,text:'Read the saved observation.'}};
 const noPremises=askRequestProviderSchema({},noQuantity);
 assert.equal(noPremises.properties.request.anyOf.filter(v=>v.properties.calculatePlan?.type==='object'&&v.properties.evidenceBasis?.enum?.includes('supplied_context')).length,0);
 assertOperandContracts(noPremises,['anchor','read','recorded','result']);
});

test('final normal-builder policy resolves historical wording without changing canonical output or filters',async()=>{
 const{prepareAskInterpretationRequest}=await import('../app/lib/intelligence/interpret-ask.ts');
 const corpus=JSON.parse(readFileSync(new URL('./fixtures/ask-wire-codec.json',import.meta.url),'utf8'));
 const prepared=prepareAskInterpretationRequest(corpus.contexts.no_numeric,'gpt-5.4-mini');
 assertFinalReadGuidance(prepared.transport.instructions);
 assert.throws(()=>assertFinalReadGuidance(prepared.transport.instructions+' No calendar, episode, probes, calculations or legacy strategy.'));
});
