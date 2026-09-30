// Lossless transport: schema constraints and structural restoration only.
import { optimizeSchema } from "./ask-wire-schema.mjs";
const own=(o,k)=>Object.hasOwn(o,k);
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const clone=x=>structuredClone(x);
const sorted=x=>Array.isArray(x)?x.map(sorted):obj(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
const canonical=x=>JSON.stringify(sorted(x));
const without=(o,keys)=>Object.fromEntries(Object.entries(o).filter(([k])=>!keys.includes(k)));
function ensure(condition,code){if(!condition)throw new Error("ASK_WIRE_"+code);}
function symbol(i){const a="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";return i<52?a[i]:symbol(Math.floor(i/52)-1)+a[i%52];}
function expand(schema){
 const defs=schema.$defs??{};
 function visit(n,seen=[]){
  if(Array.isArray(n))return n.map(v=>visit(v,seen));
  if(!obj(n))return n;
  if(own(n,"$ref")){
   ensure(Object.keys(n).length===1&&typeof n.$ref==="string"&&n.$ref.startsWith("#/$defs/"),"SCHEMA_REF");
   const k=n.$ref.slice(8);ensure(own(defs,k)&&!seen.includes(k),"SCHEMA_REF_TARGET");
   return visit(defs[k],[...seen,k]);
  }
  return Object.fromEntries(Object.entries(n).filter(([k])=>k!=="$defs").map(([k,v])=>[k,visit(v,seen)]));
 }
 return visit(schema);
}
function makeValidator(root){
 const regexes=new Map();
 const allowed=new Set(["type","properties","required","additionalProperties","anyOf","items","enum","minItems","maxItems","minLength","maxLength","minimum","maximum","pattern","description"]);
 function audit(s){
  ensure(obj(s)&&Object.keys(s).every(k=>allowed.has(k)),"UNSUPPORTED_SCHEMA");
  if(s.pattern!==undefined){ensure(typeof s.pattern==="string","SCHEMA_PATTERN");regexes.set(s.pattern,new RegExp(s.pattern));}
  for(const n of Object.values(s.properties??{}))audit(n);
  for(const n of s.anyOf??[])audit(n);
  if(s.items)audit(s.items);
 }
 audit(root);
 function valid(s,v,depth=0){
  if(depth>256)return false;
  if(s.anyOf&&!s.anyOf.some(n=>valid(n,v,depth+1)))return false;
  if(s.enum&&!s.enum.some(x=>canonical(x)===canonical(v)))return false;
  const types=s.type===undefined?[]:Array.isArray(s.type)?s.type:[s.type];
  const kind=v===null?"null":Array.isArray(v)?"array":typeof v;
  if(types.length&&!types.some(t=>t===kind||(t==="integer"&&kind==="number"&&Number.isInteger(v))))return false;
  if(kind==="number")return Number.isFinite(v)&&(s.minimum===undefined||v>=s.minimum)&&(s.maximum===undefined||v<=s.maximum);
  if(kind==="string")return Array.from(v).length>=(s.minLength??0)&&Array.from(v).length<=(s.maxLength??Infinity)&&(!s.pattern||regexes.get(s.pattern).test(v));
  if(kind==="array")return v.length>=(s.minItems??0)&&v.length<=(s.maxItems??Infinity)&&v.every(x=>valid(s.items??{},x,depth+1));
  if(kind==="object"){
   if(v===null||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return false;
   if((s.required??[]).some(k=>!own(v,k)))return false;
   return Object.entries(v).every(([k,x])=>own(s.properties??{},k)?valid(s.properties[k],x,depth+1):s.additionalProperties!==false);
  }
  return kind==="null"||kind==="boolean";
 }
 return (s,v)=>valid(s,v);
}
function factor(root){
 const names=new Map(),defs={};
 function visit(n,isRoot=false){
  if(!obj(n))return n;
  const y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,k==="properties"?Object.fromEntries(Object.entries(v).map(([a,b])=>[a,visit(b)])):k==="anyOf"?v.map(b=>visit(b)):k==="items"?visit(v):v]));
  const key=canonical(y);if(isRoot||key.length<30)return y;
  if(!names.has(key)){const name=symbol(names.size);names.set(key,name);defs[name]=y;}
  return {$ref:"#/$defs/"+names.get(key)};
 }
 let out=visit(root,true);out.$defs=defs;
 while(true){
  const counts=new Map();
  function count(n){if(Array.isArray(n)){n.forEach(count);return;}if(!obj(n))return;if(n.$ref){const k=n.$ref.slice(8);counts.set(k,(counts.get(k)??0)+1);}Object.values(n).forEach(count);}
  count(out);const singles=new Set(Object.keys(out.$defs).filter(k=>(counts.get(k)??0)<2));
  if(!singles.size)return out;
  const old=out.$defs;
  function inline(n){
   if(Array.isArray(n))return n.map(inline);if(!obj(n))return n;
   if(Object.keys(n).length===1&&n.$ref&&singles.has(n.$ref.slice(8)))return inline(old[n.$ref.slice(8)]);
   return Object.fromEntries(Object.entries(n).map(([k,v])=>[k,inline(v)]));
  }
  out=inline(without(out,["$defs"]));
  out.$defs=Object.fromEntries(Object.entries(old).filter(([k])=>!singles.has(k)).map(([k,v])=>[k,inline(v)]));
 }
}
function foldUnions(root){
 function visit(n){
  if(Array.isArray(n))return n.map(visit);if(!obj(n))return n;
  const y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,visit(v)]));
  if(y.required)y.required.sort();
  if(Object.keys(y).length!==1||!y.anyOf)return y;
  const arms=[...new Map(y.anyOf.map(a=>[canonical(a),a])).values()];
  while(true){
   let changed=false;
   outer:for(let i=0;i<arms.length;i++)for(let j=i+1;j<arms.length;j++){
    const a=arms[i],b=arms[j];let merged=null;
    if(a.enum&&b.enum&&canonical(without(a,["enum"]))===canonical(without(b,["enum"])))
     merged={...a,enum:[...new Map([...a.enum,...b.enum].map(v=>[canonical(v),v])).values()]};
    else if(a.properties&&b.properties&&canonical(without(a,["properties"]))===canonical(without(b,["properties"]))&&canonical(Object.keys(a.properties).sort())===canonical(Object.keys(b.properties).sort())){
     const changedKeys=Object.keys(a.properties).filter(k=>canonical(a.properties[k])!==canonical(b.properties[k]));
     if(changedKeys.length===1){
      const k=changedKeys[0],l=a.properties[k],r=b.properties[k];
      const opts=x=>Object.keys(x).length===1&&x.anyOf?x.anyOf:[x];
      merged=clone(a);merged.properties[k]=visit({anyOf:[...opts(l),...opts(r)]});
     }
    }
    if(merged){arms[i]=merged;arms.splice(j,1);changed=true;break outer;}
   }
   if(!changed)return arms.length===1?arms[0]:{anyOf:arms};
  }
 }
 return visit(root);
}
function groupSchema(original){
 const folded=foldUnions(original),root=factor(folded),moves=[];
 for(let iteration=0;iteration<64;iteration++){
  const objects=[];
  function collect(n){if(Array.isArray(n)){n.forEach(collect);return;}if(!obj(n))return;if(n.properties)objects.push(n);Object.values(n).forEach(collect);}
  collect(root);const candidates=new Map();
  for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++){
   const a=objects[i],b=objects[j];
   const names=Object.keys(a.properties).filter(k=>!k.startsWith("_g")&&own(b.properties,k)&&canonical(a.properties[k])===canonical(b.properties[k]));
   if(names.length<2)continue;
   candidates.set(canonical(Object.fromEntries(names.map(k=>[k,a.properties[k]]))),[names,a]);
  }
  let best=null;
  for(const [names,a] of candidates.values()){
   const matching=objects.filter(n=>names.every(k=>own(n.properties,k)&&canonical(n.properties[k])===canonical(a.properties[k])));
   const group={type:"object",additionalProperties:false,required:names,properties:Object.fromEntries(names.map(k=>[k,a.properties[k]]))};
   const savings=(names.reduce((s,k)=>s+canonical(a.properties[k]).length+2*canonical(k).length+3,0)-60)*matching.length-canonical(group).length;
   if(savings>0&&(!best||savings>best.savings))best={savings,names,group,matching};
  }
  if(!best)break;
  const {names,group,matching}=best,key="_g"+iteration,definition="group"+iteration;
  for(const n of matching){
   n.required=[...n.required.filter(k=>!names.includes(k)),key];
   n.properties={...without(n.properties,names),[key]:{$ref:"#/$defs/"+definition}};
  }
  root.$defs[definition]=group;moves.push({key,fields:names,uses:matching.length});
 }
 return {root,folded,moves};
}
function flatten(v){
 if(Array.isArray(v))return v.map(flatten);if(!obj(v))return clone(v);
 const entries=new Map();
 for(const [k,x] of Object.entries(v)){
  if(k.startsWith("_g")){
   const g=flatten(x);ensure(obj(g),"GROUP_OBJECT");
   for(const [f,z] of Object.entries(g)){ensure(!entries.has(f),"GROUP_COLLISION");entries.set(f,z);}
  }else{ensure(!entries.has(k),"FIELD_COLLISION");entries.set(k,flatten(x));}
 }
 return Object.fromEntries(entries);
}
function groupKeys(n){return Object.keys(n.properties).flatMap(k=>k.startsWith("_g")?groupKeys(n.properties[k]):[k]);}
function normalizeRequired(n){if(Array.isArray(n))return n.map(normalizeRequired);if(!obj(n))return n;return Object.fromEntries(Object.entries(n).map(([k,v])=>[k,k==="required"?[...v].sort():normalizeRequired(v)]));}
function ungroupSchema(n){
 if(Array.isArray(n))return n.map(ungroupSchema);if(!obj(n))return n;
 const y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,ungroupSchema(v)]));
 if(y.properties){
  for(const k of Object.keys(y.properties).filter(k=>k.startsWith("_g"))){
   const g=y.properties[k];ensure(g.type==="object"&&g.additionalProperties===false&&canonical([...g.required].sort())===canonical(Object.keys(g.properties).sort()),"GROUP_SCHEMA");
   delete y.properties[k];y.required=y.required.filter(f=>f!==k);
   ensure(Object.keys(g.properties).every(f=>!own(y.properties,f)),"GROUP_SCHEMA_COLLISION");
   y.properties={...y.properties,...g.properties};y.required.push(...g.required);
  }
  y.required.sort();
 }
 return y;
}
export function createGraphCodec(schema){
 const canonicalSchema=expand(schema);
 const canonicalValid=makeValidator(canonicalSchema);
 const {root:grouped,folded}=groupSchema(canonicalSchema);
 ensure(canonical(ungroupSchema(expand(grouped)))===canonical(normalizeRequired(folded)),"SCHEMA_RESTORATION");
 const original=expand(grouped),valid=makeValidator(original),fields=new Set(),constantMaps={},info=new WeakMap(),signatures=new Map();
 function fieldsAudit(n){
  if(n.properties){
   ensure(n.additionalProperties===false&&canonical([...n.required].sort())===canonical(Object.keys(n.properties).sort()),"STRICT_OBJECT_SCHEMA");
   for(const [k,v] of Object.entries(n.properties)){ensure(k!=="_"&&!k.includes("~"),"RESERVED_FIELD");fields.add(k);fieldsAudit(v);}
  }
  for(const a of n.anyOf??[])fieldsAudit(a);if(n.items)fieldsAudit(n.items);
 }
 fieldsAudit(original);
 const names=Object.fromEntries([...fields].sort().map((k,i)=>[k,symbol(i)])),reverseNames=Object.fromEntries(Object.entries(names).map(([k,v])=>[v,k])),missing=Symbol("missing");
 function constant(n){return n.type==="null"?null:n.enum?.length===1?n.enum[0]:n.type==="array"&&n.maxItems===0?[]:missing;}
 function compactSchema(n){
  const y=clone(without(n,["description","properties","required","anyOf","items"]));
  if(n.anyOf)y.anyOf=n.anyOf.map(compactSchema);if(n.items)y.items=compactSchema(n.items);
  if(n.properties){
   const constants=Object.fromEntries(Object.entries(n.properties).filter(([,v])=>constant(v)!==missing).map(([k,v])=>[k,constant(v)]));
   const props=Object.fromEntries(Object.entries(n.properties).filter(([k])=>!own(constants,k)).map(([k,v])=>[names[k],compactSchema(v)]));
   let tag=null;
   if(Object.keys(constants).length){
    const signature=canonical(constants);if(!signatures.has(signature)){const t=symbol(signatures.size);signatures.set(signature,t);constantMaps[t]=constants;}
    tag=signatures.get(signature);props._={type:"string",enum:[tag]};
   }
   y.properties=props;y.required=Object.keys(props);info.set(n,{tag,constants});
  }
  return y;
 }
 const compact=compactSchema(original),compactValid=makeValidator(compact);
 function groupValue(n,v){
  if(n.anyOf){for(const a of n.anyOf){try{const y=groupValue(a,v);if(valid(a,y))return y;}catch{ /* next structural branch */ }}throw Error("ASK_WIRE_GROUP_BRANCH");}
  let y;
  if(obj(v)){
   ensure(n.properties&&canonical(Object.keys(v).sort())===canonical(groupKeys(n).sort()),"GROUP_FIELDS");
   y=Object.fromEntries(Object.entries(n.properties).map(([k,s])=>[k,groupValue(s,k.startsWith("_g")?Object.fromEntries(groupKeys(s).map(f=>[f,v[f]])):v[k])]));
  }else if(Array.isArray(v))y=v.map(x=>groupValue(n.items,x));else y=clone(v);
  ensure(valid(n,y),"GROUP_VALUE");return y;
 }
 function encodeCompact(n,v){
  if(n.anyOf){const a=n.anyOf.find(a=>valid(a,v));ensure(a,"COMPACT_BRANCH");return encodeCompact(a,v);}
  if(obj(v)){
   const {tag,constants}=info.get(n);
   const y=Object.fromEntries(Object.entries(v).filter(([k])=>!own(constants,k)).map(([k,x])=>[names[k],encodeCompact(n.properties[k],x)]));
   if(tag!==null)y._=tag;return y;
  }
  return Array.isArray(v)?v.map(x=>encodeCompact(n.items,x)):clone(v);
 }
 function decodeCompact(v,depth=0){
  ensure(depth<=32,"WIRE_DEPTH");
  if(Array.isArray(v))return v.map(x=>decodeCompact(x,depth+1));
  if(!obj(v))return clone(v);
  ensure(Object.keys(v).every(k=>k==="_"||own(reverseNames,k)),"UNKNOWN_KEY");
  const y=Object.fromEntries(Object.entries(v).filter(([k])=>k!=="_").map(([k,x])=>[reverseNames[k],decodeCompact(x,depth+1)]));
  if(own(v,"_")){
   ensure(typeof v._==="string"&&own(constantMaps,v._),"UNKNOWN_TAG");
   const constants=constantMaps[v._];ensure(Object.keys(constants).every(k=>!own(y,k)),"CONSTANT_COLLISION");
   return {...y,...clone(constants)};
  }
  return y;
 }
 const nodes=new Map();
 const ref={type:"object",additionalProperties:false,required:["@"],properties:{"@":{type:"integer",minimum:0}}};
 function graph(n){
  if(n.properties){
   const key=canonical(n);
   if(!nodes.has(key)){nodes.set(key,null);nodes.set(key,{...without(n,["properties","required"]),type:"object",properties:Object.fromEntries(Object.entries(n.properties).map(([k,v])=>[k,graph(v)])),required:n.required});}
   return Array.isArray(n.type)&&n.type.includes("null")?{anyOf:[ref,{type:"null"}]}:ref;
  }
  return Object.fromEntries(Object.entries(n).map(([k,v])=>[k,k==="anyOf"?v.map(graph):k==="items"?graph(v):v]));
 }
 graph(compact);
 const rawGraph=factor(foldUnions({type:"object",additionalProperties:false,required:["nodes"],properties:{nodes:{type:"array",minItems:1,items:{anyOf:[...nodes.values()]}}}}));
 const rawExpanded=expand(rawGraph),rawValid=makeValidator(rawExpanded),objects=[];
 function collect(n){if(Array.isArray(n)){n.forEach(collect);return;}if(!obj(n))return;if(n.properties&&own(n.properties,"_"))objects.push(n);Object.values(n).forEach(collect);}
 collect(rawExpanded);
 const candidates=new Map(),forbidden=new Set();
 const ruleKey=(keys,tag)=>canonical([keys,tag]);
 for(const n of objects){
  const keys=Object.keys(n.properties).sort(),tags=n.properties._.enum;
  ensure(n.properties._.type==="string"&&tags?.length,"TAG_SCHEMA");
  for(const tag of tags){const key=ruleKey(keys,tag);if(tags.length!==1||keys.length<2)forbidden.add(key);else candidates.set(key,keys.find(k=>k!=="_"));}
 }
 const rules=new Map([...candidates].filter(([k])=>!forbidden.has(k)));
 function packSchema(n){
  if(Array.isArray(n))return n.map(packSchema);if(!obj(n))return n;
  const y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,packSchema(v)]));
  if(n.properties&&own(n.properties,"_")){
   const tags=n.properties._.enum,key=ruleKey(Object.keys(n.properties).sort(),tags[0]);
   if(tags.length===1&&rules.has(key)){
    const f=rules.get(key),p=f+"~"+tags[0];
    y.properties=Object.fromEntries(Object.entries(y.properties).filter(([k])=>k!=="_").map(([k,v])=>[k===f?p:k,v]));
    y.required=y.required.filter(k=>k!=="_").map(k=>k===f?p:k);
   }
  }
  return y;
 }
 const packedRaw=factor(packSchema(rawExpanded)),wireSchema=optimizeSchema(packedRaw).schema,wireExpanded=expand(wireSchema),wireValid=makeValidator(wireExpanded);
 function pack(wire){
  return {nodes:wire.nodes.map(n=>{
   const f=rules.get(ruleKey(Object.keys(n).sort(),n._));if(f===undefined)return clone(n);
   return {...without(n,["_",f]),[f+"~"+n._]:clone(n[f])};
  })};
 }
 function encode(value){
  ensure(canonicalValid(canonicalSchema,value),"CANONICAL_SCHEMA");
  const c=encodeCompact(original,groupValue(original,value));ensure(compactValid(compact,c),"COMPACT_SCHEMA");
  const nodes=[];
  function visit(v){
   if(Array.isArray(v))return v.map(visit);if(!obj(v))return clone(v);
   const n=Object.fromEntries(Object.keys(v).sort().map(k=>[k,visit(v[k])])),i=nodes.length;nodes.push(n);return {"@":i};
  }
  const root=visit(c);ensure(root["@"]===nodes.length-1,"ROOT_NODE");
  const w=pack({nodes});ensure(wireValid(wireExpanded,w),"ENCODED_SCHEMA");return w;
 }
 function decode(wire){
  ensure(wireValid(wireExpanded,wire),"WIRE_SCHEMA");
  const unpacked={nodes:wire.nodes.map(n=>{
   const marked=Object.keys(n).filter(k=>k.includes("~"));ensure(marked.length<=1,"MULTIPLE_PACKED_TAGS");
   if(!marked.length)return clone(n);
   const p=marked[0],parts=p.split("~");ensure(parts.length===2,"PACKED_TAG_SYNTAX");const [f,t]=parts;
   ensure(!own(n,"_")&&!own(n,f),"PACKED_COLLISION");
   const raw={...without(n,[p]),[f]:clone(n[p]),_:t};
   ensure(rules.get(ruleKey(Object.keys(raw).sort(),t))===f,"UNKNOWN_PACKED_TAG");return raw;
  })};
  ensure(rawValid(rawExpanded,unpacked),"RAW_GRAPH_SCHEMA");const seen=new Set();
  function node(index,depth){
   ensure(depth<=64&&!seen.has(index),"REUSED_OR_DEEP_NODE");seen.add(index);
   function visit(v){
    if(Array.isArray(v))return v.map(visit);
    if(!obj(v))return clone(v);
    ensure(Object.keys(v).length===1&&own(v,"@")&&Number.isInteger(v["@"])&&v["@"]>=0&&v["@"]<index,"INVALID_EDGE");
    return node(v["@"],depth+1);
   }
   return Object.fromEntries(Object.entries(unpacked.nodes[index]).map(([k,v])=>[k,visit(v)]));
  }
  const nested=node(unpacked.nodes.length-1,0);ensure(seen.size===unpacked.nodes.length,"UNREACHABLE_NODES");
  ensure(compactValid(compact,nested),"COMPACT_SCHEMA");
  const restored=flatten(decodeCompact(nested));ensure(canonicalValid(canonicalSchema,restored),"CANONICAL_RESTORATION");
  ensure(canonical(encode(restored))===canonical(wire),"NONCANONICAL_WIRE");
  return restored;
 }
 return {schema:wireSchema,encode,decode,names,constantMaps,packedRuleCount:rules.size,rawGraphSchema:rawGraph};
}
export { canonical, expand, makeValidator };
