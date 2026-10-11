import test from "node:test";
import assert from "node:assert/strict";
import { classifyIndexedInvalidEdge, createIndexedAskWirePlan } from "../app/lib/intelligence/ask-wire-recursive.mjs";
const oldHead='Return canonical semantic proposal in lossless wire format. nodes: supporting postorder tree; root: required request wrapper after nodes; child objects {"@":index} refer to earlier nodes. No shared/unused/forward/cyclic nodes. Fields: lexical unpacked-key order (K~T becomes K); arrays: order. _ restores listed constants only: bare key=null, key=value means that JSON value; unquoted nonreserved identifier values are literal strings. _g flattens into parent. Infer no data. POLICY $K=field alias K below; other words unchanged. All canonical schema fields/branches required; inactive fields use tagged constants. Server restores/validates before Binder; no factual/arithmetic/mutation authority.';
const oldRoot='ROOT root.F references the complete request node in nodes. Omit the wrapper from nodes; root has implicit index nodes.length.';
const semanticTail='FIELDS a=operation F=request\nTAGS\nPOLICY\nNo fabricated data, writes require authorization.';
const originalInstructions=[oldHead,oldRoot,semanticTail].join('\n');
const stub = {schema: {type:"object",required:["nodes","root"],properties: {nodes:{type:"array"},root:{type:"object",required:["F"],properties:{F:{type:"object"}}}}},instructions:originalInstructions,decode(){return{request:{}}},encode(){return{nodes:[],root:{}}}};
test("transport-only header improves reference directions without growing source budget or editing semantic policy",()=>{
 const plan=createIndexedAskWirePlan(stub,()=>{});
 assert.ok(plan.instructions.includes("zero-based postorder"));
 assert.ok(plan.instructions.includes("0<=j<i"));
 assert.ok(plan.instructions.includes("nodes[0]"));
 assert.ok(plan.instructions.includes('root.F={"@":N-1}'));
 assert.ok(plan.instructions.endsWith(semanticTail));
 assert.ok(plan.instructions.length<=originalInstructions.length);
 assert.equal(stub.instructions,originalInstructions);
});
test("invalid edge metadata classifies without repairing graph or leaking private text",()=>{
 const root=ref=>({nodes:[{q:"leaf"},{x:ref}],root:{F:{"@":1}}});
 for(const [graph,reason] of [
 [root({"@":1}),"EDGE_FORWARD_OR_SELF"],
 [root({"@":2}),"EDGE_FORWARD_OR_SELF"],
 [root({"@":99}),"EDGE_OUT_OF_RANGE"],
 [root({"@":-1}),"EDGE_NEGATIVE_REFERENCE"],
 [root({"@":"1"}),"EDGE_NONINTEGER_REFERENCE"],
 [root({text:"PRIVATE PET HISTORY"}),"EDGE_NOT_REFERENCE"],
 [{nodes:[{q:"leaf"}],root:{F:{"@":99}}},"EDGE_OUT_OF_RANGE"],
 [{nodes:[{q:"leaf"}],root:{F:{"@":0}}},"EDGE_UNCLASSIFIED"],
 ]){
  const copy=JSON.stringify(graph);const actual=classifyIndexedInvalidEdge(graph);
  assert.equal(actual,reason);assert.equal(JSON.stringify(graph),copy);assert.ok(!actual.includes("PRIVATE"));
 }
});
test("original strict decoder remains authoritative and rejects invalid child edges",()=>{
 const plan=createIndexedAskWirePlan({...stub,decode(){throw Error("ASK_WIRE_INVALID_EDGE")}},()=>{});
 for(const invalid of [
 {nodes:[{q:"leaf"},{x:{"@":1}}],root:{F:{"@":1}}},
 {nodes:[{q:"leaf"},{x:{"@":"0"}}],root:{F:{"@":1}}},
 ])assert.throws(()=>plan.decode(invalid,()=>{}),/ASK_WIRE_INVALID_EDGE/);
});