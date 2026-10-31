import {canonicalSchemaError} from './ask-wire-diagnostic.mjs';
import {restrict} from './ask-wire-catalog-correlations.mjs';
// Lossless explicit operation families. No input text or authenticated context is inspected.
import {makeValidator} from './ask-wire-codec.mjs';
const clone=x=>structuredClone(x);
const fail=code=>{throw Error('ASK_OPERATION_'+code)};
const stable=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function compileOperationWire(root){
 const valid=makeValidator(root),entries=[];
 function fixed(s){
  let value,yes=false;
  if(s.enum?.length===1){value=clone(s.enum[0]);yes=true}
  else if(s.type==='null'){value=null;yes=true}
  else if(s.type==='array'&&s.maxItems===0&&(s.minItems??0)===0){value=[];yes=true}
  else if(s.anyOf){const p=s.anyOf.map(fixed);if(p.every(x=>x.yes)&&p.every(x=>stable(x.value)===stable(p[0].value))){value=p[0].value;yes=true}}
  else if(s.type==='object'&&s.additionalProperties===false&&s.required?.length===Object.keys(s.properties||{}).length){
   const p=Object.entries(s.properties).map(([k,v])=>[k,fixed(v)]);
   if(p.every(([,v])=>v.yes)){value=Object.fromEntries(p.map(([k,v])=>[k,v.value]));yes=true}
  }
  if(yes&&!valid(s,value))fail('SINGLETON_PROOF');
  return {yes,value};
 }
 function node(s){
  // Unions stay exactly typed: no first-match decoding or erased discriminator.
  if(s.anyOf||Array.isArray(s.type))return {schema:clone(s),encode:clone,decode:clone,fixed:0};
  if(s.type==='object'){
   if(s.additionalProperties!==false||stable([...s.required].sort())!==stable(Object.keys(s.properties).sort()))fail('OBJECT_CONTRACT');
   const constants={},children={},properties={};let count=0;
   for(const[k,v]of Object.entries(s.properties)){const p=fixed(v);if(p.yes){constants[k]=p.value;count++}else {children[k]=node(v);properties[k]=children[k].schema;count+=children[k].fixed}}
   const schema={...clone(s),properties,required:s.required.filter(k=>!Object.hasOwn(constants,k))};
   return {schema,fixed:count,
    encode:x=>Object.fromEntries(schema.required.map(k=>[k,children[k].encode(x[k])])),
    decode:x=>Object.fromEntries(s.required.map(k=>[k,Object.hasOwn(constants,k)?clone(constants[k]):children[k].decode(x[k])]))};
  }
  if(s.type==='array'){const c=node(s.items);return {schema:{...clone(s),items:c.schema},fixed:c.fixed,encode:x=>x.map(c.encode),decode:x=>x.map(c.decode)}}
  return {schema:clone(s),encode:clone,decode:clone,fixed:0};
 }

const labels = s => {
 const p=s.properties, f=k=>fixed(p[k]||{}).value;
 if(f('version')==='ask-catalog-intent.v1')return 'catalog';
 if(p.calculatePlan?.type==='object'){
  if(f('evidenceBasis')==='supplied_context')return 'calculate_supplied_context';
  const cs=p.calculatePlan.properties.calculations;
  return cs.type==='array'&&cs.items?.anyOf?.every(x=>x.properties?.operator?.enum?.every(v=>v==='count_records'))?'count_saved_records':'calculate_saved_history';
 }
 if(p.storedRead?.type==='object'){const sp=p.storedRead.properties;return 'read_'+fixed(sp.domain).value+'_'+fixed(sp.scope).value}
 if(f('evidenceBasis')==='saved_profile')return 'read_saved_profile';
 if(f('evidenceBasis')==='supplied_context')return 'use_supplied_context';
 if(f('mode')==='update'){
  if(p.lifecyclePlan?.type==='object')return 'change_lifecycle';
  if(p.stateTransitionJob?.type==='object')return 'change_concern_state';
  if(p.fieldMutationJob?.anyOf)return 'change_profile_field';
  if(p.removeJob?.anyOf)return 'remove_saved_record';
 }
 if(p.mode?.enum?.length===5&&p.evidenceBasis?.enum?.includes('saved_history'))return p.readTicket?.anyOf?.every(x=>x.type==='object'&&fixed(x.properties?.outputs?.properties?.strategy||{}).value==='chronological')?'chronological_history_request':'ordinary_request';
 fail('UNKNOWN_BRANCH_SHAPE');
};

 const originals=root.properties?.request?.anyOf;if(!Array.isArray(originals))fail('BRANCH_CONTRACT');
 const leaves=s=>s.anyOf?s.anyOf.flatMap(leaves):[s];
 for(let i=0;i<originals.length;i++)for(const source of leaves(originals[i])){
  const family=labels(source);let branches=[clone(source)];
  // These are explicit finite semantic selections, not inferred from the question.
  if(family==='ordinary_request'||family==='chronological_history_request')for(const key of ['mode','evidenceBasis']){
   branches=branches.flatMap(b=>{const values=b.properties[key].enum;if(!values?.length)fail('ENUM_CONTRACT');return values.map(value=>({...clone(b),properties:{...clone(b.properties),[key]:{...clone(b.properties[key]),enum:[value]}}}))});
  }
  for(let b of branches){
   // Read declarations cannot smuggle discarded write intent. Binder lines 572-618 and 652-654;
   // saved-history typed ticket and probe authority: lines 592-599 and 1112-1121.
   if((family==='ordinary_request'||family==='chronological_history_request')&&fixed(b.properties.mode).value==='read'){
    const fields=Object.fromEntries(['appendJob','writeJob','task','frame','mutationIntent'].map(k=>[k,{type:'null'}]));
    fields.readTicket={type:fixed(b.properties.evidenceBasis).value==='saved_history'?'object':'null'};
    if(fixed(b.properties.evidenceBasis).value==='saved_history')fields.evidenceNeeds={type:'array',maxItems:0};
    b=restrict(b,{fields});if(!b)continue;
   }
   let kind=family;
   if(family==='catalog'){const p=fixed(b.properties.purpose),sc=fixed(b.properties.scope);if(!p.yes||!sc.yes)fail('CATALOG_CONTRACT');kind='catalog_'+p.value+'_'+sc.value;if(p.value==='lifecycle')kind+=b.properties.subjects.maxItems===0?'_unqualified_cancellation':'_subjects'}
   if(family==='ordinary_request'||family==='chronological_history_request')kind=[fixed(b.properties.mode).value,fixed(b.properties.evidenceBasis).value??'unspecified_evidence',family==='chronological_history_request'?'chronological':'ordinary'].join('_');
   const n=node(b);if(Object.hasOwn(n.schema.properties,'kind'))fail('RESERVED_FIELD');
   const schema={...n.schema,properties:{kind:{type:'string',enum:[kind]},...n.schema.properties},required:['kind',...n.schema.required]};
   entries.push({canonicalBranch:i,kind,source:b,node:n,schema,omittedConstants:n.fixed});
  }
 }
 // Distributivity: identical payload schemas share one object; the explicit tag enum retains every semantic choice.
 const groups=new Map();
 for(const e of entries){const payload=clone(e.schema);delete payload.properties.kind;const key=stable(payload);if(!groups.has(key))groups.set(key,{payload,kinds:[]});groups.get(key).kinds.push(e.kind);}
 const alternatives=[...groups.values()].map(g=>({...g.payload,properties:{kind:{type:'string',enum:g.kinds},...g.payload.properties}}));
 const schema={...clone(root),properties:{request:{anyOf:alternatives}}},wv=makeValidator(schema);
 const decode=w=>{
  if(!wv(schema,w)){
   const selected=entries.find(e=>e.kind===w?.request?.kind);
   const diagnosticSchema=selected?{...schema,properties:{request:selected.schema}}:schema;
   const error=canonicalSchemaError(diagnosticSchema,w,wv);error.message='ASK_OPERATION_WIRE_SCHEMA';throw error;
  }
  const results=[];
  for(const e of entries)if(e.kind===w.request.kind&&wv(e.schema,w.request)){
   const c={request:e.node.decode(w.request)};if(!valid(e.source,c.request)||!valid(root,c))fail('INVERSE');
   if(!results.some(x=>stable(x)===stable(c)))results.push(c);
  }
  if(results.length!==1)fail('AMBIGUOUS_MEANING');
  return results[0];
 };
 const encodeAll=c=>{
  if(!valid(root,c))fail('CANONICAL_SCHEMA');
  return entries.filter(e=>valid(e.source,c.request)).map(e=>{const w={request:{kind:e.kind,...e.node.encode(c.request)}};if(stable(decode(w))!==stable(c))fail('ROUNDTRIP');return w});
 };
 const encode=c=>{const all=encodeAll(c);if(!all.length)fail('NO_BRANCH');return all[0]}; // selection between encodings of identical canonical value only
 if(new Set(entries.map(e=>e.kind)).size!==entries.length)fail('DUPLICATE_KIND:'+entries.filter((e,i)=>entries.findIndex(x=>x.kind===e.kind)!==i).map(e=>e.canonicalBranch+':'+e.kind).join(','));
 return {schema,entries,decode,encode,encodeAll};
}
