import {calendarBoundaryToInstant,calendarDateInZone} from '../ask-time-zone.ts';
import {deriveReadTicketFamilies,mergeTicketPayloadSchemas,flattenPureSchemaUnions} from './ask-wire-read-families.mjs';
import assert from 'node:assert/strict';
import {expand,makeValidator} from './ask-wire-codec.mjs';
import {exactShare} from './ask-wire-exact-sharing.mjs';
const clone=structuredClone,stable=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function compileTicket(source,tag,timeZone=''){
 const valid=makeValidator(source);let constants=0,contentChoices=0;
 function singleton(s){
  let yes=false,value;
  if(s.enum?.length===1){yes=true;value=clone(s.enum[0]);}
  else if(s.type==='null'){yes=true;value=null;}
  else if(s.type==='array'&&s.maxItems===0&&(s.minItems??0)===0){yes=true;value=[];}
  else if(s.type==='array'&&Number.isSafeInteger(s.minItems)&&s.minItems>=0&&s.minItems===s.maxItems&&s.minItems<=1000){
   const item=singleton(s.items);if(item.yes){const candidate=Array.from({length:s.minItems},()=>clone(item.value));if(valid(s,candidate)){yes=true;value=candidate;}}
  }
  else if(s.anyOf){const a=s.anyOf.map(singleton);if(a.length&&a.every(x=>x.yes&&stable(x.value)===stable(a[0].value))){yes=true;value=a[0].value;}}
  else if(s.type==='object'&&s.additionalProperties===false&&stable([...s.required].sort())===stable(Object.keys(s.properties).sort())){
   const a=Object.entries(s.properties).map(([k,v])=>[k,singleton(v)]);
   if(a.every(([,p])=>p.yes)){yes=true;value=Object.fromEntries(a.map(([k,p])=>[k,p.value]));}
  }
  if(yes)assert(valid(s,value),'singleton proof');
  return {yes,value};
 }
 function node(s,path=[]){
  // This choice describes record CONTENT, not record type, access scope or completeness.
  // Empty/nonempty arrays are disjoint and cover the exact original predicate domain.
  if(path.length===1&&path[0]==='predicates'&&s.type==='array'
    &&(s.minItems??0)===0&&(s.maxItems===undefined||s.maxItems>0)){
   const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
   const tag=value=>({type:'string',enum:[value]});
   const schema={anyOf:[
    object({kind:tag('unrestricted_record_content')}),
    object({kind:tag('match_record_content'),conditions:{...clone(s),minItems:1}})
   ]};
   contentChoices++;
   return{schema,encode:x=>x.length?{kind:'match_record_content',conditions:clone(x)}:{kind:'unrestricted_record_content'},
    decode:x=>x.kind==='unrestricted_record_content'?[]:clone(x.conditions)};
  }

  if(path.length===1&&path[0]==='temporal'&&s.type==='object'&&s.properties?.from&&s.properties?.to
   &&valid(s.properties.from,'2026-01-01T00:00:00.000Z')&&valid(s.properties.to,'2026-01-02T00:00:00.000Z')){
   const rest={...clone(s),properties:Object.fromEntries(Object.entries(s.properties).filter(([k])=>!['from','to'].includes(k))),required:s.required.filter(k=>!['from','to'].includes(k))},base=node(rest,path);
   const obj=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
   const day={type:['string','null'],pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',minLength:10,maxLength:10};
   const instant=obj({kind:{type:'string',enum:['exact_instants']},from:clone(s.properties.from),to:clone(s.properties.to)});
   const calendar=obj({kind:{type:'string',enum:['local_calendar_days']},fromDay:day,toDayExclusive:clone(day)});
   const schema={...base.schema,properties:{...base.schema.properties,window:{anyOf:[instant,calendar]}},required:[...base.schema.required,'window']};
   const lower=day=>{
    if(day===null)return null;
    assert(typeof timeZone==='string'&&timeZone.length>0,'SERVER_TIME_ZONE_REQUIRED');
    assert(new Intl.DateTimeFormat('en',{timeZone}).resolvedOptions().timeZone,'INVALID_SERVER_TIME_ZONE');
    assert(typeof day==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day),'INVALID_CALENDAR_DAY');
    const midnight=day+'T00:00:00.000Z';assert(Number.isFinite(Date.parse(midnight))&&new Date(midnight).toISOString().slice(0,10)===day,'INVALID_CALENDAR_DAY');
    const instant=calendarBoundaryToInstant(midnight,timeZone);assert(calendarDateInZone(instant,timeZone)===day,'UNREPRESENTABLE_CALENDAR_DAY');return instant;
   };
   return{schema,encode:x=>{const {from,to,...rest}=x;return{...base.encode(rest),window:{kind:'exact_instants',from:clone(from),to:clone(to)}};},
    decode:x=>{const {window,...rest}=x;const interval=window.kind==='exact_instants'?{from:clone(window.from),to:clone(window.to)}:{from:lower(window.fromDay),to:lower(window.toDayExclusive)};return{...base.decode(rest),...interval};}};
  }
  if(s.anyOf||Array.isArray(s.type))return {schema:clone(s),encode:clone,decode:clone};
  if(s.type==='object'&&s.additionalProperties===false
    &&stable([...s.required].sort())===stable(['direction','field'])
    &&s.properties.field?.enum&&s.properties.direction?.enum)
   return {schema:clone(s),encode:clone,decode:clone}; // Preserve pair for the qualified ordering transport.
  if(s.type==='object'){
   assert.equal(s.additionalProperties,false);assert.deepEqual([...s.required].sort(),Object.keys(s.properties).sort());
   const fixed={},children={},properties={};
   for(const[k,v]of Object.entries(s.properties)){
    const p=singleton(v);
    if(p.yes){fixed[k]=p.value;constants++;}else{children[k]=node(v,[...path,k]);properties[k]=children[k].schema;}
   }
   const schema={...clone(s),properties,required:s.required.filter(k=>!Object.hasOwn(fixed,k))};
   return {schema,encode:x=>Object.fromEntries(schema.required.map(k=>[k,children[k].encode(x[k])])),
    decode:x=>Object.fromEntries(s.required.map(k=>[k,Object.hasOwn(fixed,k)?clone(fixed[k]):children[k].decode(x[k])]))};
  }
  if(s.type==='array'){const c=node(s.items,[...path,'items']);return {schema:{...clone(s),items:c.schema},encode:x=>x.map(v=>c.encode(v)),decode:x=>x.map(v=>c.decode(v))};}
  return {schema:clone(s),encode:clone,decode:clone};
 }
 const n=node(source),schema={...n.schema,properties:{ticketBranch:{type:'string',enum:[tag]},...n.schema.properties},required:['ticketBranch',...n.schema.required]},wv=makeValidator(schema);
 const decode=w=>{assert(wv(schema,w),'wire rejection');const c=n.decode(w);assert(valid(source,c),'original ticket schema');return c;};
 const encode=c=>{assert(valid(source,c),'canonical rejection');const w={ticketBranch:tag,...n.encode(c)};assert.deepEqual(decode(w),c);return w;};
 return {schema,decode,encode,constants,contentChoices};
}

export function compileReadTicketTransport(original,timeZone=''){
 const changed=clone(original),entries=new Map();
 for(const[key,s]of Object.entries(original.$defs??{})){
  if(!s.properties?.authority||!s.properties?.operation||!s.properties?.temporal||!s.properties?.probes)continue;
  const source=expand({...s,$defs:original.$defs}),index=entries.size+1,valid=makeValidator(source);
  const families=deriveReadTicketFamilies(source),variants=families.map((f,i)=>{
   const authority=f.source.properties.authority.enum.join('_'),tag=(authority==='stored_report'?'recorded_statements':authority==='effective_fact'?'settled_facts':authority)+'_'+f.family+'_v'+index+'_'+(i+1);
   return {...compileTicket(f.source,tag,timeZone),source:f.source,tag,family:f.family,proof:f.proof,accepts:makeValidator(f.source)};
  });
  const merged=mergeTicketPayloadSchemas(variants),wv=makeValidator(merged.schema),byTag=new Map(variants.map(v=>[v.tag,v]));
  assert.equal(byTag.size,variants.length);
  const decode=w=>{assert(wv(merged.schema,w),'read family wire schema');assert(byTag.has(w.ticketBranch),'unknown read family');const c=byTag.get(w.ticketBranch).decode(w);assert(valid(source,c),'original source ticket schema');return c;};
  const encode=c=>{assert(valid(source,c),'original source ticket schema');const matches=variants.filter(v=>v.accepts(v.source,c));assert.equal(matches.length,1,'canonical ticket violates static application relationships');const w=matches[0].encode(c);assert.deepEqual(decode(w),c);return w;};
  entries.set(key,{schema:merged.schema,source,variants,certificate:merged.certificate,decode,encode});
  changed.$defs[key]=merged.schema;
 }

 // Optional ticket absence is an explicit tag so every alternative remains a
 // discriminated object. This is a bijection with canonical null, not a default.
 const wireEntries=[...entries.values()].flatMap(e=>e.variants??[e]);
 assert.equal(new Set(wireEntries.map(e=>e.tag)).size,wireEntries.length,'read-ticket tags must identify unique alternatives');
 const noTicketTag='no_ticket',nullableUnions=new WeakSet(),nullableEntries=[];
 assert(!wireEntries.some(e=>e.tag===noTicketTag),'reserved null tag');
 const nullMemo=new Map();
 function nullOnly(s){
  if(nullMemo.has(s))return nullMemo.get(s);
  let proof=false;
  if(s.$ref)proof=nullOnly(original.$defs[s.$ref.slice(8)]);
  else if(s.type==='null'||Array.isArray(s.type)&&s.type.length===1&&s.type[0]==='null'
    ||s.enum?.length===1&&s.enum[0]===null)proof=true;
  else if(s.anyOf?.length)proof=s.anyOf.every(nullOnly);
  if(proof){
   const expandedNull=expand({type:'object',additionalProperties:false,required:['v'],properties:{v:s},$defs:original.$defs}).properties.v;
   proof=makeValidator(expandedNull)(expandedNull,null);
  }
  nullMemo.set(s,proof);return proof;
 }
 function nullable(s,w,path){
  if(s.$ref)return;
  if(s.anyOf){
   const flags=s.anyOf.map(a=>({none:nullOnly(a),ticket:!!a.$ref&&entries.has(a.$ref.slice(8))}));
   if(flags.some(f=>f.none)&&flags.some(f=>f.ticket)&&flags.every(f=>f.none||f.ticket)){
    nullableUnions.add(s);
    w.anyOf=w.anyOf.map((a,i)=>flags[i].none?{
     type:'object',additionalProperties:false,required:['ticketBranch'],
     properties:{ticketBranch:{type:'string',enum:[noTicketTag]}},
     description:'Explicit absence of an optional ReadTicket; reconstructs exactly canonical null, never a missing required read.'
    }:a);
    nullableEntries.push({path,source:s,wire:w,tag:noTicketTag,nullAlternatives:flags.filter(f=>f.none).length});
   }
   s.anyOf.forEach((a,i)=>{if(!nullOnly(a))nullable(a,w.anyOf[i],path+'/anyOf/'+i);});
  }
  for(const[k,v]of Object.entries(s.properties??{}))nullable(v,w.properties[k],path+'/properties/'+k);
  if(s.items)nullable(s.items,w.items,path+'/items');
 }
 nullable(original,changed,'schema');
 for(const[k,v]of Object.entries(original.$defs??{}))if(!entries.has(k))nullable(v,changed.$defs[k],'schema/$defs/'+k);
 const schema=inlineSingleSchemaReferences(exactShare(expand(simplifyNullSchemas(exactShare(flattenPureSchemaUnions(expand(changed)))).schema))),sourceExpanded=expand(original),wireExpanded=expand(changed);
 const sourceValid=makeValidator(sourceExpanded),wireValid=makeValidator(wireExpanded);
 // Decode validates the transformed branch, including inline nullable tickets.
 // Referenced-only expansion is insufficient when sharing decisions change.
 const wireNodes=new WeakMap();
 function pairSchema(s,w){
  if(!s||!w||typeof s!=='object'||typeof w!=='object')return;
  wireNodes.set(s,w);
  if(s.properties&&w.properties)for(const k of Object.keys(s.properties))pairSchema(s.properties[k],w.properties[k]);
  if(s.anyOf&&w.anyOf)s.anyOf.forEach((v,i)=>pairSchema(v,w.anyOf[i]));
  if(s.items&&w.items)pairSchema(s.items,w.items);
 }
 pairSchema(original,changed);
 for(const[k,s]of Object.entries(original.$defs??{}))pairSchema(s,changed.$defs[k]);
 const caches={encode:new Map(),decode:new Map()};
 function expanded(s,direction){
  const cache=caches[direction];if(!cache.has(s)){const value=direction==='encode'?s:wireNodes.get(s);assert(value,'wire schema correspondence');cache.set(s,expand({type:'object',additionalProperties:false,required:['value'],properties:{value},$defs:(direction==='encode'?original:changed).$defs}).properties.value);}return cache.get(s);
 }
 function walk(s,x,direction){
  if(s.$ref){const key=s.$ref.slice(8),entry=entries.get(key);if(entry)return entry[direction](x);return walk(original.$defs[key],x,direction);}
  if(s.anyOf){
   if(nullableUnions.has(s)){
    if(direction==='encode'&&x===null)return {ticketBranch:noTicketTag};
    if(direction==='decode'&&x!==null&&typeof x==='object'&&x.ticketBranch===noTicketTag)return null;
   }
   const results=[];
   for(const branch of s.anyOf){
    const bs=expanded(branch,direction),v=direction==='encode'?sourceValid:wireValid;
    if(!v(bs,x))continue;
    const y=walk(branch,x,direction);
    if(!results.some(z=>stable(z)===stable(y)))results.push(y);
   }
   if(direction==='encode'&&results.length>1){
    // Multiple wire representations are aliases only after every one proves
    // the SAME canonical value. Byte ordering never chooses a semantic meaning.
    for(const image of results)assert.deepEqual(walk(s,image,'decode'),x,'read-ticket encoding aliases must preserve exact canonical value');
    return results.slice().sort((a,b)=>stable(a)<stable(b)?-1:stable(a)>stable(b)?1:0)[0];
   }
   assert.equal(results.length,1,'read-ticket transport ambiguous union');
   return results[0];
  }
  if(x===null)return null;
  if(Array.isArray(x))return x.map(v=>walk(s.items,v,direction));
  if(typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,walk(s.properties[k],v,direction)]));
  return clone(x);
 }
 const decode=w=>{assert(wireValid(wireExpanded,w),'read-ticket wire schema');const c=walk(original,w,'decode');assert(sourceValid(sourceExpanded,c),'read-ticket source schema');return c;};
 const encode=c=>{assert(sourceValid(sourceExpanded,c),'read-ticket source schema');const w=walk(original,c,'encode');assert.deepEqual(decode(w),c);return w;};
 const meanings=[...new Set([...entries.values()].map(e=>e.source.properties.authority.description).filter(Boolean))];assert(meanings.length>0,'canonical proposition descriptions required');const legend='ReadTicket requested proposition (canonical contract): '+meanings.join(' ')+(wireEntries.some(e=>e.contentChoices>0)?" Record selection: match_record_content carries explicit conditions; source_ref selects supplied cited identities, while text_any independently filters title/body. unrestricted_record_content has none. text_any is OR across whole contiguous normalized title/note token sequences, with existing conservative inflection, not semantic or all-words search. Conditions AND. Preserve literal identifying spans without surrounding reference words. Typed measurement remains independent; units do not identify an attribute. Hints never constrain selection. No choice grants ownership, factual truth, writes or completion.":'');return {schema,entries,nullableEntries,encode,decode,legend};
}

export function simplifyNullSchemas(root){
 const out=clone(root),changes=[];
 function visit(s,path){
  if(!s||typeof s!=='object'||Array.isArray(s))return;
  const types=Array.isArray(s.type)?s.type:[s.type];
  if(!s.$ref&&types.includes('array')&&types.every(t=>['array','null'].includes(t))&&s.maxItems===0&&(s.minItems??0)===0&&s.items){
   const before=clone(s);s.items={type:'string'};
   if(stable(before)!==stable(s))changes.push({kind:'vacuous_empty_array_items',path,before,after:clone(s)});
  }
  // A schema whose explicit sole type is null has at most one accepted value.
  // Keep descriptions; remove only constraints proved inert for that value.
  if((s.type==='null'||s.enum?.length===1&&s.enum[0]===null)&&!s.$ref){
   const valid=makeValidator(expand({...s,$defs:root.$defs??{}}));
   if(valid(expand({...s,$defs:root.$defs??{}}),null)){
    const before=clone(s),after={type:'null',...(Object.hasOwn(s,'description')?{description:s.description}:{})};
    if(stable(before)!==stable(after)){
     for(const k of Object.keys(s))delete s[k];Object.assign(s,after);
     changes.push({path,before,after});
    }
    return;
   }
  }
  for(const k of ['$defs','properties'])for(const[n,v]of Object.entries(s[k]??{}))visit(v,path+'/'+k+'/'+n);
  if(s.items)visit(s.items,path+'/items');
  (s.anyOf??[]).forEach((v,i)=>visit(v,path+'/anyOf/'+i));
 }
 visit(out,'schema');return {schema:out,changes};
}


/** Storage-only cleanup: inline a definition with at most one physical reference. */
export function inlineSingleSchemaReferences(root){
 let out=clone(root),removed=0;
 while(true){
  const defs=out.$defs??{},counts=new Map();
  function count(s){
   if(!s||typeof s!=='object'||Array.isArray(s))return;
   if(s.$ref){assert.deepEqual(Object.keys(s),['$ref']);const k=s.$ref.slice(8);assert(s.$ref.startsWith('#/$defs/')&&Object.hasOwn(defs,k));counts.set(k,(counts.get(k)??0)+1);return;}
   for(const n of Object.values(s.properties??{}))count(n);
   for(const n of Object.values(s.$defs??{}))count(n);
   if(s.items)count(s.items);(s.anyOf??[]).forEach(count);
  }
  count(out);
  const singles=new Set(Object.keys(defs).filter(k=>(counts.get(k)??0)<=1));
  if(!singles.size)return out;
  function replace(s,trail=[]){
   if(!s||typeof s!=='object'||Array.isArray(s))return clone(s);
   if(s.$ref&&singles.has(s.$ref.slice(8))){const k=s.$ref.slice(8);assert(!trail.includes(k),'cyclic schema');return replace(defs[k],[...trail,k]);}
   const y=clone(s);
   if(s.properties)y.properties=Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,replace(v,trail)]));
   if(s.items)y.items=replace(s.items,trail);
   if(s.anyOf)y.anyOf=s.anyOf.map(v=>replace(v,trail));
   return y;
  }
  const body=clone(out);delete body.$defs;out=replace(body);
  out.$defs=Object.fromEntries(Object.entries(defs).filter(([k])=>!singles.has(k)).map(([k,v])=>[k,replace(v)]));
  removed+=singles.size;
 }
}

/** Provider serialization only: inline tagged ticket unions, prune unreachable defs.
 * A complete expanded-schema equality check preserves every accepted wire value.
 */
export function inlineTaggedTicketUnionReferences(root){
 const source=clone(root),defs=source.$defs??{};
 function resolve(s){
  const seen=new Set();
  while(s.$ref){
   assert.deepEqual(Object.keys(s),['$ref']);
   assert(s.$ref.startsWith('#/$defs/'));const key=s.$ref.slice(8);
   assert(Object.hasOwn(defs,key)&&!seen.has(key),'invalid or cyclic schema reference');
   seen.add(key);s=defs[key];
  }return s;
 }
 function tagged(s){
  s=resolve(s);if(!s.anyOf||s.anyOf.length<2)return false;
  for(const discriminator of ['ticketBranch','stateRequirement']){
   const tags=[];let complete=true;
   for(const arm of s.anyOf){
    const a=resolve(arm),tag=resolve(a.properties?.[discriminator]??{});
    if(a.type!=='object'||a.additionalProperties!==false||!a.required?.includes(discriminator)||tag.type!=='string'||!tag.enum?.length||!tag.enum.every(x=>typeof x==='string')){complete=false;break;}
    tags.push(...tag.enum);
   }
   if(complete&&tags.length>=s.anyOf.length&&new Set(tags).size===tags.length)return true;
  }return false;
 }
 function visit(s){
  if(s.$ref)return tagged(s)?visit(resolve(s)):clone(s);
  const out=clone(s);
  if(s.properties)out.properties=Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,visit(v)]));
  if(s.items)out.items=visit(s.items);
  if(s.anyOf)out.anyOf=s.anyOf.map(v=>visit(v));
  return out;
 }
 const body=clone(source);delete body.$defs;const out=visit(body);
 out.$defs=Object.fromEntries(Object.entries(defs).map(([k,v])=>[k,visit(v)]));
 const used=new Set();
 function references(s){
  if(s.$ref){
   const key=s.$ref.slice(8);assert(Object.hasOwn(out.$defs,key));
   if(!used.has(key)){used.add(key);references(out.$defs[key]);}return;
  }
  for(const v of Object.values(s.properties??{}))references(v);
  if(s.items)references(s.items);(s.anyOf??[]).forEach(references);
 }
 references(out);out.$defs=Object.fromEntries(Object.entries(out.$defs).filter(([k])=>used.has(k)));
 assert.deepEqual(expand(out),expand(root),'provider ticket-union normalization must preserve exact expanded schema');
 return out;
}
