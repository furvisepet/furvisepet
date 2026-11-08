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
export const DIRECT_ASK_FORMAT_VERSION = "ask-semantic-slots.v5";
const MAX = RECURSIVE_TRANSPORT_LIMITS.maxSerializedCharacters;
const evidenceContextFields=["mode","evidenceBasis","premiseQuotes","draftAnswer","frame",
  "storedRead","readTicket","calculatePlan"];
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
// Correlate only temporal discriminants, without duplicating full ticket trees.
function ticketTemporalSchema(schema) {
  const variants=(schema.anyOf||[schema]).map(branch=>{
    if(branch.type==="null")return branch;
    const {authority,operation,temporal,...rest}=branch.properties;
    const time=(anchor,calendar=temporal.properties.calendar)=>({
      ...temporal,properties:{...temporal.properties,anchor,calendar}});
    const context=[];
    const add=(authorityValues,operations,window)=>context.push({
      type:"object",additionalProperties:false,required:["authority","operation","temporal"],
      properties:{authority:{type:"string",enum:authorityValues},
        operation:{type:"string",enum:operations},temporal:window}});
    if(authority.enum.includes("stored_report"))
      add(["stored_report"],["read"],time({type:"null"},{type:"null"}));
    if(authority.enum.includes("effective_fact")){
      const ordinary=operation.enum.filter(v=>v!=="read_since_event");
      if(ordinary.length)add(["effective_fact"],ordinary,time({type:"null"}));
      if(operation.enum.includes("read_since_event"))
        add(["effective_fact"],["read_since_event"],time({...temporal.properties.anchor,type:"object"},{type:"null"}));
    }
    return {...branch,required:[...branch.required.filter(k=>!["authority","operation","temporal"].includes(k)),"temporalContext"],
      properties:{...rest,temporalContext:{anyOf:context}}};
  });
  return {anyOf:variants};
}
function packTicket(ticket) {
  if(ticket===null)return null;
  const {authority,operation,temporal,...rest}=ticket;
  return {...rest,temporalContext:{authority,operation,temporal}};
}
function unpackTicket(ticket) {
  if(!plain(ticket) || !plain(ticket.temporalContext)
    || ["authority","operation","temporal"].some(k=>Object.hasOwn(ticket,k)))
    throw new Error("ASK_WIRE_CANONICAL_SCHEMA",{cause:{invalidFields:["readTicket"],nearestBranchFields:["readTicket"]}});
  const {temporalContext,...rest}=ticket;
  if(Object.keys(temporalContext).sort().join()!=="authority,operation,temporal")
    throw new Error("ASK_WIRE_CANONICAL_SCHEMA",{cause:{invalidFields:["readTicket"],nearestBranchFields:["readTicket"]}});
  return {...rest,...temporalContext};
}

function buildSlotsSchema(requestSchema) {
  if (!schemaKeys(requestSchema) || requestSchema.type!=="object" || requestSchema.additionalProperties!==false
    || requestSchema.required.length < 30) error("CANONICAL_SCHEMA_DRIFT");
  const props={};const complex=[];
  for(const [key,s] of Object.entries(requestSchema.properties)) {
    if(nativeStructuredFields.has(key) || nativeScalar(s)) {
      props[key] = key==="readTicket" ? ticketTemporalSchema(s) : structuredClone(s);
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

// Keep the evidence-domain/premise relationship from the canonical branches.
// Flattening these two fields independently admits combinations the codec must
// reject, wasting the only call available for independent answer review.
// This is a grammar projection, never a semantic classifier or normalization.
function evidenceSlotVariants(canonicalProviderSchema, check, sharedReadTicketSchema) {
  if(canonicalProviderSchema===null)return null;
  const variants=canonicalProviderSchema?.properties?.request?.anyOf;
  if(!Array.isArray(variants))error("CANONICAL_SCHEMA_DRIFT");
  const groups=new Map();
  for(const branch of variants){
    check();
    const p=branch?.properties;
    if(!p?.version?.enum?.includes("ask-request.v2"))continue;
    for(const assertionsAllowed of [false,true]){
      const modes=p.mode.enum.filter(mode=>assertionsAllowed
        ? ["update","mixed"].includes(mode) : !["update","mixed"].includes(mode));
      if(!modes.length)continue;
      const properties={};
      for(const key of evidenceContextFields){
        check();
        const field=key==="mode"?{...p.mode,enum:modes}
          :key==="frame"&&!assertionsAllowed?{type:"null"}:p[key];
        if(!plain(field))error("CANONICAL_SCHEMA_DRIFT");
        properties[key]=key==="readTicket"?(field.type==="null"?{type:"null"}
          :nullable(field)?sharedReadTicketSchema:{anyOf:sharedReadTicketSchema.anyOf.filter(branch=>branch.type!=="null")})
          :nativeStructuredFields.has(key)||nativeScalar(field)?structuredClone(field)
          :{type:nullable(field)?["string","null"]:"string",
            description:"Complete canonical "+key+" JSON serialized as a string when non-null."};
      }
      const key=JSON.stringify(properties);
      if(!groups.has(key))groups.set(key,{
        type:"object",additionalProperties:false,required:evidenceContextFields,properties});
    }
  }
  if(!groups.size)error("CANONICAL_SCHEMA_DRIFT");
  return [...groups.values()];
}

/** @param {{properties?: {request?: {anyOf?: object[]}}} | null} canonicalProviderSchema */
export function createDirectSemanticAskWirePlan(wire, originalInstructions, canonicalRequestSchema, checkCompilation = () => {}, canonicalProviderSchema = null) {
  checkCompilation();
  if (typeof wire?.encode !== "function" || typeof wire?.decode !== "function"
    || typeof originalInstructions !== "string" || originalInstructions.length < 1000) error("COMPILE_CONTRACT");
  const slots=buildSlotsSchema(canonicalRequestSchema);
  const catalog={type:"object",additionalProperties:false,required:["catalogIntentJson"],
    properties:{catalogIntentJson:{type:"string",description:"Only for a source-grounded catalog intent, serialize the complete ask-catalog-intent.v1 contract."}}};
  const evidenceVariants=evidenceSlotVariants(canonicalProviderSchema,checkCompilation,slots.schema.properties.readTicket);
  const evidenceSchema=evidenceVariants ? {anyOf:evidenceVariants} : null;
  const evidenceValid=evidenceSchema ? makeValidator(evidenceSchema,checkCompilation) : null;
  // Bundle only the correlated fields. Duplicating the entire request for each
  // evidence domain needlessly spends the bounded interpretation input budget.
  const requestSlotsSchema=evidenceSchema ? {
    ...slots.schema,
    required:[...slots.schema.required.filter(k=>!evidenceContextFields.includes(k)),"evidenceContext"],
    properties:{...Object.fromEntries(Object.entries(slots.schema.properties)
      .filter(([k])=>!evidenceContextFields.includes(k))),evidenceContext:evidenceSchema},
  } : slots.schema;
  const schema={type:"object",additionalProperties:false,required:["format","request"],
    properties:{format:{type:"string",enum:[DIRECT_ASK_FORMAT_VERSION]},
      request:{anyOf:[requestSlotsSchema,catalog]}}};
  const lines=originalInstructions.split("\n"),i=lines.indexOf("POLICY");
  if(lines.length<5 || !lines[0].includes("nodes: supporting postorder tree;")
    || !lines[1].startsWith("ROOT root.") || !lines[2].startsWith("FIELDS ")
    || i<5 || i>=lines.length-3) error("POLICY_LAYOUT");
  const instructions=[
    "Return format " + DIRECT_ASK_FORMAT_VERSION + " and a request OBJECT following the required typed schema.",
    "Do not use graph nodes, field aliases, packed tags or speculative evidence.",
    "All request keys are mandatory. Use null/[] for inactive fields, never omit or invent.",
    ...(evidenceSchema ? ["evidenceContext is a native typed intent/source tuple. Mode, evidence basis, premises, provisional draft, frame, storedRead, readTicket and calculatePlan belong to ONE canonical source branch. storedRead is Memory/current-state/operation-receipt only; saved care-entry history uses saved_history with readTicket. POLICY uses their canonical field names. Pure conversation must choose general with [] premises or supplied_context with exact nonempty USER premises, and include a concise provisional draft. Null evidence is not a conversation domain. Never invent premises or change intent to fit a branch."] : []),
    "Simple strings and string arrays are native JSON values. The task, storedRead, recordSelection and readTicket fields are native objects or null. evidenceNeeds is a native array, empty when unused. Other complex objects/arrays are complete JSON strings (or null when allowed).",
    "For each complex field, serialize its complete value as valid JSON inside the outer JSON string: double-quote all keys and string values, escape inner double quotes and backslashes for the outer string, and never use comments, trailing commas, markdown, undefined or unquoted names.",
    "readTicket is a native object, not a JSON string. Its temporalContext contains canonical authority, operation and temporal together. read_since_event requires a genuine event anchor; all other operations require anchor null. A concrete calendar date belongs in from/to, never an invented anchor. stored_report permits ordinary read only, without anchor or calendar selector.",
    "For a pure general or USER-supplied-context conversation, draftAnswer is a concise natural provisional answer to the whole user request based on permitted USER dialogue, preserving fictional and quoted status and all material unknowns. It is untrusted and must undergo independent review; it grants no source, mutation or factual authority. Set draftAnswer null for every other request. Preserve exact user quotations and avoid generated em dashes.",
    "The catalogIntentJson variant is exclusively for source-grounded catalog intent. Ordinary requests use the typed " + requestSlotsSchema.required.length + "-field request.",
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
      const fields=Object.keys(value.request),required=requestSlotsSchema.required;
      if(fields.length!==required.length || fields.some(k=>!Object.hasOwn(requestSlotsSchema.properties,k))
        || required.some(k=>!Object.hasOwn(value.request,k))) error("REQUIRED_FIELDS");
      let values=value.request;
      if(evidenceSchema) {
        if(!evidenceValid(evidenceSchema,values.evidenceContext)){
          const context=values.evidenceContext;
          const failures=evidenceVariants.map(branch=>Object.entries(branch.properties)
            .filter(([key,field])=>!plain(context)||!evidenceValid(field,context[key])).map(([key])=>key));
          const size=Math.min(...failures.map(fields=>fields.length));
          const hints=[...new Set(failures.filter(fields=>fields.length===size).flat())];
          throw new Error("ASK_WIRE_CANONICAL_SCHEMA",{cause:{invalidFields:[],nearestBranchFields:hints}});
        }
        const {evidenceContext,...rest}=values;
        values={...rest,...evidenceContext};
      }
      request={};
      for(const k of slots.schema.required){
        checkRuntime();
        const v=values[k];
        if(slots.complex.includes(k) && v!==null){
          if(typeof v!=="string" || v.length<2 || v.length>MAX) error("FIELD_FORMAT",k);
          try { request[k]=JSON.parse(v); } catch { error("FIELD_JSON",k); }
        } else if(!slots.complex.includes(k) && (nativeStructuredFields.has(k)
          ? k==="evidenceNeeds" ? !Array.isArray(v) : v!==null && !plain(v)
          : !simpleMatches(slots.schema.properties[k],v))) error("FIELD_TYPE",k);
        else request[k]=k==="readTicket" && v!==null ? unpackTicket(v) : v;
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
        request[k]=k==="readTicket" ? packTicket(v) : slots.complex.includes(k) && v!==null ? JSON.stringify(v) : v;
      }
    }
    if(evidenceSchema && !Object.hasOwn(request,"catalogIntentJson")) {
      const rest={...request},evidenceContext={};
      for(const key of evidenceContextFields){evidenceContext[key]=rest[key];delete rest[key];}
      request={...rest,evidenceContext};
    }
    const result={format:DIRECT_ASK_FORMAT_VERSION,request};
    if(JSON.stringify(result).length>MAX) error("RESOURCE_LIMIT");
    decode(result,checkRuntime);
    return result;
  }
  checkCompilation();
  return Object.freeze({schema,instructions,decode,encode});
}
