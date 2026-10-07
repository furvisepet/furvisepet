function optimizeSchema(schema,checkBudget=()=>{}){
checkBudget();
const clone=x=>JSON.parse(JSON.stringify(x)), stable=x=>JSON.stringify(sort(x));
function sort(x){checkBudget();return Array.isArray(x)?x.map(sort):x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x}
function expand(n){checkBudget();if(Array.isArray(n))return n.map(expand);if(!n||typeof n!=="object")return n;if(n.$ref)return expand(schema.$defs[n.$ref.slice(8)]);return Object.fromEntries(Object.entries(n).filter(([k])=>k!=="$defs").map(([k,v])=>[k,expand(v)]));}
const certs=[];
function without(n,keys){return Object.fromEntries(Object.entries(n).filter(([k])=>!keys.includes(k)))}
function merge(a,b){checkBudget();
if(stable(a)===stable(b))return a;
if(a.type==="array"&&b.type==="array"&&stable(without(a,["minItems","maxItems"]))===stable(without(b,["minItems","maxItems"]))){
const al=a.minItems||0,ah=a.maxItems??Infinity,bl=b.minItems||0,bh=b.maxItems??Infinity;
if(Math.max(al,bl)<=Math.min(ah,bh)+1){const out={...a};delete out.minItems;delete out.maxItems;const lo=Math.min(al,bl),hi=Math.max(ah,bh);if(lo)out.minItems=lo;if(hi<Infinity)out.maxItems=hi;certs.push({kind:"array_interval_union",a,b,out});return out;}}
if(a.enum&&b.enum&&stable(without(a,["enum"]))===stable(without(b,["enum"])))return {...a,enum:[...new Map([...a.enum,...b.enum].map(v=>[stable(v),v])).values()]};
if(a.properties&&b.properties&&stable(without(a,["properties"]))===stable(without(b,["properties"]))&&stable(Object.keys(a.properties).sort())===stable(Object.keys(b.properties).sort())){
const diff=Object.keys(a.properties).filter(k=>stable(a.properties[k])!==stable(b.properties[k]));
if(diff.length===1){const k=diff[0];const out=clone(a);out.properties[k]=walk({anyOf:[a.properties[k],b.properties[k]]});certs.push({kind:"single_field_union",field:k,a,b,out});return out;}}
return null;
}
function walk(n){checkBudget();
if(Array.isArray(n))return n.map(walk);
if(!n||typeof n!=="object")return n;
let y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,k==="required"?[...v].sort():walk(v)]));
if(Object.keys(y).length===1&&y.anyOf){let arms=y.anyOf.flatMap(a=>Object.keys(a).length===1&&a.anyOf?a.anyOf:[a]);arms=[...new Map(arms.map(a=>[stable(a),a])).values()];let change=true;while(change){change=false;outer:for(let i=0;i<arms.length;i++)for(let j=i+1;j<arms.length;j++){const m=merge(arms[i],arms[j]);if(m){arms[i]=m;arms.splice(j,1);change=true;break outer;}}}return arms.length===1?arms[0]:{anyOf:arms};}
return y;
}
const expanded=walk(expand(schema));
function factor(n){
const defs={},names={},alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function sym(i){return i<52?alphabet[i]:sym(Math.floor(i/52)-1)+alphabet[i%52];}
function visit(n,root=false){checkBudget();if(!n||typeof n!=="object"||Array.isArray(n))return n;const y=Object.fromEntries(Object.entries(n).map(([k,v])=>[k,k==="properties"?Object.fromEntries(Object.entries(v).map(([k,v])=>[k,visit(v)])):k==="anyOf"?v.map(v=>visit(v)):k==="items"?visit(v):v]));const key=stable(y);if(root||key.length<30)return y;if(!names[key]){const name=sym(Object.keys(names).length);names[key]=name;defs[name]=y;}return {$ref:"#/$defs/"+names[key]};}
let out=visit(n,true);out.$defs=defs;
while(true){const counts={};function count(n){checkBudget();if(!n||typeof n!=="object")return;if(n.$ref){const k=n.$ref.slice(8);counts[k]=(counts[k]||0)+1;}Object.values(n).forEach(count)}count(out);
const singles=new Set(Object.keys(out.$defs).filter(k=>(counts[k]||0)*(JSON.stringify(out.$defs[k]).length-JSON.stringify({$ref:"#/$defs/"+k}).length)<=JSON.stringify(out.$defs[k]).length+k.length+4));
if(!singles.size)break;const old=out.$defs;function inline(n){checkBudget();if(Array.isArray(n))return n.map(inline);if(!n||typeof n!=="object")return n;if(n.$ref&&singles.has(n.$ref.slice(8)))return inline(old[n.$ref.slice(8)]);return Object.fromEntries(Object.entries(n).map(([k,v])=>[k,inline(v)]));}out=inline(without(out,["$defs"]));out.$defs=Object.fromEntries(Object.entries(old).filter(([k])=>!singles.has(k)).map(([k,v])=>[k,inline(v)]));}
const counts={};function count(n){checkBudget();if(!n||typeof n!=="object")return;if(n.$ref){const k=n.$ref.slice(8);counts[k]=(counts[k]||0)+1;}Object.values(n).forEach(count)}count(out);
const rename=Object.fromEntries(Object.keys(out.$defs).sort((a,b)=>(counts[b]||0)-(counts[a]||0)||a.localeCompare(b)).map((k,i)=>[k,sym(i)]));
function remap(n){checkBudget();if(Array.isArray(n))return n.map(remap);if(!n||typeof n!=="object")return n;if(n.$ref)return {$ref:"#/$defs/"+rename[n.$ref.slice(8)]};return Object.fromEntries(Object.entries(n).map(([k,v])=>[k,k==="$defs"?Object.fromEntries(Object.entries(v).map(([k,v])=>[rename[k],remap(v)])):remap(v)]));}
return remap(out);
}
return {schema:factor(expanded),certificates:certs};
}
export {optimizeSchema};
