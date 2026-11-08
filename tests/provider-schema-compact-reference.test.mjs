import test from "node:test";
import assert from "node:assert/strict";
import {factorProviderCompoundSchemas,compactProviderSchemaReferences} from "../app/lib/ai/provider-compound-schema.ts";
function expanded(schema){
 const defs=schema.$defs||{};
 function walk(node){
  if(!node||typeof node!=="object"||Array.isArray(node))return node;
  if(Object.hasOwn(node,"$ref"))return walk(defs[node.$ref.slice(8)]);
  const result={...node};delete result.$defs;
  if(node.properties)result.properties=Object.fromEntries(Object.entries(node.properties).map(([k,v])=>[k,walk(v)]));
  if(node.anyOf)result.anyOf=node.anyOf.map(walk);
  if(node.items)result.items=walk(node.items);
  return result;
 }
 return walk(schema);
}
test("final provider compaction preserves all expanded constraints, annotations and literal enum data",()=>{
 const field={type:"string",minLength:1,maxLength:80,description:"A deliberately repeated long scalar annotation that must be retained exactly."};
 const schema={type:"object",additionalProperties:false,required:["one","two","literal"],properties:{
  one:field,two:structuredClone(field),literal:{enum:[{"$ref":"literal data, never a schema reference"}]}}};
 const original=structuredClone(schema);
 const compact=compactProviderSchemaReferences(factorProviderCompoundSchemas(schema,()=>{},true));
 assert.deepEqual(expanded(compact),schema);
 assert.deepEqual(schema,original);
 assert.deepEqual(expanded(compact).properties.literal.enum,[{"$ref":"literal data, never a schema reference"}]);
 assert.ok(Object.keys(compact.$defs).every(key=>/^r[0-9]+$/.test(key)));
});
test("unknown reference scope and nested definitions remain unchanged",()=>{
 for(const schema of [
  {$defs:{longName:{type:"string"}},$ref:"https://example.invalid/external"},
  {$defs:{longName:{type:"string"}},type:"object",properties:{nested:{$defs:{inner:{type:"string"}},$ref:"#/$defs/inner"}}}
 ])assert.deepEqual(compactProviderSchemaReferences(schema),schema);
});
