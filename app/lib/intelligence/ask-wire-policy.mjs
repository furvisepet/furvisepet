import { createHash } from "node:crypto";
import { createGraphCodec } from "./ask-wire-codec.mjs";
import { POLICY_BUNDLE } from "./ask-wire-policy.generated.mjs";
const digest=s=>createHash("sha256").update(s,"utf8").digest("hex");
const ensure=(ok,code)=>{if(!ok)throw new Error("ASK_WIRE_POLICY_"+code);};
export function createAskWirePlan(canonicalSchema,sourceInstructions){
 const sections=sourceInstructions.split("\n");
 ensure(sections.length===POLICY_BUNDLE.sourceHashes.length&&sections.every((s,i)=>digest(s)===POLICY_BUNDLE.sourceHashes[i]),"SOURCE_DRIFT");
 const allowed=new Set(POLICY_BUNDLE.annotationHashes);
 function annotations(x){
  if(Array.isArray(x)){x.forEach(annotations);return;}
  if(!x||typeof x!=="object")return;
  if(typeof x.description==="string")ensure(allowed.has(digest(x.description)),"UNDISPOSITIONED_ANNOTATION");
  for(const [k,v] of Object.entries(x))if(k!=="description")annotations(v);
 }
 annotations(canonicalSchema);
 const codec=createGraphCodec(canonicalSchema),entries=Object.entries(codec.names);
 const fields="FIELDS "+entries.map(([k,a])=>a+"="+k).join(" ");
 const tags=Object.entries(codec.constantMaps).map(([tag,constants])=>tag+" "+Object.entries(constants).map(([k,v])=>codec.names[k]+(v===null?"":"="+JSON.stringify(v))).join(" ")).join("\n");
 // Long field identifiers use the same reversible dictionary as camel-case identifiers.
 // The exact inverse below checks every policy byte; no behavioral rule is removed.
 const aliases=new Map(entries.filter(([k])=>/^[a-z][a-zA-Z]*$/.test(k)&&(/[A-Z]/.test(k)||k.length>=8)));
 const body=POLICY_BUNDLE.rules.join("\n");
 ensure(!body.includes("$"),"IDENTIFIER_MARKER");
 const keys=[...aliases.keys()].sort((a,b)=>b.length-a.length);
 const emitted=body.replace(new RegExp("\\b(?:"+keys.join("|")+")\\b","g"),k=>"$"+aliases.get(k));
 const reverse=new Map([...aliases].map(([k,a])=>[a,k]));
 ensure(emitted.replace(/\$([A-Za-z]+)/g,(_,a)=>reverse.get(a))===body,"IDENTIFIER_INVERSE");
 const instructions=POLICY_BUNDLE.header+"\n"+fields+"\nTAGS\n"+tags+"\n"+POLICY_BUNDLE.packedHeader+"\nPOLICY\n"+emitted;
 return {schema:codec.schema,instructions,encode:codec.encode,decode:codec.decode};
}
