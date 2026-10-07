import { ASK_INITIAL_INPUT_AUTHORITY } from "./ask-wire-authority.mjs";
const safeTagValue=v=>typeof v==="string"&&/^[A-Za-z][A-Za-z0-9_.-]*$/.test(v)&&!["null","true","false"].includes(v);
const renderTagValue=v=>safeTagValue(v)?v:JSON.stringify(v);
import { createHash } from "node:crypto";
import { createGraphCodec, makeValidator } from "./ask-wire-codec.mjs";
import { POLICY_BUNDLE } from "./ask-wire-policy.generated.mjs";
const digest=s=>createHash("sha256").update(s,"utf8").digest("hex");
const ensure=(ok,code)=>{if(!ok)throw new Error("ASK_WIRE_POLICY_"+code);};
export function createAskWirePlan(canonicalSchema,sourceInstructions,sourceAuthority=ASK_INITIAL_INPUT_AUTHORITY,checkBudget=()=>{}){
 checkBudget();
 const authorityHashes={"inputAuthority": "31920fca662888def9d3fd799a34f979e4b080f7bd3f485d2cb5141289dcc81f", "dialogueAuthority": "7346133b3fa2177fc5478c678ba5469ce98236a9aef9bca58610c0639c737202"};
 ensure(Object.keys(sourceAuthority).length===2&&Object.entries(authorityHashes).every(([k,h])=>typeof sourceAuthority[k]==="string"&&digest(sourceAuthority[k])===h),"AUTHORITY_SOURCE_DRIFT");
 const sections=sourceInstructions.split("\n");
 ensure(sections.length===POLICY_BUNDLE.sourceHashes.length&&sections.every((s,i)=>digest(s)===POLICY_BUNDLE.sourceHashes[i]),"SOURCE_DRIFT");
 const allowed=new Set(POLICY_BUNDLE.annotationHashes);
 function annotations(x){
  checkBudget();
  if(Array.isArray(x)){x.forEach(annotations);return;}
  if(!x||typeof x!=="object")return;
  if(typeof x.description==="string")ensure(allowed.has(digest(x.description)),"UNDISPOSITIONED_ANNOTATION");
  for(const [k,v] of Object.entries(x))if(k!=="description")annotations(v);
 }
 annotations(canonicalSchema);
 const codec=createGraphCodec(canonicalSchema,checkBudget),entries=Object.entries(codec.names);
 const fields="FIELDS "+entries.map(([k,a])=>a+"="+k).join(" ");
 const tags=Object.entries(codec.constantMaps).map(([tag,constants])=>tag+" "+Object.entries(constants).map(([k,v])=>codec.names[k]+(v===null?"":"="+renderTagValue(v))).join(" ")).join("\n");
 // Long field identifiers use the same reversible dictionary as camel-case identifiers.
 // The exact inverse below checks every policy byte; no behavioral rule is removed.
 const aliases=new Map(entries.filter(([k,a])=>/^[a-z][a-zA-Z]*$/.test(k)&&k.length>a.length+1));
 const body=POLICY_BUNDLE.rules.join("\n");
 ensure(!body.includes("$"),"IDENTIFIER_MARKER");
 const keys=[...aliases.keys()].sort((a,b)=>b.length-a.length);
 const emitted=body.replace(new RegExp("\\b(?:"+keys.join("|")+")\\b","g"),k=>"$"+aliases.get(k));
 const reverse=new Map([...aliases].map(([k,a])=>[a,k]));
 ensure(emitted.replace(/\$([A-Za-z]+)/g,(_,a)=>reverse.get(a))===body,"IDENTIFIER_INVERSE");
 // Only the transport header changes; every reviewed semantic policy clause
 // and source-authority hash above remains byte-for-byte checked.
 const oldLayout="nodes: postorder tree, root last;";
 ensure(POLICY_BUNDLE.header.includes(oldLayout),"TRANSPORT_HEADER_DRIFT");
 const header=POLICY_BUNDLE.header.replace(oldLayout,"nodes: supporting postorder tree; root: required request wrapper after nodes;");
 ensure(typeof codec.names.request==="string","REQUEST_ROOT_ALIAS");
 const rootInstruction="ROOT root."+codec.names.request+" references the complete request node in nodes. Omit the wrapper from nodes; root has implicit index nodes.length.";
 const instructions=header+"\n"+rootInstruction+"\n"+fields+"\nTAGS\n"+tags+"\n"+POLICY_BUNDLE.packedHeader+"\nPOLICY\n"+emitted;
 const rootSchema=structuredClone(codec.rootSchema),rootValid=makeValidator(rootSchema,checkBudget);
 const schema=structuredClone(codec.schema);
 ensure(schema.properties.nodes.type==="array","NODES_SCHEMA");
 schema.required=["nodes","root"];
 schema.properties={nodes:{...schema.properties.nodes,minItems:0},root:rootSchema};
 function encode(value){
  const graph=codec.encode(value),root=graph.nodes.at(-1);
  ensure(rootValid(rootSchema,root),"ROOT_SCHEMA");
  return {nodes:graph.nodes.slice(0,-1),root};
 }
 function decode(value){
  ensure(value!==null&&typeof value==="object"&&!Array.isArray(value)
   &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
   &&Object.keys(value).length===2&&Object.hasOwn(value,"root")
   &&Object.hasOwn(value,"nodes")&&Array.isArray(value.nodes),"ENVELOPE");
  ensure(rootValid(rootSchema,value.root),"ROOT_SCHEMA");
  // Appending the unchanged root restores the original graph exactly. Its
  // decoder still rejects wrong child types, invalid/reused/unused edges,
  // noncanonical order, timestamp violations and canonical schema violations.
  return codec.decode({nodes:[...value.nodes,value.root]});
 }
 checkBudget();
 return {schema,rootSchema,instructions,encode,decode,compilation:codec.compilation};
}
