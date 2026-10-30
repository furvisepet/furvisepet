import assert from'node:assert/strict';
import{createHash}from'node:crypto';
import{expand,makeValidator}from'./ask-wire-codec.mjs';
import{exactShare}from'./ask-wire-exact-sharing.mjs';
const j=JSON.stringify,NONE=Symbol('not singleton');
const fail=code=>{throw Error('ASK_SINGLETON_'+code);};
const stable=v=>j(v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])));
const valueEqual=(a,b)=>stable(a)===stable(b);
const hash=v=>createHash('sha256').update(stable(v)).digest('hex');
export const SINGLETON_TRANSPORT_LEGEND='\nOnly variable schema fields are emitted. Proven singleton fields omitted by this transport are reconstructed exactly within the selected structural branch. Existing semantic choices and discriminants are unchanged; never infer intent, add authority or repair an invalid value. Unknown and extra fields are rejected by server validation.';
export function compileSingletonTransport(schema,checkCompilation=()=>{}){
 checkCompilation();
 const defs=schema.$defs||{},resolve=s=>s?.$ref?(assert.deepEqual(Object.keys(s),['$ref']),assert(s.$ref.startsWith('#/$defs/')),assert(defs[s.$ref.slice(8)]),defs[s.$ref.slice(8)]):s;
 const singles=new WeakMap(),busy=new WeakSet(),expanded=new WeakMap();let singletonProofs=0;
 function ex(s){if(!expanded.has(s)){const w=expand({type:'object',properties:{value:s},required:['value'],additionalProperties:false,$defs:defs});expanded.set(s,w.properties.value);}return expanded.get(s);}
 function single(s){
  checkCompilation();
  if(singles.has(s))return singles.get(s);if(busy.has(s))return NONE;busy.add(s);
  let out=NONE,x=resolve(s);
  if(x!==s)out=single(x);
  else if(x.enum?.length===1)out=structuredClone(x.enum[0]);
  else if(x.type==='null')out=null;
  else if(x.type==='array'&&x.maxItems===0&&(x.minItems??0)===0)out=[];
  else if(x.type==='string'&&x.maxLength===0&&(x.minLength??0)===0)out='';
  else if(x.type==='object'&&x.additionalProperties===false&&Object.keys(x.properties||{}).every(k=>(x.required||[]).includes(k))){
   const v=Object.create(null);let all=true;for(const[k,n]of Object.entries(x.properties||{})){const a=single(n);if(a===NONE){all=false;break;}v[k]=a;}if(all)out=v;
  }else if(x.anyOf?.length){const a=x.anyOf.map(n=>single(n));if(a.every(v=>v!==NONE&&j(v)===j(a[0])))out=a[0];}
  if(out!==NONE){const e=ex(s);if(!makeValidator(e)(e,out))out=NONE;else singletonProofs++;}
  busy.delete(s);singles.set(s,out);return out;
 }
 const protectedFields=new WeakMap(),unionProofs=[],protectedAll=new WeakSet();
 function protect(s,k){s=resolve(s);if(!protectedFields.has(s))protectedFields.set(s,new Set());protectedFields.get(s).add(k);}
 function children(s){return[...Object.values(s.properties||{}),...(s.items?[s.items]:[]),...(s.anyOf||[])];}
 function retainAll(s,seen=new Set()){s=resolve(s);if(seen.has(s))return;seen.add(s);protectedAll.add(s);children(s).forEach(n=>retainAll(n,seen));}
 function types(s){s=resolve(s);if(s.type)return new Set((Array.isArray(s.type)?s.type:[s.type]).map(t=>t==='integer'?'number':t));if(s.anyOf)return new Set(s.anyOf.flatMap(n=>[...types(n)]));if(s.enum)return new Set(s.enum.map(v=>v===null?'null':Array.isArray(v)?'array':typeof v));return new Set();}
 function witness(a,b,path=[],trail=new Set()){
  checkCompilation();
  a=resolve(a);b=resolve(b);const ta=types(a),tb=types(b);if(ta.size&&tb.size&&![...ta].some(t=>tb.has(t)))return{kind:'base_type',path};
  const av=single(a),bv=single(b);
  if(av!==NONE&&bv!==NONE&&(av===null||typeof av!=='object')&&(bv===null||typeof bv!=='object')&&j(av)!==j(bv))return{kind:'singleton',path};
  if(a.type==='object'&&b.type==='object'){
   for(const k of new Set([...Object.keys(a.properties||{}),...Object.keys(b.properties||{})])){
    const ar=(a.required||[]).includes(k),br=(b.required||[]).includes(k);
    if((ar&&!b.properties?.[k]&&b.additionalProperties===false)||(br&&!a.properties?.[k]&&a.additionalProperties===false))return{kind:'required_field_presence',path:[...path,k]};
    if(!(a.required||[]).includes(k)||!(b.required||[]).includes(k)||!b.properties?.[k])continue;
    const key=path.concat(k).join('/');if(trail.has(key)||path.length>12)continue;
    const next=new Set(trail);next.add(key);const found=witness(a.properties[k],b.properties[k],[...path,k],next);
    if(found)return found;
   }
  }
  return null;
 }
 function retainPath(s,path){s=resolve(s);for(const k of path){if(!s.properties?.[k])return;protect(s,k);s=resolve(s.properties[k]);}}
 const pairSeen=new WeakMap();let compatiblePairs=0,identityFallbackPairs=0;
 function compatible(a,b){
  checkCompilation();
  a=resolve(a);b=resolve(b);if(a===b)return;
  let set=pairSeen.get(a);if(!set){set=new WeakSet();pairSeen.set(a,set);}if(set.has(b))return;set.add(b);compatiblePairs++;
  const w=witness(a,b);if(w){retainPath(a,w.path);retainPath(b,w.path);return;}
  if(a.anyOf){for(const n of a.anyOf)compatible(n,b);return;}
  if(b.anyOf){for(const n of b.anyOf)compatible(a,n);return;}
  if(a.type==='object'&&b.type==='object'){
   const ka=Object.keys(a.properties||{}),kb=Object.keys(b.properties||{});
   if(a.additionalProperties!==false||b.additionalProperties!==false||ka.some(k=>!(a.required||[]).includes(k))||kb.some(k=>!(b.required||[]).includes(k))){retainAll(a);retainAll(b);identityFallbackPairs++;return;}
   if(j([...ka].sort())!==j([...kb].sort())){retainAll(a);retainAll(b);identityFallbackPairs++;return;}
   for(const k of ka){
    const av=single(a.properties[k]),bv=single(b.properties[k]);
    if(av!==NONE&&bv!==NONE&&j(av)===j(bv))continue;
    if(av!==NONE||bv!==NONE){protect(a,k);protect(b,k);}
    compatible(a.properties[k],b.properties[k]);
   }return;
  }
  if(a.type==='array'&&b.type==='array'){if(a.items&&b.items)compatible(a.items,b.items);return;}
  const ta=types(a),tb=types(b);if(!ta.has('object')&&!ta.has('array')&&!tb.has('object')&&!tb.has('array'))return;
  retainAll(a);retainAll(b);identityFallbackPairs++;
 }

 const seen=new Set();
 function protectUnions(s,path='root'){
  checkCompilation();
  s=resolve(s);if(seen.has(s))return;seen.add(s);
  if(s.anyOf)for(let a=0;a<s.anyOf.length;a++)for(let b=a+1;b<s.anyOf.length;b++){
   const w=witness(s.anyOf[a],s.anyOf[b]);
   if(w){retainPath(s.anyOf[a],w.path);retainPath(s.anyOf[b],w.path);unionProofs.push({path,a,b,proof:'retained_required_disjoint_witness',witness:w});}
   else{compatible(s.anyOf[a],s.anyOf[b]);unionProofs.push({path,a,b,proof:'recursive_reconstruction_compatibility'});}
  }
  if(s.properties)for(const[k,n]of Object.entries(s.properties))protectUnions(n,path+'.'+k);
  if(s.items)protectUnions(s.items,path+'.items');(s.anyOf||[]).forEach((n,i)=>protectUnions(n,path+'.anyOf.'+i));
 }
 protectUnions(schema);for(const[k,s]of Object.entries(defs))protectUnions(s,'defs.'+k);
 const erased=[],cache=new WeakMap(),fixedByNode=new WeakMap();
 function transform(s,path='root'){
  checkCompilation();
  if(cache.has(s))return cache.get(s);
  const y={...s};cache.set(s,y);
  if(s.properties){
   y.properties=Object.create(null);const remove=new Set(),fixed={};fixedByNode.set(s,fixed);
   for(const[k,n]of Object.entries(s.properties)){
    const v=single(n);
    if((s.required||[]).includes(k)&&!protectedAll.has(s)&&!protectedFields.get(s)?.has(k)&&v!==NONE){remove.add(k);Object.defineProperty(fixed,k,{value:structuredClone(v),enumerable:true});erased.push({path,key:k,valueHash:hash(v),valueType:v===null?'null':Array.isArray(v)?'array':typeof v,schemaChars:j(n).length,grossChars:j(k).length*2+j(n).length+2});}
    else y.properties[k]=transform(n,path+'.'+k);
   }
   y.required=(s.required||[]).filter(k=>!remove.has(k));
  }
  if(s.items)y.items=transform(s.items,path+'.items');if(s.anyOf)y.anyOf=s.anyOf.map((n,i)=>transform(n,path+'.anyOf.'+i));
  if(s.$defs)y.$defs=Object.fromEntries(Object.entries(s.$defs).map(([k,n])=>[k,transform(n,'defs.'+k)]));
  return y;
 }
 const changed=transform(schema);
 const reached=new Set();function refs(s){if(s.$ref){const k=s.$ref.slice(8);assert(changed.$defs[k]);if(!reached.has(k)){reached.add(k);refs(changed.$defs[k]);}}children(s).forEach(refs);}
 refs(changed);const beforePrune=j(changed).length;changed.$defs=Object.fromEntries(Object.entries(changed.$defs||{}).filter(([k])=>reached.has(k)));
 const reshared=exactShare(expand(changed));assert.deepEqual(expand(reshared),expand(changed));const shared=j(changed).length<=j(reshared).length?changed:reshared;
 const fields=new Map();for(const e of erased){const r=fields.get(e.key)||{field:e.key,count:0,grossChars:0};r.count++;r.grossChars+=e.grossChars;fields.set(e.key,r);}

 // Independent post-transform certificate: every possibly overlapping union pair
 // must have identical reconstruction on shared accepted wire payloads.
 const wireExpanded=new WeakMap();
 function wx(s){
  if(!wireExpanded.has(s)){
   const root={type:'object',properties:{value:transform(s)},required:['value'],additionalProperties:false,$defs:changed.$defs||{}};
   wireExpanded.set(s,expand(root).properties.value);
  }return wireExpanded.get(s);
 }
 const origRoot=expand(schema),wireRoot=expand(shared),ov=makeValidator(origRoot,checkCompilation),wv=makeValidator(wireRoot,checkCompilation);
 const pairCertificates=[],pairMemo=new WeakMap();
 const shape=s=>Object.keys(s.properties||{}).sort();
 const fixed=s=>fixedByNode.get(resolve(s))||{};
 function identity(s,seen=new Set()){
  s=resolve(s);if(seen.has(s))return true;seen.add(s);
  return Object.keys(fixed(s)).length===0&&children(s).every(n=>identity(n,seen));
 }
 function wireDisjoint(a,b){
  const aa=wx(a),bb=wx(b),at=types(aa),bt=types(bb);
  // wx is expanded: use an independent validator-constraint witness without refs.
  function t(n){if(n.type)return new Set((Array.isArray(n.type)?n.type:[n.type]).map(t=>t==='integer'?'number':t));if(n.anyOf)return new Set(n.anyOf.flatMap(x=>[...t(x)]));return new Set();}
  function d(x,y){
   const xt=t(x),yt=t(y);if(xt.size&&yt.size&&![...xt].some(v=>yt.has(v)))return true;
   if(x.enum&&y.enum&&!x.enum.some(v=>y.enum.some(w=>valueEqual(v,w))))return true;
   if(x.type==='object'&&y.type==='object'){
    for(const k of Object.keys(x.properties||{})){
     if((x.required||[]).includes(k)&&!y.properties?.[k]&&y.additionalProperties===false)return true;
     if((x.required||[]).includes(k)&&(y.required||[]).includes(k)&&y.properties?.[k]&&d(x.properties[k],y.properties[k]))return true;
    }
    for(const k of Object.keys(y.properties||{}))if((y.required||[]).includes(k)&&!x.properties?.[k]&&x.additionalProperties===false)return true;
   }
   return false;
  }return d(aa,bb);
 }
 function certify(a,b){
  checkCompilation();a=resolve(a);b=resolve(b);
  let set=pairMemo.get(a);if(!set){set=new WeakSet();pairMemo.set(a,set);}if(set.has(b))return;set.add(b);
  if(a===b){pairCertificates.push('identical_schema_node');return;}
  if(wireDisjoint(a,b)){pairCertificates.push('wire_domains_disjoint');return;}
  const av=single(a),bv=single(b);if(av!==NONE&&bv!==NONE&&valueEqual(av,bv)){pairCertificates.push('same_unique_canonical_value');return;}
  if(identity(a)&&identity(b)){pairCertificates.push('both_reconstructions_identity');return;}
  if(a.anyOf){a.anyOf.forEach(n=>certify(n,b));return;}
  if(b.anyOf){b.anyOf.forEach(n=>certify(a,n));return;}
  if(a.type==='object'&&b.type==='object'){
   const wa=transform(a),wb=transform(b);
   if(j(shape(wa))!==j(shape(wb)))fail('CERTIFICATE_NONSTRICT_OBJECT_OVERLAP');
   if(!valueEqual(fixed(a),fixed(b)))fail('CERTIFICATE_FIXED_MAP_CONFLICT');
   for(const k of shape(wa))certify(a.properties[k],b.properties[k]);
   pairCertificates.push('same_object_fixed_map_and_recursive_fields');return;
  }
  if(a.type==='array'&&b.type==='array'){
   if(a.items&&b.items)certify(a.items,b.items);
   pairCertificates.push('array_identity_length_and_recursive_items');return;
  }
  if(!types(a).has('object')&&!types(a).has('array')&&!types(b).has('object')&&!types(b).has('array')){pairCertificates.push('primitive_identity');return;}
  fail('CERTIFICATE_UNPROVED_OVERLAP');
 }
 const checked=new Set();
 function all(s){s=resolve(s);if(checked.has(s))return;checked.add(s);
  if(s.anyOf)for(let a=0;a<s.anyOf.length;a++)for(let b=a+1;b<s.anyOf.length;b++)certify(s.anyOf[a],s.anyOf[b]);
  children(s).forEach(all);
 }
 all(schema);
 const compiled=new WeakMap();
 function node(s){
  checkCompilation();
  s=resolve(s);if(compiled.has(s))return compiled.get(s);
  const n={};compiled.set(s,n);
  const original=ex(s),wire=wx(s),validOriginal=makeValidator(original,checkCompilation),validWire=makeValidator(wire,checkCompilation);
  if(s.anyOf){
   const alternatives=s.anyOf.map(x=>({n:node(x),original:ex(x),wire:wx(x)}));
   n.decode=(v,check)=>{
    check();const values=alternatives.filter(x=>wv(x.wire,v)).map(x=>x.n.decode(v,check));
    if(!values.length||values.some(x=>!valueEqual(x,values[0])))fail('AMBIGUOUS_OR_INVALID_UNION');
    return values[0]; // all accepted reconstructions are proven equal, never first-match intent.
   };
   n.encode=(v,check)=>{
    check();const values=alternatives.filter(x=>ov(x.original,v)).map(x=>x.n.encode(v,check));
    if(!values.length)fail('INVALID_SOURCE_UNION');
    for(const x of values)if(!valueEqual(n.decode(x,check),v))fail('INVERSE');
    // Multiple representations of the exact SAME supplied canonical value:
    // canonical JSON ordering chooses bytes only, never another meaning/intent.
    return JSON.parse(values.map(stable).sort()[0]);
   };
  }else if(s.properties){
   const f=fixed(s),childrenByKey=Object.fromEntries(Object.entries(s.properties).filter(([k])=>!Object.hasOwn(f,k)).map(([k,x])=>[k,node(x)]));
   n.encode=(v,check)=>{
    check();if(v===null)return v;
    for(const[k,x]of Object.entries(f))if(!valueEqual(v[k],x))fail('FIXED_VALUE_MISMATCH');
    return Object.fromEntries(Object.entries(v).filter(([k])=>!Object.hasOwn(f,k)).map(([k,x])=>[k,childrenByKey[k].encode(x,check)]));
   };
   n.decode=(v,check)=>{
    check();if(v===null)return v;
    return Object.fromEntries(Object.keys(s.properties).filter(k=>Object.hasOwn(f,k)||Object.hasOwn(v,k)).map(k=>[k,Object.hasOwn(f,k)?structuredClone(f[k]):childrenByKey[k].decode(v[k],check)]));
   };
  }else if(s.type==='array'&&s.items){
   const child=node(s.items);
   n.encode=(v,check)=>{check();return v.map(x=>child.encode(x,check));};
   n.decode=(v,check)=>{check();return v.map(x=>child.decode(x,check));};
  }else{
   n.encode=(v,check)=>{check();return structuredClone(v);};
   n.decode=(v,check)=>{check();return structuredClone(v);};
  }
  n.original=original;n.wire=wire;return n;
 }
 const root=node(schema);
 function decode(v,check){
  if(typeof check!=='function')fail('RUNTIME_CHECK_REQUIRED');check();
  if(!wv(wireRoot,v))fail('WIRE_SCHEMA');
  const out=root.decode(v,check);check();if(!ov(origRoot,out))fail('SOURCE_SCHEMA');return out;
 }
 function encode(v,check){
  if(typeof check!=='function')fail('RUNTIME_CHECK_REQUIRED');check();
  if(!ov(origRoot,v))fail('SOURCE_SCHEMA');
  const out=root.encode(v,check);check();if(!wv(wireRoot,out)||!valueEqual(decode(out,check),v))fail('INVERSE');return out;
 }
 checkCompilation();
 return Object.freeze({schema:shared,encode,decode,certificate:Object.freeze({singletonProofs,erasedCount:erased.length,unionPairs:unionProofs.length,compatiblePairs,identityFallbackPairs,independentPairChecks:pairCertificates.length,proofKinds:Object.fromEntries([...new Set(pairCertificates)].map(k=>[k,pairCertificates.filter(x=>x===k).length])),erased})});
}
