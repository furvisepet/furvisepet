import test from 'node:test';
import assert from 'node:assert/strict';
import {shareFinalSchema as exactShare} from '../app/lib/intelligence/ask-wire-exact-sharing.mjs';
import {expand,makeValidator} from '../app/lib/intelligence/ask-wire-codec.mjs';
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const atom={type:['string','null'],enum:['alpha','beta',null],description:'Exact nullable enum annotation preserved with every byte. '.repeat(3)};
test('final exact sharing preserves annotations, required nullable enums, arrays, tags and extra-field denial',()=>{
 const root=object({left:object({tag:{type:'string',enum:['one']},value:atom}),right:object({tag:{type:'string',enum:['two']},value:atom}),many:{type:'array',items:atom,minItems:1,maxItems:2}});
 const before=JSON.stringify(root),out=exactShare(expand(root));
 assert.deepEqual(expand(out),root);assert.equal(JSON.stringify(root),before);
 assert.ok(JSON.stringify(out).length<before.length);
 const check=makeValidator(root),after=expand(out),values=[
 {left:{tag:'one',value:null},right:{tag:'two',value:'alpha'},many:['beta']},
 {left:{tag:'two',value:null},right:{tag:'two',value:'alpha'},many:['beta']},
 {left:{tag:'one',value:'foreign'},right:{tag:'two',value:'alpha'},many:['beta']},
 {left:{tag:'one'},right:{tag:'two',value:'alpha'},many:['beta']},
 {left:{tag:'one',value:null,extra:true},right:{tag:'two',value:'alpha'},many:['beta']},
 {left:{tag:'one',value:null},right:{tag:'two',value:'alpha'},many:[]}
 ];
 for(const value of values)assert.equal(check(root,value),check(after,value));
 assert.equal(check(after,values[0]),true);for(const value of values.slice(1))assert.equal(check(after,value),false);
});
test('final sharing retains existing local reference semantics and resolves only complete valid acyclic schemas',()=>{
 const root={...object({a:{$ref:'#/$defs/x'},b:{$ref:'#/$defs/x'}}),$defs:{x:object({value:atom})}};
 assert.deepEqual(expand(exactShare(expand(root))),expand(root));
 for(const bad of [
 {...root,properties:{...root.properties,a:{$ref:'#/$defs/missing'}}},
 {...root,properties:{...root.properties,a:{$ref:'#/$defs/x',description:'unsupported sibling'}}},
 {...root,$defs:{x:{$ref:'#/$defs/x'}}},
 {...root,$defs:{x:{$ref:'#/$defs/y'},y:{$ref:'#/$defs/x'}}}
 ])assert.throws(()=>expand(bad),/SCHEMA_REF/);
 let calls=0;assert.throws(()=>expand(root,()=>{if(++calls>2)throw Error('deadline');}),/deadline/);
});

test('definition compaction preserves exact graph targets, collision names and annotation bytes',()=>{
 const root={...object({a:{$ref:'#/$defs/a'},b:{$ref:'#/$defs/long_original_name'}}),$defs:{a:object({value:atom}),long_original_name:object({value:{...atom,description:atom.description+' distinct'}})}};
 const before=JSON.stringify(root),out=exactShare(root);
 assert.deepEqual(expand(out),expand(root));assert.equal(JSON.stringify(root),before);
 const valid=makeValidator(expand(root)),value={a:{value:null},b:{value:'alpha'}};
 assert.equal(valid(expand(out),value),true);
 assert.throws(()=>expand(exactShare({...root,properties:{a:{$ref:'#/$defs/absent'}}})),/SCHEMA_REF/);
});
test('sharing visits schema positions only, retains distinct constraints, and respects cancellation',()=>{
 const literal={$ref:'literal data, never a schema edge'};
 const root=object({a:{type:'object',enum:[literal],description:'one'},b:{type:'object',enum:[literal],description:'two'},c:{type:'string',enum:['tag-one']},d:{type:'string',enum:['tag-two']}});
 const before=structuredClone(root);assert.deepEqual(exactShare(root),root);
 let checks=0;assert.throws(()=>exactShare(root,()=>{if(++checks===3)throw Error('deadline');}),/deadline/);
 assert.deepEqual(root,before);
});
