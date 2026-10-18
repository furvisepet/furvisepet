import assert from 'node:assert/strict';
import {makeValidator} from './ask-wire-codec.mjs';
const clone=x=>structuredClone(x),stable=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const types=s=>Array.isArray(s?.type)?s.type:[s?.type];
export function deriveReadTicketFamilies(source){
 const valid=makeValidator(source),result=[];
 const at=(s,path)=>path.reduce((n,k)=>n?.properties?.[k],s);
 const put=(s,path,value)=>{const parent=at(s,path.slice(0,-1));assert(parent?.properties);parent.properties[path.at(-1)]=value;};
 function fixed(s,path,value){
  const old=at(s,path);if(!old)return value===null;
  if(!valid(old,value))return false;
  put(s,path,{...clone(old),type:value===null?'null':typeof value,enum:[value]});return true;
 }
 function empty(s,path){
  const old=at(s,path);if(!old)return true;
  const nil=valid(old,null),zero=valid(old,[]);if(!nil&&!zero)return false;
  if(!zero)return fixed(s,path,null);
  assert(types(old).every(t=>['array','null'].includes(t)));
  put(s,path,{...clone(old),type:nil?['array','null']:'array',maxItems:0});return true;
 }
 function nonnull(s,type){
  if(!types(s).includes(type))return null;
  const out={...clone(s),type};
  if(out.enum&&!out.enum.some(v=>v!==null&&(type==='array'?Array.isArray(v):typeof v===type)))return null;
  return out;
 }
 function ordinaryName(s){
  const p=s.properties,t=p.temporal.properties,o=p.outputs.properties;
  const selected=p.selection&&types(p.selection).includes('object')&&!valid(p.selection,null);
  const anchor=types(t.anchor).includes('object')&&!valid(t.anchor,null);
  if(p.authority.enum?.join()==='stored_report')return(anchor?'event_relative_saved_reports':p.attributedContexts?'primary_with_separately_requested_later_reports':'primary_saved_reports')+(selected?'_ordered_selection':'');
  if(o.strategy?.enum?.length===1&&o.strategy.enum[0]==='chronological')return(anchor?'event_relative_':'')+'legacy_chronological_records';
  if(selected)return(anchor?'event_relative_':'')+'ordered_records';
  if(anchor)return'event_relative_records';
  if(t.calendar?.enum?.length===1&&t.calendar.enum[0]==='oldest_year')return'oldest_calendar_year_records';
  return'ordinary_records';
 }
 const add=(s,family,proof)=>result.push({source:s,family,proof});
 const p=source.properties;
 assert(p.operation.enum?.every(x=>['read','read_since_event','compare','rank'].includes(x)));
 // Nonempty probe clauses form homogeneous advisory or independent-selection arrays.
 if((p.probes.maxItems??Infinity)>0&&(p.probes.minItems??0)>=1){
  if(valid(p.probes,null)){const s=clone(source);assert(fixed(s,['probes'],null));add(s,'ordinary_records','null probes preserve exact original null; no need is introduced');}
  const array=nonnull(p.probes,'array');assert(array);
  const items=p.probes.items.anyOf??[p.probes.items],advisory=[],selected=[];
  for(const item of items){
   assert(types(item).includes('object')&&item.additionalProperties===false);
   const choice=item.properties?.selection;
   if(!choice)advisory.push(clone(item));
   else{
    if(valid(choice,null)){const a=clone(item);assert(fixed(a,['selection'],null));advisory.push(a);}
    const sel=nonnull(choice,'object');
    if(sel){
     const a=clone(item);a.properties.selection=sel;
     const predicates=nonnull(a.properties.predicates,'array');assert(predicates,'selected probes require typed predicate arrays');a.properties.predicates=predicates;selected.push(a);
    }
   }
  }
  for(const[k,list]of[['advisory',advisory],['selected',selected]]){
   if(!list.length)continue;const s=clone(source);
   s.properties.probes={...array,items:list.length===1?list[0]:{anyOf:list}};
   if(k==='selected'){
    if(!fixed(s,['operation'],'read')||!fixed(s,['temporal','from'],null)||!fixed(s,['temporal','to'],null)||!fixed(s,['temporal','anchor'],null))continue;
   }
   add(s,k==='selected'?'independent_probe_selections':'grounded_clause_probes','read-ticket.ts179-193: a selected need requires every need selected with predicates and owns its own window; mixed arrays excluded');
  }
  assert(result.length);return result;
 }
 // Ordinary records exclude episodes. Calendar selectors are explicit family choices.
 if(!p.episode||valid(p.episode,null)){
  const ordinary=clone(source);assert(fixed(ordinary,['episode'],null));
  const calendar=ordinary.properties.temporal.properties.calendar;
  if(calendar?.enum?.includes('oldest_year')&&valid(calendar,null)){
   for(const value of [null,'oldest_year']){const s=clone(ordinary);assert(fixed(s,['temporal','calendar'],value));add(s,ordinaryName(s),'partition nullable calendar by its exact enum; ordinary episode is exactly null');}
  }else add(ordinary,ordinaryName(ordinary),'ordinary episode is exactly null; every other source constraint preserved');
 }
 // Episode count/membership inherit EVERY original application-owned static rule.
 const ep=p.episode&&nonnull(p.episode,'object');
 if(ep){
  const s=clone(source);s.properties.episode=ep;
  const possible=fixed(s,['authority'],'effective_fact')&&fixed(s,['operation'],'read')
   &&fixed(s,['temporal','anchor'],null)&&fixed(s,['temporal','calendar'],null)&&fixed(s,['selection'],null)
   &&empty(s,['predicates'])&&empty(s,['searchHints'])&&empty(s,['probes'])
   &&fixed(s,['outputs','strategy'],null)&&fixed(s,['outputs','limit'],null);
  if(possible){
   assert(ep.properties.operation.enum?.every(x=>['count','membership'].includes(x)));
   for(const operation of ep.properties.operation.enum){
    const e=clone(s);assert(fixed(e,['episode','operation'],operation));
    if(operation==='count'){
     const ref=e.properties.episode.properties.referent;
     if(types(ref).includes('object')){
      const okay=fixed(e,['episode','referent','basis'],'scoped_register')&&fixed(e,['episode','referent','ordinal'],null);
      if(!okay&&!fixed(e,['episode','referent'],null))continue;
     }
    }
    add(e,'episode_'+operation,'read-ticket.ts159-176,184-196: read only; no calendar/predicates/hints/strategy/limit/probes/selection; count referent scoped_register and null ordinal; null referent remains clarification-capable');
   }
  }
 }
 assert(result.length,'no legal read-ticket family; original application contract must be reviewed');
 return result;
}
export function mergeTicketPayloadSchemas(variants){
 const groups=new Map();
 for(const v of variants){
  const shape=clone(v.schema);assert(shape.type==='object'&&shape.additionalProperties===false&&shape.required.includes('ticketBranch'));
  assert.deepEqual(shape.properties.ticketBranch.enum,[v.tag]);delete shape.properties.ticketBranch.enum;
  const key=stable(shape);if(!groups.has(key))groups.set(key,{shape,members:[]});groups.get(key).members.push(v);
 }
 const schemas=[],certificate=[];
 for(const{shape,members}of groups.values()){
  const tags=members.map(v=>v.tag);assert.equal(new Set(tags).size,tags.length);
  for(const v of members){const check=clone(v.schema);delete check.properties.ticketBranch.enum;assert.deepEqual(check,shape);}
  const schema=clone(shape);schema.properties.ticketBranch.enum=tags;schemas.push(schema);
  certificate.push({tags,identicalApplicablePayload:true,proof:'Strict required discriminator; all other constraints identical. Widening only its enum equals the exact union of singleton-tag objects. Codec selects the unique original canonical value by explicit tag.'});
 }
 return{schema:schemas.length===1?schemas[0]:{anyOf:schemas},certificate};
}
export function flattenPureSchemaUnions(root){
 function walk(s){
  const o=clone(s);
  for(const key of['properties','$defs'])if(s[key])o[key]=Object.fromEntries(Object.entries(s[key]).map(([k,v])=>[k,walk(v)]));
  if(s.items)o.items=walk(s.items);
  if(s.anyOf)o.anyOf=s.anyOf.map(walk).flatMap(x=>Object.keys(x).length===1&&x.anyOf?x.anyOf:[x]);
  return o;
 }return walk(root);
}
