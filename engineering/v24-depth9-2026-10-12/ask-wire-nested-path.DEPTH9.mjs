import { types as nodeTypes } from "node:util";
import {canonical,expand,makeValidator} from "./ask-wire-codec.mjs";
import {RECURSIVE_TRANSPORT_LIMITS} from "./ask-wire-recursive.mjs";
import {createStackAskWirePlan} from "./ask-wire-stack.mjs";
const reject = code => { throw Error("ASK_PATH_" + code); };
const ensure = (value, code) => { if (!value) reject(code); };
const objectPrototypeNames = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty",
 "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
function safeEnvironment() {
 if (Reflect.ownKeys(Object.prototype).some(k => !objectPrototypeNames.has(k))
  || Object.getOwnPropertyDescriptor(Array.prototype, "toJSON")
  || Reflect.ownKeys(Array.prototype).some(k => typeof k === "string" && /^(0|[1-9]\d*)$/.test(k))) reject("ENVIRONMENT");
}
function plainCopy(value, check) {
 ensure(typeof check === "function", "DEADLINE_REQUIRED");
 check(); safeEnvironment();
 const lim = RECURSIVE_TRANSPORT_LIMITS, seen = new WeakSet();
 let values = 0, containers = 0, chars = 0;
 const charge = n => { chars += n; ensure(chars <= lim.maxSerializedCharacters, "SERIALIZED_LIMIT"); };
 function walk(v, depth) {
  if (v !== null && typeof v === "object" && nodeTypes.isProxy(v)) reject("NON_JSON_TREE");
  check(); ensure(depth <= lim.maxDepth && ++values <= lim.maxValues, "RESOURCE_LIMIT");
  if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) {
   charge(JSON.stringify(v).length); return v;
  }
  if (typeof v === "string") {
   ensure(v.length <= lim.maxStringUnits, "STRING_LIMIT");
   charge(JSON.stringify(v).length); return v;
  }
  ensure(v !== null && typeof v === "object" && !seen.has(v), "NON_JSON_TREE"); seen.add(v);
  ensure(++containers <= lim.maxContainers, "RESOURCE_LIMIT");
  const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
  ensure(array ? proto === Array.prototype : proto === Object.prototype || proto === null, "PLAIN_CONTAINER");
  ensure(!Object.getOwnPropertyDescriptor(v, "toJSON"), "OWN_DATA_PROPERTY");
  let length = 0;
  if (array) {
   const d = Object.getOwnPropertyDescriptor(v, "length");
   ensure(d && Object.hasOwn(d, "value") && Number.isSafeInteger(d.value) && d.value >= 0, "ARRAY_SHAPE");
   length = d.value;
   ensure(length <= Math.min(lim.maxContainerEntries, lim.maxValues - values), "RESOURCE_LIMIT");
  }
  const keys = Reflect.ownKeys(v);
  ensure(keys.length <= lim.maxContainerEntries + (array ? 1 : 0), "RESOURCE_LIMIT");
  ensure(!array || keys.length === length + 1 && keys.every(k => k === "length" ||
   typeof k === "string" && /^(0|[1-9]\d*)$/.test(k) && Number(k) < length), "ARRAY_SHAPE");
  const result = array ? [] : Object.create(null);
  charge(2); let entries = 0;
  for (const k of keys) {
   check();
   if (array && k === "length") continue;
   ensure(typeof k === "string" && k.length <= lim.maxStringUnits, "OWN_DATA_PROPERTY");
   const d = Object.getOwnPropertyDescriptor(v, k);
   ensure(d && Object.hasOwn(d, "value") && d.enumerable, "OWN_DATA_PROPERTY");
   if (entries++) charge(1);
   if (!array) charge(JSON.stringify(k).length + 1);
   Object.defineProperty(result, k, { value: walk(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
  }
  return result;
 }
 const result = walk(value, 0); check(); return result;
}

const compare=(a,b)=>a<b?-1:a>b?1:0;
export function createNestedPathAskWirePlan(wire,check){
ensure(typeof check==="function","DEADLINE_REQUIRED");check();safeEnvironment();
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
function flatten(schema){check();let moves=0;function walk(n){check();if(!obj(n))return n;const y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,['properties','$defs'].includes(k)?Object.fromEntries(Object.entries(v).map(([a,b])=>[a,walk(b)])):k==='anyOf'?v.map(walk):k==='items'?walk(v):v]));if(y.properties){for(const [k,v]of Object.entries(y.properties)){if(v.type!=='object'||v.additionalProperties!==false||Object.keys(v).sort().join(',')!=='additionalProperties,properties,required,type'||canonical([...v.required].sort())!==canonical(Object.keys(v.properties).sort()))continue;const p=Object.fromEntries(Object.entries(v.properties).map(([a,b])=>[k+'/'+a,b])),before=JSON.stringify({[k]:v}).length+JSON.stringify(k).length,after=JSON.stringify(p).length+JSON.stringify(Object.keys(p)).length;if(after>=before)continue;delete y.properties[k];Object.assign(y.properties,p);y.required=y.required.flatMap(x=>x===k?Object.keys(p):[x]);moves++;}}
return y;}return{schema:walk(schema),moves};}
function restore(n){check();if(!obj(n))return n;const y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,k==='properties'?Object.fromEntries(Object.entries(v).map(([a,b])=>[a,restore(b)])):k==='anyOf'?v.map(restore):k==='items'?restore(v):v]));if(y.properties){const props={},required=[];for(const[k,v]of Object.entries(y.properties)){const seg=k.split('/');let cur=props;for(let i=0;i<seg.length-1;i++){const t=seg[i];if(!Object.hasOwn(cur,t))cur[t]={type:'object',additionalProperties:false,properties:{},required:[]};cur[t].required.push(seg[i+1]);cur=cur[t].properties;}if(Object.hasOwn(cur,seg.at(-1)))throw Error('COLLISION');cur[seg.at(-1)]=v;required.push(seg[0]);}const fix=n=>{if(n.properties){n.required=[...new Set(n.required)].sort();Object.values(n.properties).forEach(fix)}};y.properties=props;y.required=[...new Set(required)].sort();fix(y);}return y;}
function norm(n){check();return Array.isArray(n)?n.map(norm):obj(n)?Object.fromEntries(Object.entries(n).map(([k,v])=>[k,k==='required'?[...v].sort():norm(v)])):n}

function selective(input){check();let out=flatten(input).schema,moves=[];for(let iter=0;iter<64;iter++){let best=null;const before=JSON.stringify(out).length;for(const[name,def]of Object.entries(out.$defs||{})){if(def.type!=='object'||def.additionalProperties!==false)continue;const refs=JSON.stringify(out).split('"$ref":"#/$defs/'+name+'"').length-1;if(refs===0)continue;
function inline(n){check();if(Array.isArray(n))return n.map(inline);if(!obj(n))return n;if(n.$ref==='#/$defs/'+name)return structuredClone(def);return Object.fromEntries(Object.entries(n).map(([k,v])=>[k,inline(v)]));}
const src=inline(out);delete src.$defs[name];const cand=flatten(src).schema,after=JSON.stringify(cand).length;if(after<before&&(!best||after<best.after))best={name,after,cand,refs};}
if(!best)break;moves.push({name:best.name,saving:before-best.after,refs:best.refs});out=best.cand;}
return{schema:out,moves};}

function single(n){check();if(!obj(n))return n;const y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,['properties','$defs'].includes(k)?Object.fromEntries(Object.entries(v).map(([a,b])=>[a,single(b)])):k==='anyOf'?v.map(single):k==='items'?single(v):v]));if(y.type==='array'&&y.minItems===1&&y.maxItems===1&&Object.keys(y).sort().join(',')==='items,maxItems,minItems,type')return{type:'object',additionalProperties:false,properties:{'0':y.items},required:['0']};return y;}
function unsingle(n){check();if(Array.isArray(n))return n.map(unsingle);if(!obj(n))return n;const y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,unsingle(v)]));if(y.type==='object'&&Object.keys(y.properties).length===1&&Object.hasOwn(y.properties,'0'))return{type:'array',minItems:1,maxItems:1,items:y.properties['0']};return y;}

function pure(input){check();const s=structuredClone(input),stats={nullable:0,unions:0,enumSaving:0};const resolve=n=>n.$ref?s.$defs[n.$ref.slice(8)]:n;
function visit(n){check();if(!obj(n))return n;let y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,['properties','$defs'].includes(k)?Object.fromEntries(Object.entries(v).map(([a,b])=>[a,visit(b)])):k==='anyOf'?v.map(visit):k==='items'?visit(v):v]));
if(y.anyOf?.length===2&&Object.keys(y).length===1){const non=y.anyOf.find(x=>resolve(x).type!=='null'),nil=y.anyOf.find(x=>resolve(x).type==='null');if(non&&nil){const t=resolve(non);if(typeof t.type==='string'&&!t.enum){stats.nullable++;return{...t,type:[t.type,'null']}}}}
return y;}
let out=visit(s);
const enums=[];function scan(n){check();if(!obj(n))return;if(n.enum&&n.type==='string'&&Object.keys(n).length===2)enums.push(n);for(const[k,v]of Object.entries(n)){if(['properties','$defs'].includes(k))Object.values(v).forEach(scan);else if(k==='anyOf')v.forEach(scan);else if(k==='items')scan(v)}}scan(out);
for(let i=0;i<enums.length;i++){const a=enums[i];if(!a.enum)continue;let best=null;for(let j=0;j<i;j++){const b=enums[j];if(!b.enum)continue;const inter=a.enum.filter(v=>b.enum.includes(v));if(inter.length<3)continue;const tailA=a.enum.filter(v=>!inter.includes(v)),tailB=b.enum.filter(v=>!inter.includes(v));const def={type:'string',enum:inter},name='E'+i,ref={$ref:'#/$defs/'+name},na=tailA.length?{anyOf:[ref,{type:'string',enum:tailA}]}:ref,nb=tailB.length?{anyOf:[ref,{type:'string',enum:tailB}]}:ref;const saving=JSON.stringify(a).length+JSON.stringify(b).length-JSON.stringify(na).length-JSON.stringify(nb).length-JSON.stringify(def).length-name.length-4;if(saving>0&&(!best||saving>best.saving))best={b,def,name,na,nb,saving};}
if(best){ensure(!Object.hasOwn(out.$defs,best.name),"DEFINITION_COLLISION");out.$defs[best.name]=best.def;Object.keys(a).forEach(k=>delete a[k]);Object.assign(a,best.na);Object.keys(best.b).forEach(k=>delete best.b[k]);Object.assign(best.b,best.nb);stats.enumSaving+=best.saving;}}
return{schema:out,stats};}


function depthBoundedProviderSchema(original,maxContainers=9,maxGrowth=300){
 const baseline=JSON.stringify(original).length,maxBytes=baseline+maxGrowth;
 const isObj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
 function metrics(root){
  const defs=root.$defs||{};let max=0,excess=0;
  function walk(n,depth=0,refs=[]){
   check();if(!isObj(n))return;
   if(n.$ref){ensure(n.$ref.startsWith("#/$defs/"),"DEPTH_REF");const key=n.$ref.slice(8);
    ensure(Object.hasOwn(defs,key)&&!refs.includes(key),"DEPTH_CYCLE");walk(defs[key],depth,[...refs,key]);return;}
   if(n.type==="object"||n.type==="array"){depth++;max=Math.max(max,depth);if(depth>maxContainers)excess++;}
   for(const v of Object.values(n.properties||{}))walk(v,depth,refs);
   if(n.items)walk(n.items,depth,refs);
   for(const v of n.anyOf||[])walk(v,depth,refs);
  }
  walk(root);return {max,excess};
 }
 function resolved(root,v){
  if(!isObj(v))return null;
  return v.$ref?.startsWith("#/$defs/")?root.$defs?.[v.$ref.slice(8)]:v;
 }
 function candidates(root){
  const out=[];
  function find(n,path=[]){
   check();if(!isObj(n))return;
   if(n.type==="object"&&n.properties){
    for(const [key,child]of Object.entries(n.properties)){
     const target=resolved(root,child);
     if(!key.includes("/")&&isObj(target)&&target.type==="object"&&target.additionalProperties===false
       &&isObj(target.properties)&&Array.isArray(target.required)
       &&canonical([...target.required].sort())===canonical(Object.keys(target.properties).sort())
       &&Object.keys(child).every(k=>k==="$ref"||k==="type"||k==="properties"||k==="additionalProperties"||k==="required")
       &&Object.keys(target.properties).every(k=>!k.includes("/"))
       &&Object.keys(target.properties).every(k=>!Object.hasOwn(n.properties,key+"/"+k))){
      out.push([path,key]);
     }
    }
   }
   for(const typ of ["properties","$defs"])for(const [k,v]of Object.entries(n[typ]||{}))find(v,[...path,[typ,k]]);
   for(let i=0;i<(n.anyOf?.length||0);i++)find(n.anyOf[i],[...path,["anyOf",i]]);
   if(n.items)find(n.items,[...path,["items",null]]);
  }
  find(root);return out;
 }
 function flattened(root,entry){
  const candidate=structuredClone(root);let parent=candidate;const [path,key]=entry;
  for(const [kind,index]of path)parent=index===null?parent[kind]:parent[kind][index];
  const target=resolved(candidate,parent.properties[key]);
  ensure(isObj(target)&&target.type==="object","DEPTH_TARGET");
  const replacements=Object.fromEntries(Object.entries(target.properties).map(([k,v])=>[key+"/"+k,structuredClone(v)]));
  parent.properties={...Object.fromEntries(Object.entries(parent.properties).filter(([k])=>k!==key)),...replacements};
  parent.required=[...parent.required.filter(k=>k!==key),...Object.keys(replacements)];
  return candidate;
 }
 let cur=structuredClone(original),before=metrics(cur);
 for(let step=0;step<16&&before.excess>0;step++){
  let best=null;
  for(const path of candidates(cur)){
   check();
   const test=flattened(cur,path),len=JSON.stringify(test).length;
   if(len>maxBytes)continue;
   const next=metrics(test);
   if(next.excess>=before.excess)continue;
   if(best===null||next.excess<best.depth.excess||next.excess===best.depth.excess&&len<best.len)
    best={schema:test,len,depth:next};
  }
  ensure(best!==null,"NESTING_UNRESOLVED");
  cur=best.schema;before=best.depth;
 }
 ensure(before.max<=maxContainers,"NESTING_DEPTH");
 ensure(canonical(norm(restore(expand(original,check))))===
        canonical(norm(restore(expand(cur,check)))),"NESTING_INVERSE");
 return cur;
}

 const stack=createStackAskWirePlan(wire,check);
 const source=plainCopy(wire.typedSchema,check);
 function audit(n){check();if(!obj(n))return;
  for(const k of Object.keys(n.properties||{}))ensure(k!=="0"&&!k.includes("/"),"RESERVED_PATH");
  for(const[k,v]of Object.entries(n)){if(["properties","$defs"].includes(k))Object.values(v).forEach(audit);else if(k==="items")audit(v);else if(k==="anyOf")v.forEach(audit);}
 }
 audit(source);
 const transformed=selective(single(source)).schema;
 ensure(canonical(norm(expand(source,check)))===canonical(norm(unsingle(restore(expand(transformed,check))))),"SCHEMA_INVERSE");
 const schema=depthBoundedProviderSchema(pure(transformed).schema);
 const expanded=expand(schema,check),valid=makeValidator(expanded,check);
 const boundary=stack.instructions.indexOf("\nFIELDS ");
 ensure(boundary>=0,"POLICY_LAYOUT");
 const instructions="Canonical nested JSON root: embed child objects, not node lists/indexes/stack markers. All branches/fields/inactive tags/values explicit; infer no facts or authority. Codec/Binder validate."
  +stack.instructions.slice(boundary)
  +"\nPATHS: A/B=B in A; 0=single fixed-array item. Choices explicit; restore declared form only.";
 const miss=Symbol("missing");
 function read(v,path,c){for(const k of path.split("/")){c();if(v===null||typeof v!=="object"||!Object.hasOwn(v,k))return miss;v=v[k];}return v;}
 function encodeNode(v,s,c){c();
  if(s.anyOf){for(const branch of s.anyOf){c();const x=encodeNode(v,branch,c);if(x!==miss&&valid(branch,x)){c();return x;}}return miss;}
  if(v===null)return valid(s,null)?null:miss;
  const t=Array.isArray(s.type)?s.type.find(x=>x!=="null"):s.type;
  if(t==="array"){if(!Array.isArray(v))return miss;const out=[];for(const x of v){const y=encodeNode(x,s.items,c);if(y===miss)return miss;out.push(y);}return valid(s,out)?out:miss;}
  if(t==="object"){if(v===null||typeof v!=="object")return miss;const out=Object.create(null);for(const[k,ps]of Object.entries(s.properties)){c();const raw=read(v,k,c);if(raw===miss)return miss;const y=encodeNode(raw,ps,c);if(y===miss)return miss;Object.defineProperty(out,k,{value:y,enumerable:true});}return valid(s,out)?out:miss;}
  const accepted=valid(s,v);c();return accepted?v:miss;
 }
 function restoreData(v,c){c();if(Array.isArray(v))return v.map(x=>restoreData(x,c));if(!obj(v))return v;const out=Object.create(null);
  for(const[k,value]of Object.entries(v)){c();const path=k.split("/");let cur=out;for(let i=0;i<path.length-1;i++){c();const p=path[i];if(!Object.hasOwn(cur,p))cur[p]=Object.create(null);ensure(obj(cur[p]),"PATH_COLLISION");cur=cur[p];}const key=path.at(-1);ensure(!Object.hasOwn(cur,key),"PATH_COLLISION");cur[key]=restoreData(value,c);}
  function arrays(x){c();if(Array.isArray(x))return x.map(arrays);if(!obj(x))return x;if(Object.keys(x).length===1&&Object.hasOwn(x,"0"))return[arrays(x["0"])];return Object.fromEntries(Object.entries(x).map(([k,y])=>[k,arrays(y)]));}
  return arrays(out);
 }
 const order=v=>Object.keys(v).sort((a,b)=>compare(a.split("~")[0],b.split("~")[0])||compare(a,b));
 function toGraph(tree,c){const nodes=[];
  function value(v){c();if(Array.isArray(v))return v.map(value);if(!obj(v))return v;
   const n=Object.fromEntries(order(v).map(k=>[k,value(v[k])]));
   ensure(nodes.length<RECURSIVE_TRANSPORT_LIMITS.maxContainers,"RESOURCE_LIMIT");const index=nodes.length;nodes.push(n);return{"@":index};
  }
  value(tree);ensure(nodes.length>0,"ROOT");return{nodes:nodes.slice(0,-1),root:nodes.at(-1)};
 }
 function fromGraph(graph,c){const nodes=[...graph.nodes,graph.root];
  function node(index){c();const n=nodes[index];
   function value(v){c();if(Array.isArray(v))return v.map(value);if(!obj(v))return v;
    ensure(Object.keys(v).length===1&&Object.hasOwn(v,"@")&&Number.isSafeInteger(v["@"])&&v["@"]>=0&&v["@"]<index,"INDEXED_EDGE");return node(v["@"]);
   }
   return Object.fromEntries(order(n).map(k=>[k,value(n[k])]));
  }
  return node(nodes.length-1);
 }
 check();
 return Object.freeze({schema,instructions,
  encode(value,c){const clean=plainCopy(value,c);const graph=wire.encode(clean);c();
   const nested=fromGraph(graph,c),encoded=encodeNode(nested,expanded,c);ensure(encoded!==miss,"ENCODE");
   return plainCopy(encoded,c);
  },
  decode(value,c){const clean=plainCopy(value,c);ensure(obj(clean),"ROOT");
   ensure(valid(expanded,clean),"PROVIDER_SCHEMA");c();
   const restored=plainCopy(restoreData(clean,c),c),graph=toGraph(restored,c);
   const decoded=wire.decode(graph);c();return decoded;
  }
 });

}
