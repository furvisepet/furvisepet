import * as C from "./helpers/canonical-calculation-retirement.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceBoundSchema } from '../app/lib/intelligence/source-bound-schema.ts';
import {units} from "../app/lib/furvise-brain/calculation-units.ts";
import { renderCertifiedLabs } from '../app/lib/intelligence/labs-presentation.ts';
import { validateSemanticFrameEvidence } from '../app/lib/intelligence/semantic-frame/validate-evidence.ts';

// Characterization of existing helpers, NOT certification or public-answer acceptance.
const source = text => ({sourceId:'care:example',sourceType:'care_update',text});
test('source schema no longer enumerates provider arithmetic operands',()=>{
 const schema=sourceBoundSchema({properties:{operands:{items:{}}}},[source('Body mass 12 kg; carrier 2 kg; previous mass 10 kg.')]);
 assert.deepEqual(schema.properties.operands.items,{});
 C.rejects(c=>c.operands[0].literal="12 kg");
});
test("provider scalar meaning and values cannot override canonical read slots",async()=>{
 C.rejects(c=>c.operands[0].literal="12 kg");C.rejects(c=>c.operands[0].value=12);C.rejects(c=>c.operands[0].certainty="confirmed");
});
test("two masses in one selected record cannot yield independently chosen provider operands",async()=>{
 const f=await C.measured("convert",["Body 12 kg; carrier 2 kg"],"kg");assert.equal(f.response.model,"server-calculation-unavailable");await C.finish(f);
});
test("missing record transport cannot be replaced by citation identity",async()=>{
 const f=await C.fixture();f.response.calculationLabs.readLabs.records=[];assert.ok(C.calculationPublicationFailure(f.response));
});
test("stored exact scalar remains distinct from presentation rounding",async()=>{
 const f=await C.certified("convert",["Recorded 4.71 kg"],"kg",4.71,{precision:1});assert.deepEqual(f.response.calculationLabs.execution.results[0].exact,{numerator:"471",denominator:"100"});assert.match(f.response.answer.summary,/4\.7 kg/);
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
