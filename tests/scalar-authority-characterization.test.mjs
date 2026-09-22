import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceBoundSchema } from '../app/lib/intelligence/source-bound-schema.ts';
import { verifiedCalculationQuantities as verify, units } from '../app/lib/intelligence/history-calculation.ts';
import { renderCertifiedLabs } from '../app/lib/intelligence/labs-presentation.ts';
import { validateSemanticFrameEvidence } from '../app/lib/intelligence/semantic-frame/validate-evidence.ts';

// Characterization of existing helpers, NOT certification or public-answer acceptance.
const source = text => ({sourceId:'care:example',sourceType:'care_update',text});
const conversion = literal => ({operation:'convert',operands:[{sourceId:'care:example',field:'text',literal}],value:Number(literal.split(' ')[0]),unit:'kg',expression:null});
test('provider operand enumeration cannot distinguish current mass from equipment or previous mass',()=>{
 const schema=sourceBoundSchema({properties:{operands:{items:{}}}},[source('Body mass 12 kg; carrier 2 kg; previous mass 10 kg.')]);
 const choices=schema.properties.operands.items.anyOf;
 assert.deepEqual(choices[0].properties.literal.enum.filter(v=>v.endsWith(' kg')),['12 kg','2 kg','10 kg']);
});
test('an exact literal from approximate prose still passes arithmetic-only binding',()=>{
 assert.notEqual(verify([conversion('12 kg')],[source('Possibly about 12 kg; not yet measured.')]),null);
});
test('two different masses in the same source can each pass arithmetic-only binding',()=>{
 const rows=[source('Body 12 kg; carrier 2 kg.')];
 for(const v of ['12 kg','2 kg']) assert.notEqual(verify([conversion(v)],rows),null);
});
test('citation identity without represented source is insufficient even for arithmetic',()=>{
 assert.equal(verify([conversion('12 kg')],[]),null);
});
test('stored literal precision is distinct from display-rounded literal binding',()=>{
 const rows=[source('Recorded 4.71 kg.')];
 assert.notEqual(verify([conversion('4.71 kg')],rows),null);
 assert.equal(verify([conversion('4.7 kg')],rows),null);
});
test('current unit registry lacks affine temperature and calendar-month duration units',()=>{
 assert.equal(units.c,undefined); assert.equal(units.f,undefined);
 assert.equal(units.month,undefined); assert.equal(units.year,undefined);
 assert.equal(units.kg.dimension,units.lb.dimension);
});
test('grounded quotation coordinates alone do not validate proposed scalar meaning or value',()=>{
 const text='Body 12 kg; carrier 2 kg.';
 const evidence=[{surfaceText:text,quote:text,start:0,end:text.length,alignment:'exact'}];
 const frame={mentions:[],claims:[{localId:'claim-local',kind:'assertion',value:999,unit:'kg',evidence}]};
 assert.equal(validateSemanticFrameEvidence(frame,text).valid,true);
});
test('Labs presentation preserves every note number instead of certifying a selected scalar',()=>{
 const body='Body 12 kg; carrier 2 kg; previously 10 kg.';
 const groups=[{subject:'Pet',heading:'Selected record',rows:[{id:'example',sourceId:'care:example',petId:'pet',event_at:'2026-09-15T00:00:00Z',body}]}];
 for(const format of ['prose','list','table','compact']){
   const result=renderCertifiedLabs(groups,format,[]);
   for(const v of ['12 kg','2 kg','10 kg'])assert.ok(result.includes(v));
 }
});
