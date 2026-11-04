// Furvise Ask: provider-constrained semantic slots, with canonical server reconstruction.
// Never grant authority from the provider's JSON Schema: the pinned codec and Binder decide.
import { makeValidator } from "./ask-wire-codec.mjs";
import { RECURSIVE_TRANSPORT_LIMITS } from "./ask-wire-recursive.mjs";

const error = (code, field = null) => {
  throw new Error("ASK_DIRECT_" + code, field ? { cause: { field } } : undefined);
};
const plain = v => v !== null && typeof v === "object" && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const equal = (x,y) => JSON.stringify(x) === JSON.stringify(y);
export const DIRECT_ASK_FORMAT_VERSION = "ask-semantic-slots.v1";
const MAX = RECURSIVE_TRANSPORT_LIMITS.maxSerializedCharacters;
const nativeStructuredFields = new Set(["task", "storedRead", "recordSelection", "evidenceNeeds", "readTicket"]);

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
function buildSlotsSchema(requestSchema) {
  if (!schemaKeys(requestSchema) || requestSchema.type!=="object" || requestSchema.additionalProperties!==false
    || requestSchema.required.length < 30) error("CANONICAL_SCHEMA_DRIFT");
  const props={};const complex=[];
  for(const [key,s] of Object.entries(requestSchema.properties)) {
    if(nativeStructuredFields.has(key) || nativeScalar(s)) {
      props[key] = structuredClone(s);
      // Certain authoritative provider branches permit null for quoted-premise arrays.
      if(key==="premiseQuotes") props[key]={anyOf:[props[key],{type:"null"}]};
    } else {
      complex.push(key);
      props[key] = {
        type: nullable(s) ? ["string","null"] : "string",
        description: key === "readTicket"
          ? "If needed, JSON-serialize the complete typed ReadTicket object (all required subfields); otherwise null."
          : "If non-null, a JSON-serialized canonical value for " + key + ". Do not omit.",
      };
    }
  }
  return { schema:{type:"object",additionalProperties:false,required:requestSchema.required.slice(),properties:props}, complex };
}

/** @param {{properties?: {request?: {anyOf?: object[]}}} | null} canonicalProviderSchema */
export function createDirectSemanticAskWirePlan(wire, originalInstructions, canonicalRequestSchema, checkCompilation = () => {}, canonicalProviderSchema = null) {
  checkCompilation();
  if (typeof wire?.encode !== "function" || typeof wire?.decode !== "function"
    || typeof originalInstructions !== "string" || originalInstructions.length < 1000) error("COMPILE_CONTRACT");
  const slots=buildSlotsSchema(canonicalRequestSchema);
  const catalog={type:"object",additionalProperties:false,required:["catalogIntentJson"],
    properties:{catalogIntentJson:{type:"string",description:"Only for a source-grounded catalog intent, serialize the complete ask-catalog-intent.v1 contract."}}};
  const schema={type:"object",additionalProperties:false,required:["format","request"],
    properties:{format:{type:"string",enum:[DIRECT_ASK_FORMAT_VERSION]},
      request:{anyOf:[slots.schema,catalog]}}};
  const lines=originalInstructions.split("\n"),i=lines.indexOf("POLICY");
  if(lines.length<5 || !lines[0].includes("nodes: supporting postorder tree;")
    || !lines[1].startsWith("ROOT root.") || !lines[2].startsWith("FIELDS ")
    || i<5 || i>=lines.length-3) error("POLICY_LAYOUT");
  const instructions=[
    "Return format ask-semantic-slots.v1 and a request OBJECT following the required typed schema.",
    "Do not use graph nodes, field aliases, packed tags or speculative evidence.",
    "All request keys are mandatory. Use null/[] for inactive fields, never omit or invent.",
    "Simple strings and string arrays are native JSON values. The task, storedRead, recordSelection and readTicket fields are native objects or null. evidenceNeeds is a native array, empty when unused. Other complex objects/arrays are complete JSON strings (or null when allowed).",
    "For each complex field, serialize its complete value as valid JSON inside the outer JSON string: double-quote all keys and string values, escape inner double quotes and backslashes for the outer string, and never use comments, trailing commas, markdown, undefined or unquoted names.",
    "readTicket, when non-null, must be the complete typed ReadTicket object, not a JSON string.",
    "For a question that requires saved care notes, use mode read, evidenceBasis saved_history and the authorized pet scope. Supply the typed readTicket for the requested date and facts; use premiseQuotes [], storedRead null, and no mutation jobs. A date locating the note is not a user-supplied fact about its contents.",
    "For general conversation or a saved-record read, premiseQuotes is the native empty array []. For supplied_context, quote only facts the user actually supplied. A date or pet name used to locate a saved note is not a supplied premise.",
    "For a general or supplied-context conversation with no requested stored read, calculation, navigation or mutation: mode conversation, scope none, operation general, petNames [], readTicket null, frame null. A selected pet or an incidental name does not authorize a stored read. Preserve actual USER premises and any separately requested action; do not change evidence basis to fit a scope.",
    "For saved_profile: mode read, at least one profileFields entry, quantity null, temporalScope current or null, and scope selected/named/conversation/account. Set readTicket, storedRead, calculatePlan, mutation jobs, task, projection, recordSelection, from, to, episodeTopic, ordinal and frame to null; terms, evidenceNeeds and premiseQuotes are empty. Do not turn the request into another source domain.",
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
      request={};
      for(const k of required){
        checkRuntime();
        const v=value.request[k];
        if(slots.complex.includes(k) && v!==null){
          if(typeof v!=="string" || v.length<2 || v.length>MAX) error("FIELD_FORMAT",k);
          try { request[k]=JSON.parse(v); } catch { error("FIELD_JSON",k); }
        } else if(!slots.complex.includes(k) && (nativeStructuredFields.has(k)
          ? k==="evidenceNeeds" ? !Array.isArray(v) : v!==null && !plain(v)
          : !simpleMatches(slots.schema.properties[k],v))) error("FIELD_TYPE",k);
        else request[k]=v;
      }
    }
    // A null premise list conveys no facts, just like an empty one. Preserve
    // nonempty lists and all mutation, calculation and supplied-premise validation.
    if (request.version==="ask-request.v2" && request.premiseQuotes===null
      && (request.mode==="read" || request.mode==="conversation")
      && (request.evidenceBasis==="general" || request.evidenceBasis==="saved_history" || request.evidenceBasis==="saved_profile")
      && request.calculatePlan===null) request.premiseQuotes=[];
    boundedJsonTree(request,checkRuntime);
    checkRuntime();
    // The original canonical codec validates the resulting request before binding.
    let graph;
    try { graph=wire.encode({request}); }
    catch(e) {
      if(e instanceof Error && e.message==="ASK_WIRE_CANONICAL_SCHEMA" && request.version==="ask-request.v2") {
        const fields=invalidCanonicalFields(request,checkRuntime);
        const branches=nearestCanonicalFields(request,checkRuntime);
        if(process.env.NODE_ENV==="production")
          console.warn("[Ask semantic slots] canonical shape rejected", {branch:"semantic",invalidFields:fields,nearestBranchFields:branches});
        // Fixed schema keys only; rejected text and values never leave this boundary.
        throw new Error("ASK_WIRE_CANONICAL_SCHEMA",{cause:{invalidFields:fields,nearestBranchFields:branches}});
      }
      throw e;
    }
    checkRuntime();
    const restored=wire.decode(graph);
    checkRuntime();
    return restored;
  }

  function invalidCanonicalFields(request,checkRuntime) {
    const valid=makeValidator(canonicalRequestSchema,checkRuntime);
    return Object.entries(canonicalRequestSchema.properties)
      .filter(([key,fieldSchema])=>{checkRuntime();return !valid(fieldSchema,request[key]);})
      .map(([key])=>key);
  }

  function nearestCanonicalFields(request,checkRuntime) {
    const variants=canonicalProviderSchema?.properties?.request?.anyOf;
    if(!Array.isArray(variants)) return [];
    const valid=makeValidator(canonicalProviderSchema,checkRuntime);
    const candidates=[];
    for(const branch of variants) {
      checkRuntime();
      if(!plain(branch?.properties) || !branch.properties.version?.enum?.includes("ask-request.v2")) continue;
      const fields=Object.entries(branch.properties).filter(([key,fieldSchema]) => {
        checkRuntime(); return Object.hasOwn(canonicalRequestSchema.properties,key) && !valid(fieldSchema,request[key]);
      }).map(([key])=>key);
      candidates.push(fields);
    }
    if(!candidates.length) return [];
    const min=Math.min(...candidates.map(fields=>fields.length));
    return [...new Set(candidates.filter(fields=>fields.length===min).flat())].sort().slice(0,20);
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
      request={};
      for(const k of required) {
        const v=value.request[k];
        request[k]=slots.complex.includes(k) && v!==null ? JSON.stringify(v) : v;
      }
    }
    const result={format:DIRECT_ASK_FORMAT_VERSION,request};
    if(JSON.stringify(result).length>MAX) error("RESOURCE_LIMIT");
    decode(result,checkRuntime);
    return result;
  }
  checkCompilation();
  return Object.freeze({schema,instructions,decode,encode});
}
