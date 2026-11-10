import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { compileGraphCodec, createGraphCodec, expand, makeValidator } from "../app/lib/intelligence/ask-wire-codec.mjs";
registerHooks({ resolve(s,c,next) {
 if(s==="server-only") return {url:"data:text/javascript,export {}",shortCircuit:true};
 if(s.startsWith(".")&&c.parentURL?.startsWith("file:")) for(const suffix of [".ts","/index.ts"]) {
  const url=new URL(s+suffix,c.parentURL);if(existsSync(url))return next(url.href,c);
 }
 return next(s,c);
}});
globalThis.fetch=async()=>{throw Error("OFFLINE_ROOT_ENVELOPE");};
const { prepareAskInterpretationRequest }=await import("../app/lib/intelligence/interpret-ask.ts");
const { createAskProviderWireSchema }=await import("../app/lib/intelligence/ask-wire-provider-schema.ts");
const { askRequestProviderSchema, ASK_REQUEST_INSTRUCTIONS }=await import("../app/lib/intelligence/ask-request-contract.ts");
const { proposedSemanticFrameJsonSchema }=await import("../app/lib/intelligence/semantic-frame/schema.ts");
const { factorProviderEnumSchemas }=await import("../app/lib/ai/provider-enum-schema.ts");
const { factorProviderCompoundSchemas }=await import("../app/lib/ai/provider-compound-schema.ts");
const { createAskWirePlan }=await import("../app/lib/intelligence/ask-wire-policy.mjs");
const corpus=JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json",import.meta.url),"utf8"));
const prepared=prepareAskInterpretationRequest(corpus.contexts.no_numeric,"gpt-5.4-mini");
const plan=prepared.wire;
// Recorded vectors stay immutable; construct the current required nullable field.
const canonical=structuredClone(corpus.fixtures.find(f=>f.context==="no_numeric"&&f.canonical.request.evidenceBasis==="saved_profile").canonical);
canonical.request.draftAnswer=null;
const wire=plan.encode(canonical);
const providerSchema=expand(createAskProviderWireSchema(plan.schema)),providerValid=makeValidator(providerSchema);
const legacy=createGraphCodec(factorProviderCompoundSchemas(factorProviderEnumSchemas(askRequestProviderSchema(proposedSemanticFrameJsonSchema,prepared.context))));
const oldSchema=expand(createAskProviderWireSchema(legacy.schema)),oldValid=makeValidator(oldSchema);

test("compiled root schema follows the compiler aliases, including reordered fields",()=>{
 const schema={type:"object",additionalProperties:false,required:["request"],properties:{request:{
  type:"object",additionalProperties:false,required:["value"],properties:{value:{type:"string"}}
 }}};
 for(const order of [["request","value"],["value","request"]]) {
  const codec=compileGraphCodec(schema,order),graph=codec.encode({request:{value:"exact 🐾 cafe\u0301"}});
  assert.ok(codec.rootSchema,"compiler must expose the packed root schema");
  const rootSchema=expand(codec.rootSchema),valid=makeValidator(rootSchema);
  assert.deepEqual(Object.keys(rootSchema.properties),[codec.names.request]);
  assert.ok(valid(rootSchema,graph.nodes.at(-1)));
  assert.equal(valid(rootSchema,graph.nodes[0]),false);
  assert.deepEqual(codec.decode(graph),{request:{value:"exact 🐾 cafe\u0301"}});
 }
});
test("original canonical plan requires the compiled request root separately from supporting nodes",()=>{
 assert.deepEqual([...plan.schema.required].sort(),["nodes","root"]);
 assert.equal(plan.schema.additionalProperties,false);
 assert.deepEqual(Object.keys(plan.schema.properties),["nodes","root"]);
 assert.deepEqual(Object.keys(wire),["nodes","root"]);
 assert.deepEqual(plan.schema.properties.root,legacy.rootSchema);
 assert.equal(plan.rootSchema.properties[legacy.names.request].type,"object");
 assert.deepEqual(plan.rootSchema.properties[legacy.names.request].required,["@"]);
 assert.deepEqual(wire,{root:legacy.encode(canonical).nodes.at(-1),nodes:legacy.encode(canonical).nodes.slice(0,-1)});
 assert.ok(providerValid(providerSchema,wire));
 assert.deepEqual(plan.decode(JSON.parse(JSON.stringify(wire))),canonical);
 assert.ok(plan.instructions.includes("root."+legacy.names.request));
 assert.equal(plan.instructions.includes("root last"),false);
});
test("missing roots, wrong node roots, direct canonical payloads and extra envelope keys fail closed",()=>{
 const leaf=legacy.encode(canonical).nodes[0];
 assert.ok(oldValid(oldSchema,{nodes:[leaf]}),"old provider grammar accepts a non-root leaf");
 assert.throws(()=>legacy.decode({nodes:[leaf]}),/ASK_WIRE_COMPACT_SCHEMA/);
 for(const bad of [
  {nodes:wire.nodes},{root:null,nodes:wire.nodes},{root:leaf,nodes:[]},
  {root:canonical,nodes:[]},canonical,{...wire,extra:true},
  {root:wire.root,nodes:null},{root:wire.root,nodes:[]}
 ]) {
  assert.throws(()=>plan.decode(bad),/ASK_WIRE/);
 }
 assert.equal(providerValid(providerSchema,{nodes:wire.nodes}),false);
 assert.equal(providerValid(providerSchema,{root:leaf,nodes:[]}),false);
 assert.equal(providerValid(providerSchema,{...wire,extra:true}),false);
});
test("schema-valid root references to the wrong child type retain compact-schema rejection",()=>{
 const leaf=legacy.encode(canonical).nodes[0];
 const bad={root:{[legacy.names.request]:{"@":0}},nodes:[leaf]};
 assert.ok(providerValid(providerSchema,bad),"provider references cannot prove child type");
 assert.throws(()=>plan.decode(bad),/ASK_WIRE_COMPACT_SCHEMA/);
});
test("invalid root references, unreachable nodes, reused nodes and noncanonical order stay rejected",()=>{
 const key=legacy.names.request;
 for(const index of [-1,0.5,true,wire.nodes.length,wire.nodes.length+1]) {
  const bad=structuredClone(wire);bad.root[key]={"@":index};
  assert.throws(()=>plan.decode(bad),/ASK_WIRE/);
 }
 const unreachable=structuredClone(wire);unreachable.nodes.push(structuredClone(wire.nodes[0]));
 assert.ok(providerValid(providerSchema,unreachable));assert.throws(()=>plan.decode(unreachable),/UNREACHABLE_NODES/);
 const edges=[];
 function collect(value,path=[]) {
  if(!value||typeof value!=="object")return;
  if(Object.keys(value).length===1&&Object.hasOwn(value,"@"))edges.push({path,index:value["@"]});
  else for(const [k,v]of Object.entries(value))collect(v,[...path,k]);
 }
 collect(wire);
 assert.ok(edges.length>2);
 const bad=structuredClone(wire),target=edges.find(e=>e.index>0&&e.path[0]==="nodes");
 assert.ok(target);
 let parent=bad;for(const key of target.path.slice(0,-1))parent=parent[key];
 parent[target.path.at(-1)]={"@":0};
 assert.throws(()=>plan.decode(bad),/ASK_WIRE/);
 // Renumber two independent leaves and all edges: valid tree, same canonical
 // data, but not the canonical postorder emitted by the codec.
 const leaves=wire.nodes.map((n,i)=>({n,i})).filter(({n})=>!JSON.stringify(n).includes('"@":'));
 assert.ok(leaves.length>=2);
 const [a,b]=leaves.slice(0,2).map(x=>x.i),reordered=structuredClone(wire);
 [reordered.nodes[a],reordered.nodes[b]]=[reordered.nodes[b],reordered.nodes[a]];
 function remap(v){if(!v||typeof v!=="object")return;if(Object.hasOwn(v,"@")){if(v["@"]===a)v["@"]=b;else if(v["@"]===b)v["@"]=a;}else Object.values(v).forEach(remap);}
 remap(reordered);
 assert.ok(providerValid(providerSchema,reordered));
 assert.throws(()=>plan.decode(reordered),/ASK_WIRE_(?:INVALID_EDGE|NONCANONICAL_WIRE)/);
});
test("current canonical families round-trip while archived cross-branch conflicts fail closed",()=>{
 // These are explicit contract contradictions, not validity inferred from the
 // decoder under test. Old codec-shape vectors include deliberately mixed
 // domains and are no longer all legal provider proposals.
 const span=(from,to)=>Array.from({length:to-from+1},(_,i)=>from+i);
 const conflicts=[
  {indices:span(4,11),why:"supplied conversation has no quoted premise and carries correction intent",matches:r=>r.mode==="conversation"&&r.evidenceBasis==="supplied_context"&&r.premiseQuotes.length===0&&r.mutationIntent==="correct_record"},
  {indices:[...span(12,19),...span(26,32)],why:"plain saved-history read carries correction intent",matches:r=>r.mode==="read"&&r.evidenceBasis==="saved_history"&&r.mutationIntent==="correct_record"},
  {indices:[20,21,22],why:"correction/conversation mode has neither a read ticket nor a bound mutation",matches:r=>["conversation","update","mixed"].includes(r.mode)&&r.readTicket===null&&r.writeJob===null&&r.appendJob===null&&r.mutationIntent==="correct_record"},
  {indices:[24,25,37,38],why:"historical episode recall/correction has no saved-evidence domain",matches:r=>r.mode==="read"&&["general",null].includes(r.evidenceBasis)&&r.operation==="recall"&&r.quantity==="episodes"&&r.temporalScope==="historical"&&r.mutationIntent==="correct_record"},
  {indices:[33,34],why:"conversation/update mode carries an executable history read",matches:r=>["conversation","update"].includes(r.mode)&&r.readTicket!==null},
  {indices:[39],why:"plain history read carries correction intent without a frame",matches:r=>r.mode==="read"&&r.readTicket!==null&&r.mutationIntent==="correct_record"&&r.frame===null}
 ];
 const validIndices=new Set([0,1,2,3,23,35,36,40,41,42]);
 let accepted=0,rejected=0,total=0;
 for(const[index,fixture]of corpus.fixtures.entries()){
  if(fixture.context!=="no_numeric")continue;
  total++;const current=structuredClone(fixture.canonical);current.request.draftAnswer=null;
  const conflict=conflicts.find(rule=>rule.indices.includes(index));
  if(conflict){
   assert.ok(conflict.matches(current.request),"Archived fixture "+index+" changed: "+conflict.why);
   assert.throws(()=>legacy.encode(current),/ASK_WIRE_CANONICAL_SCHEMA/,"Fixture "+index+": "+conflict.why);
   assert.throws(()=>plan.encode(current),/ASK_WIRE_CANONICAL_SCHEMA/,"Fixture "+index+": "+conflict.why);
   rejected++;continue;
  }
  assert.ok(validIndices.has(index),"Unclassified recorded vector "+index);
  const graph=legacy.encode(current),encoded=plan.encode(current);
  assert.deepEqual(encoded,{root:graph.nodes.at(-1),nodes:graph.nodes.slice(0,-1)});
  assert.ok(providerValid(providerSchema,encoded));
  assert.deepEqual(plan.decode(encoded),current);
  assert.deepEqual(plan.encode(plan.decode(encoded)),encoded);accepted++;
 }
 assert.deepEqual({accepted,rejected,total},{accepted:10,rejected:33,total:43});
 assert.deepEqual(corpus.fixtures,JSON.parse(readFileSync(new URL("./fixtures/ask-wire-codec.json",import.meta.url),"utf8")).fixtures);
});
test("provider projection checkpoints remain bounded and detached from decoder lifetime",()=>{
 let checks=0;const expired=Error("TEST_COMPILATION_EXPIRED");
 assert.throws(()=>createAskProviderWireSchema(plan.schema,()=>{if(++checks===5)throw expired;}),e=>e===expired);
 let live=true;
 const p=createAskWirePlan(askRequestProviderSchema(proposedSemanticFrameJsonSchema,prepared.context),ASK_REQUEST_INSTRUCTIONS,undefined,()=>{if(!live)throw expired;});
 const encoded=p.encode(canonical);live=false;
 assert.deepEqual(p.decode(encoded),canonical);
});

test("production interpreter rejects bad roots before Binder, repair or catalog authority",async t=>{
 t.mock.method(console,"info",()=>{});t.mock.method(console,"warn",()=>{});
 const { interpretAskQuestion }=await import("../app/lib/intelligence/interpret-ask.ts");
 const { admitAiOperation }=await import("../app/lib/ai/usage-guard/admission.ts");
 const { MemoryAiGuardTestStore }=await import("../app/lib/ai/usage-guard/memory-test-store.ts");
 const env={NODE_ENV:"test",FURVISE_AI_DAILY_CALL_LIMIT:"20",FURVISE_AI_DAILY_COST_LIMIT_USD:"10",FURVISE_RATE_LIMIT_HASH_SECRET:"offline-root-envelope-secret-32-bytes"};
 const prior=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;
 try {
  const leaf=legacy.encode(canonical).nodes[0];
  for(const [i,bad]of [
   {nodes:wire.nodes},{root:leaf,nodes:[]},
   {root:{[legacy.names.request]:{"@":0}},nodes:[leaf]},
   {root:wire.root,request:canonical.request}
  ].entries()) {
   const a=await admitAiOperation({env,store:new MemoryAiGuardTestStore(),feature:"ask",intendedModel:"gpt-5.4-mini",
    now:new Date("2039-03-17T12:00:00Z"),requestId:"bad-root-"+i,userId:prepared.context.owner.userId,payload:{fixture:"bad-root-"+i}});
   let calls=0,authority=0,snapshot;const events=[],begin=a.beginProviderCall.bind(a);
   a.beginProviderCall=async input=>{snapshot=JSON.stringify(input.input);return begin(input);};
   try {
    await assert.rejects(a.run(()=>interpretAskQuestion({context:corpus.contexts.no_numeric,model:"gpt-5.4-mini",
     onProviderEvent:e=>events.push(e),catalogService:{requestId:"bad-root",capability:()=>{authority++;throw Error("UNEXPECTED_AUTHORITY");},
      verify:async()=>{authority++;throw Error("UNEXPECTED_VERIFY");},hydrate:async()=>{authority++;throw Error("UNEXPECTED_HYDRATE");}},
     client:{responses:{create:async request=>{
      calls++;assert.equal(JSON.stringify(request),snapshot);assert.ok(Object.isFrozen(request));
      assert.deepEqual(request.text.format.schema,prepared.request.text.format.schema);
      assert.equal(request.max_output_tokens,prepared.request.max_output_tokens);assert.deepEqual(request.reasoning,{effort:"none"});
      return {status:"completed",output_text:JSON.stringify(bad),usage:{input_tokens:10,output_tokens:10}};
     }}}
    })),e=>e.diagnostics?.providerErrorCode==="ASK_INTERPRETATION_JSON");
    assert.equal(calls,1);assert.equal(authority,0);
    assert.equal(events.filter(e=>e.outcome==="succeeded").length,0);
   }finally{await a.release();}
  }
 }finally{if(prior===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=prior;}
});
