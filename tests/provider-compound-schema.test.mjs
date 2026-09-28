import test from 'node:test';
import assert from 'node:assert/strict';
import {factorProviderCompoundSchemas as factor} from '../app/lib/ai/provider-compound-schema.ts';
import Ajv from 'ajv';
import { pets, askRequestProviderSchema } from './helpers/calculation-fixture.mjs';
import { proposedSemanticFrameJsonSchema as frame } from '../app/lib/intelligence/semantic-frame/schema.ts';
import { factorProviderEnumSchemas as enums } from '../app/lib/ai/provider-enum-schema.ts';
const leaf={type:'object',additionalProperties:false,required:['v'],properties:{v:{type:['string','null'],enum:['a',null]}},description:'literal annotation'};
const pair=x=>({type:'object',additionalProperties:false,required:['a','b'],properties:{a:x,b:x}});
function expand(s){
 function go(x,stack=[]){
  if(Array.isArray(x))return x.map(v=>go(v,stack));
  if(!x||typeof x!=='object')return x;
  if(x.$ref){assert.equal(Object.keys(x).length,1);assert.ok(!stack.includes(x.$ref));const name=x.$ref.slice(8).replace(/~1/g,'/').replace(/~0/g,'~');assert.ok(Object.hasOwn(s.$defs,name));return go(s.$defs[name],[...stack,x.$ref]);}
  return Object.fromEntries(Object.entries(x).filter(([k])=>k!=='$defs').map(([k,v])=>[k,go(v,stack)]));
 }return go(s);
}
function prove(s){
 const snapshot=structuredClone(s),wire=factor(s);
 assert.deepEqual(expand(wire),expand(s));assert.equal(JSON.stringify(expand(wire)),JSON.stringify(expand(s)));assert.deepEqual(factor(wire),wire);assert.deepEqual(factor(s),wire);assert.deepEqual(s,snapshot);
 return wire;
}
test('nested compound nullable unions retain branch/property/required order',()=>{
 const s=pair({anyOf:[{type:'null'},pair(leaf)]}),w=prove(s);
 assert.deepEqual(Object.keys(expand(w).properties),['a','b']);
 assert.deepEqual(expand(w).properties.a.anyOf[1].required,['a','b']);
});
test('constraints and annotations are never merged across differences',()=>{
 const b={...leaf,description:'different',required:[]};
 const s={type:'object',properties:{a:leaf,a2:leaf,b,b2:b}},w=prove(s);
 assert.notEqual(w.properties.a.$ref,w.properties.b.$ref);
 const ajv=new Ajv({strict:false}),a=ajv.compile(s),c=ajv.compile(w);
 for(const v of [{v:'a'},{v:null},{v:'bad'},{},{v:1},{v:'a',extra:true}])
  assert.equal(a({a:v,a2:v,b:v,b2:v}),c({a:v,a2:v,b:v,b2:v}));
});
test('existing definitions, escaped names and nested refs retain identity',()=>{
 const s={...pair({type:'array',items:{$ref:'#/$defs/a~1b~0c'}}),$defs:{'a/b~c':leaf,nested:pair({$ref:'#/$defs/a~1b~0c'})}};
 prove(s);
});
test('occupied deterministic names cannot overwrite existing definitions',()=>{
 const s={...pair(leaf),$defs:{sharedSchema0:{type:'integer'},sharedSchema1:{type:'boolean'}}};
 const w=prove(s);assert.deepEqual(w.$defs.sharedSchema0,s.$defs.sharedSchema0);assert.deepEqual(w.$defs.sharedSchema1,s.$defs.sharedSchema1);
 assert.equal(w.properties.a.$ref,'#/$defs/sharedSchema2');
});
test('annotation and enum payloads remain opaque',()=>{
 const data={properties:{a:leaf,b:leaf},$ref:'not schema'};
 const s={...pair(leaf),examples:[data,data],default:data,enum:[data]};
 const w=factor(s);assert.deepEqual(w.examples,s.examples);assert.deepEqual(w.default,s.default);assert.deepEqual(w.enum,s.enum);
});
for(const [label,extra] of [
 ['external reference',{properties:{a:{$ref:'https://invalid.example/schema'}}}],
 ['interior pointer',{properties:{a:{$ref:'#/properties/b'},b:leaf}}],
 ['dynamic scope',{$id:'urn:scope'}],
 ['nested definitions',{properties:{a:{...leaf,$defs:{x:leaf}}}}],
 ['missing reference',{properties:{a:{$ref:'#/$defs/missing'}}}],
 ['existing cycle',{$defs:{cycle:{$ref:'#/$defs/cycle'}},properties:{a:{$ref:'#/$defs/cycle'}}}],
])test('unsupported '+label+' is unchanged',()=>{const s={...pair(leaf),...extra};assert.deepEqual(factor(s),s);});
test('oneOf/allOf and distinct branch order stay exact',()=>prove(pair({anyOf:[{oneOf:[leaf,{type:'null'}]},{allOf:[leaf]}]})));

for (const currentMessage of [
 'Describe the stored feeding preference.',
 'Compare recorded running intervals for both subjects.',
 'Use 7.3 meters and 420 centimeters, then subtract 19 centimeters.',
 'Show the dated account and separately the later disputed attribution.',
 'Discuss the example "save 61" without changing records.',
]) test('Ask compound factoring retains full authority: '+currentMessage,()=>{
 const context={owner:{userId:'owner'},pet:pets[0],eligiblePets:pets,currentMessage,
 conversationTurns:[],currentTurn:{id:'source',role:'user',text:currentMessage},timeZone:'UTC'};
 const original=askRequestProviderSchema(frame,context),before=enums(original),wire=prove(before);
 assert.deepEqual(expand(wire),expand(original));
 assert.deepEqual(expand(enums(wire)),expand(original));
 assert.ok(Buffer.byteLength(JSON.stringify(wire))<Buffer.byteLength(JSON.stringify(before))*.6);
 let properties=0, enumValues=0;
 function audit(node) {
  if (!node || typeof node!=='object' || Array.isArray(node)) return;
  if (node.properties) {
   properties+=Object.keys(node.properties).length;
   assert.equal(node.additionalProperties,false);
   assert.deepEqual([...node.required].sort(),Object.keys(node.properties).sort());
  }
  if (node.enum) enumValues+=node.enum.length;
  for (const key of ['properties','$defs']) for (const child of Object.values(node[key]||{})) audit(child);
  for (const key of ['anyOf','oneOf','allOf']) for (const child of node[key]||[]) audit(child);
  audit(node.items);
 }
 audit(wire);assert.ok(properties<=5000);assert.ok(enumValues<=1000);
 new Ajv({strict:false}).compile(wire);
});
