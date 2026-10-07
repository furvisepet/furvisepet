import { ASK_INITIAL_INPUT_AUTHORITY } from "./ask-wire-authority.mjs";
const safeTagValue=v=>typeof v==="string"&&/^[A-Za-z][A-Za-z0-9_.-]*$/.test(v)&&!["null","true","false"].includes(v);
const renderTagValue=v=>safeTagValue(v)?v:JSON.stringify(v);
import { createHash } from "node:crypto";
import { createGraphCodec } from "./ask-wire-codec.mjs";
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
 const instructions=POLICY_BUNDLE.header+"\n"+fields+"\nTAGS\n"+tags+"\n"+POLICY_BUNDLE.packedHeader+"\nPOLICY\n"+emitted;
 checkBudget();
 return {schema:codec.schema,instructions,encode:codec.encode,decode:codec.decode,compilation:codec.compilation};
}
