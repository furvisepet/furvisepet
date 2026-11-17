// Furvise Ask: provider-constrained semantic slots, with canonical server reconstruction.
// Never grant authority from the provider's JSON Schema: the pinned codec and Binder decide.
import { RECURSIVE_TRANSPORT_LIMITS } from "./ask-wire-recursive.mjs";

const error = (code, field = null) => {
  throw new Error("ASK_DIRECT_" + code, field ? { cause: { field } } : undefined);
};
const plain = v => v !== null && typeof v === "object" && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const equal = (x,y) => JSON.stringify(x) === JSON.stringify(y);
export const DIRECT_ASK_FORMAT_VERSION = "ask-semantic-slots.v1";
const MAX = RECURSIVE_TRANSPORT_LIMITS.maxSerializedCharacters;

function boundedJsonTree(value, check) {
  let total = 0, containers = 0, chars = 0;
  const seen = new WeakSet(), lim = RECURSIVE_TRANSPORT_LIMITS;
  const walk = (node, depth) => {
    check();
    if (depth > lim.maxDepth || ++total > lim.maxValues) error("RESOURCE_LIMIT");
    if (node === null || typeof node === "boolean") { chars += JSON.stringify(node).length; return; }
    if (typeof node === "number" && Number.isFinite(node)) { chars += JSON.stringify(node).length; return; }
    if (typeof node === "string") {
      if (node.length > lim.maxStringUnits) error("STRING_LIMIT");
      chars += JSON.stringify(node).length; return;
    }
    if (typeof node !== "object" || seen.has(node)) error("NON_JSON_TREE");
    seen.add(node);
    if (++containers > lim.maxContainers) error("RESOURCE_LIMIT");
    const keys = Reflect.ownKeys(node);
    if (keys.length > lim.maxContainerEntries + 1) error("RESOURCE_LIMIT");
    if (Array.isArray(node)) {
      if (Object.getPrototypeOf(node) !== Array.prototype || keys.length !== node.length + 1
        || !keys.every(k => k === "length" || typeof k === "string"
          && /^(0|[1-9]\d*)$/.test(k) && Number(k) < node.length)) error("NON_JSON_TREE");
      for (const v of node) walk(v, depth + 1);
    } else {
      if (!plain(node)) error("NON_JSON_TREE");
      for (const k of keys) {
        if (typeof k !== "string") error("NON_JSON_TREE");
        const d = Object.getOwnPropertyDescriptor(node, k);
        if (!d?.enumerable || !Object.hasOwn(d,"value")) error("NON_JSON_TREE");
        chars += JSON.stringify(k).length;
        walk(d.value, depth + 1);
      }
    }
    if (chars > lim.maxSerializedCharacters) error("RESOURCE_LIMIT");
  };
  walk(value,0);
  check();
}

const schemaKeys = obj => plain(obj) && plain(obj.properties)
  && Array.isArray(obj.required) && equal(Object.keys(obj.properties).slice().sort(), obj.required.slice().sort());

function nativeScalar(s) {
  if (!plain(s) || Object.hasOwn(s,"anyOf") || Object.hasOwn(s,"$ref")) return false;
  const types = Array.isArray(s.type) ? s.type : [s.type];
  if (types.every(x => x === "string" || x === "null")) return true;
  if (types.length===1 && types[0]==="array"
    && plain(s.items) && s.items.type==="string" && !Object.hasOwn(s.items,"anyOf")) return true;
  return false;
}
function nullable(s) {
  if (s?.type === "null" || Array.isArray(s?.type) && s.type.includes("null")) return true;
  if (Array.isArray(s?.anyOf)) return s.anyOf.some(x => x?.type === "null");
  return false;
}
function buildSlotsSchema(requestSchema, legacyStructuralMode=false) {
  if (!schemaKeys(requestSchema) || requestSchema.type!=="object" || requestSchema.additionalProperties!==false
    || requestSchema.required.length < 30) error("CANONICAL_SCHEMA_DRIFT");
  const props={},complex=[];
  for(const [key,field] of Object.entries(requestSchema.properties)){
    if(nativeScalar(field)){
      props[key]=structuredClone(field);
      if(legacyStructuralMode && key==="premiseQuotes")props[key]={anyOf:[props[key],{type:"null"}]};

    }else{
      complex.push(key);
      props[key]={type:nullable(field)?["string","null"]:"string",
        description:key==="readTicket"
          ?"If needed, JSON-serialize the complete typed ReadTicket object (all required subfields); otherwise null."
          :"If non-null, JSON-serialize the complete canonical value for "+key+". Do not omit."};
    }
  }
  return {schema:{type:"object",additionalProperties:false,required:requestSchema.required.slice(),properties:props},complex};
}
function buildSlotVariants(contract) {
  // The exact reviewed provider contract is an anyOf of mutually restricted
  // semantic branches. Never replace it with the broader structural base schema.
  const branches=Array.isArray(contract?.anyOf)?contract.anyOf:[contract];
  const result=[],seen=new Set();
  for(const branch of branches){
    // Catalog intent is handled in its own isolated envelope below.
    if(!schemaKeys(branch)||branch.required.length<30)continue;
    const variant=buildSlotsSchema(branch,!Array.isArray(contract?.anyOf));
    const fingerprint=JSON.stringify(variant.schema);
    if(!seen.has(fingerprint)){seen.add(fingerprint);result.push(variant);}
  }
  if(!result.length)error("CANONICAL_SCHEMA_DRIFT");
  return result;
}

export function createDirectSemanticAskWirePlan(wire, originalInstructions, canonicalRequestSchema, checkCompilation = () => {}) {
  checkCompilation();
  if (typeof wire?.encode !== "function" || typeof wire?.decode !== "function"
    || typeof originalInstructions !== "string" || originalInstructions.length < 1000) error("COMPILE_CONTRACT");
  const variants=buildSlotVariants(canonicalRequestSchema);
  const slots=variants[0];
  const catalog={type:"object",additionalProperties:false,required:["catalogIntentJson"],
    properties:{catalogIntentJson:{type:"string",description:"Only for a source-grounded catalog intent, serialize the complete ask-catalog-intent.v1 contract."}}};
  const schema={type:"object",additionalProperties:false,required:["format","request"],
    properties:{format:{type:"string",enum:[DIRECT_ASK_FORMAT_VERSION]},
      request:{anyOf:[...variants.map(v=>v.schema),catalog]}}};
  const lines=originalInstructions.split("\n"),i=lines.indexOf("POLICY");
  if(lines.length<5 || !lines[0].includes("nodes: supporting postorder tree;")
    || !lines[1].startsWith("ROOT root.") || !lines[2].startsWith("FIELDS ")
    || i<5 || i>=lines.length-3) error("POLICY_LAYOUT");
  const instructions=[
    "Return format ask-semantic-slots.v1 and a request OBJECT following the required typed schema.",
    "Do not use graph nodes, field aliases, packed tags or speculative evidence.",
    "All request keys are mandatory. Use null/[] for inactive fields, never omit or invent.",
    "Simple strings and string arrays are native JSON values. Complex objects/arrays are complete JSON strings (or null when allowed).",
    "readTicket, when non-null, must be a JSON string containing the complete typed ReadTicket object.",
    "The request schema is a union of restricted branches. Choose exactly the branch matching the task: saved_profile requires nonempty profileFields and no history ticket; saved_history uses the typed readTicket; ordinary supplied/general conversation has no saved-data authority.",
    "Inactive fields must follow the chosen branch's null/empty/enum constraints, not merely the common field names.",
    "The catalogIntentJson variant is exclusively for source-grounded catalog intent. Ordinary requests use the typed " + slots.schema.required.length + "-field request.",
    "Use full canonical field names shown to the right of = in FIELDS. The POLICY $ aliases are only reading shorthand.",
    lines[2],"POLICY",...lines.slice(i+1),
  ].join("\n");

  function decode(value, checkRuntime) {
    if(typeof checkRuntime!=="function") error("RUNTIME_CHECK_REQUIRED");
    checkRuntime();
    if(!plain(value) || Object.keys(value).length!==2 || value.format!==DIRECT_ASK_FORMAT_VERSION
      || !plain(value.request)) error("ENVELOPE");
    boundedJsonTree(value,checkRuntime);
    let request;
    if(Object.keys(value.request).length===1 && Object.hasOwn(value.request,"catalogIntentJson")) {
      if(typeof value.request.catalogIntentJson!=="string") error("CATALOG_STRING");
      try { request=JSON.parse(value.request.catalogIntentJson); }
      catch { error("CATALOG_JSON"); }
      if(!plain(request) || request.version!=="ask-catalog-intent.v1") error("CATALOG_CONTRACT");
    } else {
      const fields=Object.keys(value.request),required=slots.schema.required;
      if(fields.length!==required.length || fields.some(k=>!Object.hasOwn(slots.schema.properties,k))
        || required.some(k=>!Object.hasOwn(value.request,k))) error("REQUIRED_FIELDS");
      let decoded=null;
      // Decode only a model-facing branch that accepts every scalar/null constraint.
      // The canonical codec below independently enforces nested typed objects,
      // model identity and all server-owned authorization rules.
      for(const variant of variants){
        checkRuntime();
        const candidate={};let matches=true;
        for(const k of required){
          const v=value.request[k];
          if(variant.complex.includes(k) && v!==null){
            if(typeof v!=="string"||v.length<2||v.length>MAX){matches=false;break;}
            try{candidate[k]=JSON.parse(v);}catch{matches=false;break;}
          }else if(!variant.complex.includes(k) && !simpleMatches(variant.schema.properties[k],v)){
            matches=false;break;
          }else candidate[k]=v;
        }
        if(matches){decoded=candidate;break;}
      }
      if(decoded===null)error("BRANCH_SCHEMA");
      request=decoded;
    }
    boundedJsonTree(request,checkRuntime);
    checkRuntime();
    // Original canonical codec is authoritative. No repairs, defaults, or field coercion.
    let graph;
    try { graph=wire.encode({request}); }
    catch(e) {
      if(process.env.NODE_ENV==="production" && e instanceof Error && e.message==="ASK_WIRE_CANONICAL_SCHEMA")
        console.warn("[Ask semantic slots] canonical shape rejected",
          {branch:request.version==="ask-request.v2"?"semantic":"catalog",
            complexFieldCount:slots.complex.length,
            readTicketPresent:request.readTicket!==null && request.readTicket!==undefined});
      throw e;
    }
    checkRuntime();
    const restored=wire.decode(graph);
    checkRuntime();
    return restored;
  }

  function simpleMatches(s,v) {
    if(Array.isArray(s?.anyOf)) return s.anyOf.some(item=>simpleMatches(item,v));
    const allowed=Array.isArray(s?.type)?s.type:[s?.type];
    if(v===null) return allowed.includes("null") && (!s.enum || s.enum.includes(null));
    if(typeof v==="string") return allowed.includes("string") && (!s.enum || s.enum.includes(v));
    if(Array.isArray(v)) return allowed.includes("array") && v.every(item=>simpleMatches(s.items,item))
      && (!Number.isInteger(s.maxItems) || v.length<=s.maxItems);
    return false;
  }

  function encode(value,checkRuntime) {
    if(typeof checkRuntime!=="function") error("RUNTIME_CHECK_REQUIRED");
    checkRuntime();
    if(!plain(value) || Object.keys(value).length!==1 || !plain(value.request)) error("CANONICAL_ENVELOPE");
    boundedJsonTree(value.request,checkRuntime);
    let request;
    if(value.request.version==="ask-catalog-intent.v1") request={catalogIntentJson:JSON.stringify(value.request)};
    else {
      const required=slots.schema.required;
      if(Object.keys(value.request).length!==required.length
        || required.some(k=>!Object.hasOwn(value.request,k))) error("CANONICAL_KEYS");
      // Render each reviewed branch's scalar/JSON representation and retain the
      // one that round-trips through the independent canonical graph validator.
      let candidate=null;
      for(const variant of variants){
        const encoded={};
        for(const k of required){
          const v=value.request[k];
          encoded[k]=variant.complex.includes(k)&&v!==null?JSON.stringify(v):v;
        }
        try{
          decode({format:DIRECT_ASK_FORMAT_VERSION,request:encoded},checkRuntime);
          candidate=encoded;break;
        }catch(e){
          if(!(e instanceof Error)||!e.message.startsWith("ASK_"))throw e;
        }
      }
      if(candidate===null)error("CANONICAL_BRANCH");
      request=candidate;
    }
    const result={format:DIRECT_ASK_FORMAT_VERSION,request};
    if(JSON.stringify(result).length>MAX) error("RESOURCE_LIMIT");
    decode(result,checkRuntime);
    return result;
  }
  checkCompilation();
  return Object.freeze({schema,instructions,decode,encode});
}
