import assert from 'node:assert/strict';
import {expand,makeValidator} from './ask-wire-codec.mjs';
import {exactShare} from './ask-wire-exact-sharing.mjs';

const clone=x=>structuredClone(x),stable=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const SUBJECT_STATE_WIRE_LEGEND="subjectStateRequirement choices: none — No requested active-state precondition. Historical saved-record lookup alone does not request current active status. active_subjects — An explicitly requested active-subject restriction or necessary living-care precondition, never inferred merely from saved profile state. No transition or cancellation is requested.";
export function compileSubjectStateTransport(original){
 const source=expand(original),valid=makeValidator(source),entries=[];
 const only=(s,x)=>{if(x===null)return s.type==='null'||s.enum?.length===1&&s.enum[0]===null;return s.enum?.length===1&&s.enum[0]===x;};
 function requirement(s){
  if(!s.anyOf||s.anyOf.length!==2)return null;
  const none=s.anyOf.filter(x=>only(x,null)),some=s.anyOf.filter(x=>x.type==='object');
  if(none.length!==1||some.length!==1)return null;
  const a=some[0],p=a.properties??{};
  if(a.additionalProperties!==false||stable([...a.required].sort())!==stable(['authorizationQuote','pendingDisposition','requiredSubjectState','transition'])
   ||stable(Object.keys(p).sort())!==stable([...a.required].sort())||!only(p.pendingDisposition,'keep')||!only(p.transition,null)||!only(p.requiredSubjectState,'active'))return null;
  return p.authorizationQuote;
 }
 function compile(s,path){
  const quote=requirement(s);
  if(quote){
   const schema={anyOf:[
    {type:'object',additionalProperties:false,required:['stateRequirement'],properties:{stateRequirement:{type:'string',enum:['none']}}},
    {type:'object',additionalProperties:false,required:['stateRequirement','sourceQuote'],properties:{stateRequirement:{type:'string',enum:['active_subjects']},sourceQuote:clone(quote)}}
   ]};
   const decode=x=>x.stateRequirement==='none'?null:{pendingDisposition:'keep',transition:null,requiredSubjectState:'active',authorizationQuote:clone(x.sourceQuote)};
   const encode=x=>x===null?{stateRequirement:'none'}:{stateRequirement:'active_subjects',sourceQuote:clone(x.authorizationQuote)};
   entries.push({path,source:s,schema});return{schema,encode,decode,requirement:true};
  }
  if(s.anyOf){
   const children=s.anyOf.map((v,i)=>compile(v,path+'/anyOf/'+i)),schema={...clone(s),anyOf:children.map(c=>c.schema)};
   function translate(x,d){
    const results=[];for(let i=0;i<children.length;i++){
     if(!valid(d==='encode'?s.anyOf[i]:children[i].schema,x))continue;
     const y=children[i][d](x);if(!results.some(z=>stable(z)===stable(y)))results.push(y);
    }
    if(d==='encode'&&results.length>1){
     for(const image of results)assert.deepEqual(translate(image,'decode'),x,'subject-state aliases must preserve exact canonical meaning');
     return results.sort((a,b)=>stable(a)<stable(b)?-1:stable(a)>stable(b)?1:0)[0];
    }
    assert.equal(results.length,1,'subject-state union ambiguity');return results[0];
   }return{schema,encode:x=>translate(x,'encode'),decode:x=>translate(x,'decode')};
  }
  const props=s.properties?Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,compile(v,path+'/properties/'+k)])):null,item=s.items?compile(s.items,path+'/items'):null;
  const names=props?Object.fromEntries(Object.entries(props).map(([k,c])=>[k,k==='lifecyclePlan'&&c.requirement?'subjectStateRequirement':k])):null;
  if(names)assert.equal(new Set(Object.values(names)).size,Object.keys(names).length,'subject-state name collision');
  const schema={...clone(s),...(props?{properties:Object.fromEntries(Object.entries(props).map(([k,c])=>[names[k],c.schema])),required:s.required.map(k=>names[k])}:{}),...(item?{items:item.schema}:{})};
  function translate(x,d){
   if(x===null)return null;if(Array.isArray(x))return x.map(v=>item[d](v));
   if(typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>{
    const canonicalKey=d==='encode'?k:Object.keys(names).find(n=>names[n]===k);assert(props?.[canonicalKey],'unknown semantic field');
    return[d==='encode'?names[k]:canonicalKey,props[canonicalKey][d](v)];
   }));return clone(x);
  }
  return{schema,encode:x=>translate(x,'encode'),decode:x=>translate(x,'decode')};
 }
 const n=compile(source,'schema'),schema=exactShare(n.schema);
 const decode=x=>{assert(valid(n.schema,x),'subject-state wire schema');const y=n.decode(x);assert(valid(source,y),'subject-state original schema');return y;};
 const encode=x=>{assert(valid(source,x),'subject-state original schema');const y=n.encode(x);assert.deepEqual(decode(y),x);return y;};
 return{schema,source,entries,encode,decode};
}
