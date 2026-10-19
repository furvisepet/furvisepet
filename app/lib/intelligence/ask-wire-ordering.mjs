import assert from 'node:assert/strict';
import {expand,makeValidator} from './ask-wire-codec.mjs';
import {exactShare} from './ask-wire-exact-sharing.mjs';
import {inlineSingleSchemaReferences} from './ask-wire-read-ticket.mjs';
const clone=x=>structuredClone(x),stable=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
/** Finite ordering records are explicit typed enum choices, never serialized JSON. */
export function compileOrderingTransport(original){
 const source=expand(original),valid=makeValidator(source),entries=[];
 function compile(s,path){
  if(s.type==='object'&&s.additionalProperties===false&&stable([...s.required].sort())===stable(['direction','field'])
    &&stable(Object.keys(s.properties).sort())===stable(['direction','field'])
    &&s.properties.field.type==='string'&&s.properties.direction.type==='string'
    &&Array.isArray(s.properties.field.enum)&&Array.isArray(s.properties.direction.enum)){
   const byTag=new Map(),byValue=new Map();
   for(const field of s.properties.field.enum)for(const direction of s.properties.direction.enum){
    const value={field,direction};if(!valid(s,value))continue;
    const tag=field+':'+direction;assert(!byTag.has(tag),'ordering tag collision');byTag.set(tag,value);byValue.set(stable(value),tag);
   }
   assert(byTag.size>0,'empty ordering domain');const schema={type:'string',enum:[...byTag.keys()],description:'Explicit ordering pair: canonical field name followed by colon and canonical direction.'};
   const entry={path,source:s,schema,pairs:[...byTag].map(([tag,value])=>({tag,value}))};entries.push(entry);
   return {schema,encode:x=>{assert(byValue.has(stable(x)),'ordering source');return byValue.get(stable(x));},decode:x=>{assert(byTag.has(x),'ordering wire');return clone(byTag.get(x));}};
  }
  if(s.anyOf){
   const children=s.anyOf.map((b,i)=>compile(b,path+'/anyOf/'+i)),schema={...clone(s),anyOf:children.map(c=>c.schema)};
   const translate=(x,direction)=>{
    const results=[];for(let i=0;i<children.length;i++){
     if(!valid(direction==='encode'?s.anyOf[i]:children[i].schema,x))continue;
     const y=children[i][direction](x);if(!results.some(z=>stable(z)===stable(y)))results.push(y);
    }assert.equal(results.length,1,'ordering union ambiguity');return results[0];
   };
   return {schema,encode:x=>translate(x,'encode'),decode:x=>translate(x,'decode')};
  }
  const props=s.properties?Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,compile(v,path+'/properties/'+k)])):null;
  const item=s.items?compile(s.items,path+'/items'):null;
  const schema={...clone(s),...(props?{properties:Object.fromEntries(Object.entries(props).map(([k,c])=>[k,c.schema]))}:{}),...(item?{items:item.schema}:{})};
  const translate=(x,direction)=>{
   if(x===null)return null;
   if(Array.isArray(x)){assert(item);return x.map(v=>item[direction](v));}
   if(typeof x==='object'){assert(props);return Object.fromEntries(Object.entries(x).map(([k,v])=>{assert(props[k]);return[k,props[k][direction](v)];}));}
   return clone(x);
  };
  return {schema,encode:x=>translate(x,'encode'),decode:x=>translate(x,'decode')};
 }
 const n=compile(source,'schema'),schema=inlineSingleSchemaReferences(exactShare(n.schema));
 const decode=x=>{assert(valid(n.schema,x),'ordering wire schema');const y=n.decode(x);assert(valid(source,y),'ordering source schema');return y;};
 const encode=x=>{assert(valid(source,x),'ordering source schema');const y=n.encode(x);assert.deepEqual(decode(y),x);return y;};
 return{schema,entries,source,encode,decode};
}
