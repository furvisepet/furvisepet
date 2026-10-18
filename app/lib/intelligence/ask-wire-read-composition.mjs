import assert from 'node:assert/strict';
import {expand,makeValidator} from './ask-wire-codec.mjs';
import {exactShare} from './ask-wire-exact-sharing.mjs';
const clone=x=>structuredClone(x),stable=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const fields=['profileFields','projection','recordSelection'],defaults={profileFields:[],projection:null,recordSelection:null};
export const READ_COMPOSITION_LEGEND="resultContract chooses the requested read operation: read_recorded_statements reads what sources report, without certifying settled truth; read_settled_facts requests current/corrected factual authority. Each carries only its applicable typed readTicket. composed_read retains explicitly requested profileFields/projection/legacy recordSelection companions and their typed ticket. Recorded-statement contents do not require a request for verbatim quotation. Ticket predicates filter factual content, not storage labels or dates already in temporal bounds. Never change a requested operation to pass validation.";
export function compileReadCompositionTransport(original,ticketMeanings=new Map()){
 const source=expand(original),valid=makeValidator(source),entries=[];
 function compile(s,path){
  const p=s.properties;
  if(s.type==='object'&&p?.kind?.enum?.every(k=>['read_saved_history_ordinary','read_saved_history_chronological'].includes(k))&&p.kind.enum.length&&fields.every(k=>p[k])){
   assert(s.additionalProperties===false&&s.required.length===Object.keys(p).length);
   for(const k of fields)assert(valid(p[k],defaults[k]),'DEFAULT_NOT_LEGAL:'+k);

   assert(p.readTicket,'READ_TICKET_REQUIRED');
   const arms=p.readTicket.anyOf??[p.readTicket],aliases=new Map(),reverse=new Map();
   function pick(authority){
    const selected=[];
    for(const arm of arms){
     const tags=arm.properties?.ticketBranch?.enum;assert(tags?.length,'EXPLICIT_TICKET_TAG_REQUIRED');
     const selectedTags=tags.filter(t=>ticketMeanings.get(t)===authority);if(!selectedTags.length)continue;
     const aliasTags=selectedTags.map(t=>{const a=t;const key=authority+':'+a;assert(!reverse.has(key)||reverse.get(key)===t,'TICKET_ALIAS_COLLISION');aliases.set(t,a);reverse.set(key,t);return a;});
     selected.push({...clone(arm),properties:{...clone(arm.properties),ticketBranch:{...clone(arm.properties.ticketBranch),enum:aliasTags}}});
    }
    return selected.length===1?selected[0]:selected.length?{anyOf:selected}:null;
   }
   const obj=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
   const operations=new Map([['read_recorded_statements','stored_report'],['read_settled_facts','effective_fact']]);
   const plain=[...operations].flatMap(([operation,authority])=>{const ticket=pick(authority);return ticket?[obj({operation:{type:'string',enum:[operation]},readTicket:ticket})]:[];});
   assert(plain.length);
   for(const arm of arms)for(const tag of arm.properties.ticketBranch.enum)assert(['stored_report','effective_fact'].includes(ticketMeanings.get(tag)),'UNPROVED_TICKET_MEANING');
   const composed=obj({operation:{type:'string',enum:['composed_read']},readTicket:clone(p.readTicket),...Object.fromEntries(fields.map(k=>[k,clone(p[k])]))});
   const properties={kind:clone(p.kind),...Object.fromEntries(Object.entries(p).filter(([k])=>!fields.includes(k)&&!['readTicket','kind'].includes(k)))};
   assert(!Object.hasOwn(properties,'resultContract'),'RESERVED_FIELD');
   const ordered={kind:properties.kind,resultContract:{anyOf:[...plain,composed]},...Object.fromEntries(Object.entries(properties).filter(([k])=>k!=='kind'))};
   const schema={...clone(s),properties:ordered,required:['kind','resultContract',...s.required.filter(k=>!fields.includes(k)&&!['readTicket','kind'].includes(k))]},wv=makeValidator(schema);
   const encode=x=>{
    assert(valid(s,x),'COMPOSITION_SOURCE');
    const only=fields.every(k=>stable(x[k])===stable(defaults[k])),tag=x.readTicket.ticketBranch,authority=ticketMeanings.get(tag);
    const resultContract=only?{operation:authority==='stored_report'?'read_recorded_statements':'read_settled_facts',readTicket:{...clone(x.readTicket),ticketBranch:aliases.get(tag)}}:{operation:'composed_read',readTicket:clone(x.readTicket),...Object.fromEntries(fields.map(k=>[k,clone(x[k])]))};
    const y={...Object.fromEntries(Object.entries(x).filter(([k])=>!fields.includes(k)&&k!=='readTicket')),resultContract};assert(wv(schema,y),'COMPOSITION_WIRE');return y;
   };
   const decode=x=>{
    assert(wv(schema,x),'COMPOSITION_WIRE');const {resultContract,...rest}=x,plain=operations.has(resultContract.operation),args=plain?defaults:resultContract;
    const ticket=clone(resultContract.readTicket);
    if(plain){const tag=reverse.get(operations.get(resultContract.operation)+':'+ticket.ticketBranch);assert(tag,'UNKNOWN_EXPLICIT_TICKET');ticket.ticketBranch=tag;}
    const y={...rest,...Object.fromEntries(fields.map(k=>[k,clone(args[k])])),readTicket:ticket};assert(valid(s,y),'COMPOSITION_INVERSE');return y;
   };
   entries.push({path,source:s,schema,encode,decode,defaults:clone(defaults),proof:'Strict tagged sum; Each explicit no-companion read operation supplies exactly the three individually proved legal companion constants; its ticket authority follows the explicit operation-filtered typed tag, never question inference. composed_read preserves all original field domains and every correlation already in the source object. Empty composition and records_only are equivalent canonical values; decoding uses the explicit tag, never first-match or question inference.'});
   return{schema,encode,decode};
  }
  if(s.anyOf){
   const cs=s.anyOf.map((a,i)=>compile(a,path+'.anyOf.'+i)),schema={...clone(s),anyOf:cs.map(c=>c.schema)},wv=makeValidator(schema);
   function map(x,dir){
    const results=[];
    for(let i=0;i<cs.length;i++){const ss=dir==='encode'?s.anyOf[i]:cs[i].schema;if(!(dir==='encode'?valid:wv)(ss,x))continue;
     const y=cs[i][dir](x);if(!results.some(z=>stable(z)===stable(y)))results.push(y);
    }
    if(!results.length)throw Error('READ_COMPOSITION_NO_ALTERNATIVE');
    if(dir==='decode'){assert(results.length===1,'READ_COMPOSITION_AMBIGUOUS');return results[0];}
    for(const y of results)assert(stable(map(y,'decode'))===stable(x),'READ_COMPOSITION_IMAGE');
    return results.sort((a,b)=>stable(a).localeCompare(stable(b)))[0];
   }return{schema,encode:x=>map(x,'encode'),decode:x=>map(x,'decode')};
  }
  if(s.type==='object'){
   const cs=Object.fromEntries(Object.entries(p??{}).map(([k,v])=>[k,compile(v,path+'.'+k)]));
   const schema={...clone(s),properties:Object.fromEntries(Object.entries(cs).map(([k,c])=>[k,c.schema]))};
   const map=(x,d)=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,cs[k]?cs[k][d](v):clone(v)]));
   return{schema,encode:x=>map(x,'encode'),decode:x=>map(x,'decode')};
  }
  if(s.type==='array'){const c=compile(s.items,path+'.items');return{schema:{...clone(s),items:c.schema},encode:x=>x.map(v=>c.encode(v)),decode:x=>x.map(v=>c.decode(v))};}
  return{schema:clone(s),encode:clone,decode:clone};
 }
 const n=compile(source,'root'),schema=exactShare(n.schema),wv=makeValidator(n.schema);
 return{schema,entries,encode(x){assert(valid(source,x),'READ_COMPOSITION_SOURCE');const y=n.encode(x);assert(wv(n.schema,y),'READ_COMPOSITION_WIRE');return y;},decode(x){assert(wv(n.schema,x),'READ_COMPOSITION_WIRE');const y=n.decode(x);assert(valid(source,y),'READ_COMPOSITION_SOURCE');return y;}};
}
