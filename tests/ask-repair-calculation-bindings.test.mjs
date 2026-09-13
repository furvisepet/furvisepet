import test from 'node:test';
import assert from 'node:assert/strict';
import {retainRepairCalculationBindings as retain} from '../app/lib/intelligence/repair-calculation-bindings.ts';
const sources=[31,34,36,39].map((n,i)=>({sourceId:`care:${i}`,text:`Breakfast: ${n} g.`,occurredAt:`2026-08-${String(3+i*3).padStart(2,'0')}T00:00:00Z`}));
const ids=sources.map(s=>s.sourceId);
const operands=sources.map((s,i)=>({sourceId:s.sourceId,field:'text',literal:[31,34,36,39][i]+' g'}));
const calculations=[{operation:'sum',operands,value:140,unit:'g'},{operation:'mean',operands,value:35,unit:'g'}];
const original={sentences:[{text:'Total: 140 g; mean: 35 g.',sourceIds:ids,calculations}]};
const repaired={sentences:[{text:'Gesamtmenge: 140 g; Durchschnitt: 35 g.',sourceIds:ids}]};
test('reworded repair retains recomputed arithmetic without changing text or citations',()=>{
 const result=retain(original,repaired,sources,'Give the total and mean.');
 assert.deepEqual(result.sentences[0],{...repaired.sentences[0],calculations});
 assert.equal(repaired.sentences[0].calculations,undefined);
 assert.notEqual(result.sentences[0].calculations,calculations);
});
test('repair cannot inherit proofs from missing, changed or foreign sources',()=>{
 for(const records of [sources.slice(1),sources.map((s,i)=>i? s:{...s,text:'Breakfast: 99 g.'})])
  assert.deepEqual(retain(original,repaired,records,''),repaired);
 const narrower={sentences:[{...repaired.sentences[0],sourceIds:ids.slice(1)}]};
 assert.deepEqual(retain(original,narrower,sources,''),narrower);
});
test('repair does not replace invalid metadata or approve a different computed value',()=>{
 const bad={sentences:[{...repaired.sentences[0],calculations:[{...calculations[0],value:141}]}]};
 assert.deepEqual(retain(original,bad,sources,''),bad);
 const wrong={sentences:[{...repaired.sentences[0],text:'Gesamtmenge: 141 g.'}]};
 assert.deepEqual(retain(original,wrong,sources,''),wrong);
 const invalidOriginal={sentences:[{...original.sentences[0],calculations:bad.sentences[0].calculations}]};
 assert.deepEqual(retain(invalidOriginal,repaired,sources,''),repaired);
});
