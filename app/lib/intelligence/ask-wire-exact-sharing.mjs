export function exactShare(full){
const counts=new Map(),nodes=new Map(),len=x=>JSON.stringify(x).length;
function children(s,fn){const r=structuredClone(s);if(s.properties)r.properties=Object.fromEntries(Object.entries(s.properties).map(([k,x])=>[k,fn(x)]));if(s.anyOf)r.anyOf=s.anyOf.map(fn);if(s.items)r.items=fn(s.items);return r}
function count(s){const key=JSON.stringify(s);counts.set(key,(counts.get(key)||0)+1);nodes.set(key,s);children(s,x=>{count(x);return x})}count(full);
let defs={},memo=new Map(),id=0,savings=[];
function factor(s,isRoot=false){const key=JSON.stringify(s);if(memo.has(key)&&!isRoot)return memo.get(key);const result=children(s,x=>factor(x));const n=counts.get(key),name='s'+(id).toString(36),ref={$ref:'#/$defs/'+name};const gain=(n-1)*len(result)-n*len(ref)-name.length-4;
if(!isRoot&&n>1&&gain>0){id++;defs[name]=result;memo.set(key,ref);savings.push({name,occurrences:n,expandedChars:len(s),factoredNodeChars:len(result),estimatedLocalSavings:gain,type:s.type||'anyOf',properties:Object.keys(s.properties||{})});return ref}memo.set(key,result);return result}

const result=factor(full,true);result.$defs=defs;return result;
}

// Final representation-only sharing retains existing definition targets.
// The final compact-name pass renames every target and edge together.
// Recount after every substitution: nested duplicate savings are not additive.
export function shareFinalSchema(original,check=()=>{}){
 check();
 let schema=structuredClone(original),serial=JSON.stringify(schema),index=0;
 const children=(node,visit)=>{
  const out={...node};
  if(node.properties)out.properties=Object.fromEntries(Object.entries(node.properties).map(([k,v])=>[k,visit(v)]));
  if(node.anyOf)out.anyOf=node.anyOf.map(visit);
  if(node.items)out.items=visit(node.items);
  return out;
 };
 while(true){
  check();
  const groups=new Map(),defs=schema.$defs??{};
  const collect=(node,definition=null,root=false)=>{
   check();
   if(!node||typeof node!=='object'||Array.isArray(node))return;
   const key=JSON.stringify(node);
   if(!root&&!Object.hasOwn(node,'$ref')&&key.length>40){
    if(!groups.has(key))groups.set(key,{node,count:0,definition:null});
    const group=groups.get(key);group.count++;
    if(definition!==null&&group.definition===null)group.definition=definition;
   }
   children(node,child=>{collect(child);return child;});
  };
  collect(schema,null,true);
  for(const [name,node]of Object.entries(defs))collect(node,name);
  let fresh;
  do{fresh='f'+(index++).toString(36);}while(Object.hasOwn(defs,fresh));
  let best=null;
  for(const [key,group]of groups){
   check();
   if(group.count<2)continue;
   const name=group.definition??fresh,reference=JSON.stringify({$ref:'#/$defs/'+name});
   const gain=group.definition!==null
    ?(group.count-1)*(key.length-reference.length)
    :group.count*(key.length-reference.length)-key.length-JSON.stringify(name).length-2;
   if(gain>0&&(!best||gain>best.gain))best={key,...group,name,gain};
  }
  if(!best)return compactFinalDefinitions(schema,check);
  const replace=(node,definition=null)=>{
   check();
   if(JSON.stringify(node)===best.key&&(best.definition===null||definition!==best.definition))return{$ref:'#/$defs/'+best.name};
   return children(node,child=>replace(child));
  };
  const next=replace(schema),nextDefs=Object.fromEntries(Object.entries(defs).map(([name,node])=>[name,replace(node,name)]));
  if(best.definition===null)nextDefs[best.name]=structuredClone(best.node);
  next.$defs=nextDefs;
  const serialized=JSON.stringify(next);
  // Include actual definition/reference overhead, never return a larger schema.
  if(serialized.length>=serial.length)return compactFinalDefinitions(schema,check);
  schema=next;serial=serialized;
 }
}

// Definition identifiers are transport-local, never emitted data or policy text.
// Rename every edge and target together; annotations and enum values are untouched.
function compactFinalDefinitions(schema,check){
 const defs=schema.$defs??{},alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
 const symbol=n=>n<52?alphabet[n]:symbol(Math.floor(n/52)-1)+alphabet[n%52];
 const names=new Map(Object.keys(defs).map((name,index)=>[name,symbol(index)]));
 const visit=node=>{
  check();
  const out={...node};
  if(Object.hasOwn(node,'$ref')){
   if(Object.keys(node).length!==1||typeof node.$ref!=='string'||!node.$ref.startsWith('#/$defs/'))throw Error('ASK_FINAL_SCHEMA_REF');
   const target=names.get(node.$ref.slice(8));
   if(target===undefined)throw Error('ASK_FINAL_SCHEMA_REF');
   out.$ref='#/$defs/'+target;
  }
  if(node.properties)out.properties=Object.fromEntries(Object.entries(node.properties).map(([k,v])=>[k,visit(v)]));
  if(node.anyOf)out.anyOf=node.anyOf.map(visit);
  if(node.items)out.items=visit(node.items);
  return out;
 };
 const out=visit(schema);
 if(schema.$defs)out.$defs=Object.fromEntries(Object.entries(defs).map(([name,node])=>[names.get(name),visit(node)]));
 return JSON.stringify(out).length<JSON.stringify(schema).length?out:schema;
}
