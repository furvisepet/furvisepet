export function exactShare(full){
const counts=new Map(),nodes=new Map(),len=x=>JSON.stringify(x).length;
function children(s,fn){const r=structuredClone(s);if(s.properties)r.properties=Object.fromEntries(Object.entries(s.properties).map(([k,x])=>[k,fn(x)]));if(s.anyOf)r.anyOf=s.anyOf.map(fn);if(s.items)r.items=fn(s.items);return r}
function count(s){const key=JSON.stringify(s);counts.set(key,(counts.get(key)||0)+1);nodes.set(key,s);children(s,x=>{count(x);return x})}count(full);
let defs={},memo=new Map(),id=0,savings=[];
function factor(s,isRoot=false){const key=JSON.stringify(s);if(memo.has(key)&&!isRoot)return memo.get(key);const result=children(s,x=>factor(x));const n=counts.get(key),name='s'+(id).toString(36),ref={$ref:'#/$defs/'+name};const gain=(n-1)*len(result)-n*len(ref)-name.length-4;
if(!isRoot&&n>1&&gain>0){id++;defs[name]=result;memo.set(key,ref);savings.push({name,occurrences:n,expandedChars:len(s),factoredNodeChars:len(result),estimatedLocalSavings:gain,type:s.type||'anyOf',properties:Object.keys(s.properties||{})});return ref}memo.set(key,result);return result}

const result=factor(full,true);result.$defs=defs;return result;
}
