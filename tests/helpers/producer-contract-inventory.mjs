import assert from 'node:assert/strict';
export function alternatives(node){
 assert.ok(node && typeof node==='object','schema node required');
 return node.anyOf ? node.anyOf.flatMap(alternatives) : [node];
}
const fields={
 read:['role','petName','clause','item','field','unit','measurementSelector'],
 premise:['kind','role','sourceTurnId','quote','unit'],
 result:['kind','role','calculationId'],
 recorded:['kind','role','petName','clause','item','unit'],
 anchor:['kind','source','role','petName','unit'],
};
export function operandKind(o){
 const p=o.properties;assert.ok(p,'operand object required');
 if(p.source?.enum?.includes('anchor'))return 'anchor';
 if(p.kind?.enum?.includes('recorded'))return 'recorded';
 if(p.calculationId)return 'result';
 if(p.quote)return 'premise';
 return 'read';
}
export function assertOperandContracts(schema,expectedKinds=['anchor','premise','read','recorded','result']){
 const found=new Set();
 for(const v of schema.properties.request.anyOf.filter(v=>v.properties.calculatePlan?.type==='object')){
  const domain=v.properties.evidenceBasis.enum[0];
  const arrays=alternatives(v.properties.calculatePlan.properties.calculations);
  for(const a of arrays)for(const node of alternatives(a.items)){
   const op=node.properties.operator.enum[0];
   for(const o of alternatives(node.properties.operands.items)){
    const k=operandKind(o);found.add(k);
    assert.equal(o.additionalProperties,false,k);
    assert.deepEqual(Object.keys(o.properties).sort(),fields[k].slice().sort(),k);
    assert.deepEqual(o.required.slice().sort(),fields[k].slice().sort(),k);
    if(op!=='count_records'){
     const roles={sum:['member'],mean:['member'],difference:['target','reference'],absolute_difference:['member'],ratio:['target','reference'],percent_change:['target','reference'],percent_of_sum:['part','member'],convert:['source'],elapsed_days:['start','end']}[op];
     assert.ok(roles,'unknown operator');assert.deepEqual(o.properties.role.enum,roles,op);
    }
    if(k==='recorded'||k==='anchor'){
     assert.equal(domain,'saved_history');assert.deepEqual(v.properties.readTicket.properties.authority.enum,['stored_report']);
     assert.equal(op,'difference');assert.equal(v.properties.calculatePlan.properties.calculations.maxItems,1);
     assert.equal(v.properties.calculatePlan.properties.resultSelection.type,'null');
    }else if(k==='read'){
     assert.equal(domain,'saved_history');assert.deepEqual(v.properties.readTicket.properties.authority.enum,['effective_fact']);
    }else if(k==='premise'){assert.equal(domain,'supplied_context');assert.equal(v.properties.readTicket.type,'null');}
   }
  }
 }
 assert.deepEqual([...found].sort(),expectedKinds.slice().sort());
}
export function assertCalculationDomains(schema){
 const variants=schema.properties.request.anyOf;
 const saved=variants.filter(v=>v.properties.calculatePlan?.type==='object'&&v.properties.evidenceBasis?.enum?.includes('saved_history'));
 const keys=saved.map(v=>v.properties.readTicket.properties.authority.enum[0]+':'+(v.properties.calculatePlan.properties.calculations.items?.anyOf?.every(n=>n.properties.operator.enum[0]==='count_records')?'count':'selected'));
 assert.deepEqual(keys.sort(),['effective_fact:count','effective_fact:selected','stored_report:selected']);
 for(const v of saved){
  assert.deepEqual(v.properties.mode.enum,['read']);assert.deepEqual(v.properties.operation.enum,['recall']);
  assert.equal(v.properties.storedRead.type,'null');assert.equal(v.properties.writeJob.type,'null');
  if(v.properties.readTicket.properties.authority.enum[0]==='effective_fact')assert.match(v.description,/factual root operands come from the companion ReadTicket/);
  else for(const term of ['attributed contents','never effective or clinical truth','target/reference'])assert.ok(v.description.includes(term),term);
 }
 assert.equal(variants.filter(v=>v.properties.calculatePlan?.type==='object'&&v.properties.evidenceBasis?.enum?.includes('supplied_context')).length,1);
 assertOperandContracts(schema);
}
export function assertAnchorGuidance(text){
 for(const term of ['effective_fact','stored_report','before selection','Do not invent','Incompatible with needs, episode, outputs.strategy and calendar selectors'])assert.ok(text.includes(term),term);
}
export function assertAnchorInstructions(text){
 for(const term of ['semantic temporal.anchor MAY compose with predicates and selection','never the ledger event or invented from/to dates','owned history under the explicit requested authority','concrete boundary before selection','stored_report retains report-only authority','effective_fact still requires certified effective truth','Missing, ambiguous or uncertifiable anchors retain existing anchor limitations','never drop the anchor or fall back to whole history','Calendar selectors remain incompatible with selection'])assert.ok(text.includes(term),term);
}
