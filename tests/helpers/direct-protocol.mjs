import assert from "node:assert/strict";
export const nativeKey=(plan,name)=>plan.fieldAliases?.[name]??name;
export function nativeValue(plan,value){
 if(Array.isArray(value))return value.map(item=>nativeValue(plan,item));
 if(value===null||typeof value!=="object")return value;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[nativeKey(plan,key),nativeValue(plan,item)]));
}
export function nativeSlot(plan,wire,name){
 const key=nativeKey(plan,name);
 return {key,target:Object.hasOwn(wire.request,key)?wire.request:wire.request.evidenceContext};
}
export function assertNativeSchemaField(request,name){
 const fields=request.instructions.split("\n").find(line=>line.startsWith("FIELDS ") && line.includes("="));
 const alias=fields?.slice(7).split(" ").map(pair=>pair.split("=")).find(([,field])=>field===name)?.[0];
 assert.ok(alias,"missing native field mapping for "+name);
 assert.ok(JSON.stringify(request.text.format.schema).includes(JSON.stringify(alias)),"missing native schema field "+name);
}
