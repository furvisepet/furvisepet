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
export const DIRECT_ASK_FORMAT_VERSION = "ask-semantic-slots.v8";
const MAX = RECURSIVE_TRANSPORT_LIMITS.maxSerializedCharacters;
const minimumEvidenceContextFields=["mode","evidenceBasis","premiseQuotes","draftAnswer","frame",
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
function evidenceSlotVariants(canonicalProviderSchema, check, evidenceContextFields) {
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
        properties[key]=key==="readTicket"?(field.type==="null"?{type:"null"}:ticketTemporalSchema(field))
          :nativeStructuredFields.has(key)||nativeScalar(field)?structuredClone(field)
          :{type:nullable(field)?["string","null"]:"string",
            description:"JSON string when non-null."};
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
  // Project every branch-dependent envelope constraint together. Selecting a
  // source also selects its operation, subject scope, temporal labels, quantity
  // and inactive jobs. A hand-maintained subset reintroduces cross-branch plans
  // whenever the canonical grammar gains a new field or narrows an old one.
  const semanticBranches=canonicalProviderSchema?.properties?.request?.anyOf
    ?.filter(branch=>branch.properties?.version?.enum?.includes("ask-request.v2"));
  const evidenceContextFields=[...new Set([...minimumEvidenceContextFields,
    ...slots.schema.required.filter(key=>semanticBranches?.some(branch=>
      JSON.stringify(branch.properties[key])!==JSON.stringify(canonicalRequestSchema.properties[key])))])];
  const evidenceVariants=evidenceSlotVariants(canonicalProviderSchema,checkCompilation,evidenceContextFields);
  // A branch discriminator can carry constants exactly. They are schema
  // constants, not model-inferred evidence or permissive normalization.
  const fixedValue=field=>{
    if(field.type==="null")return {value:null};
    if(Array.isArray(field.enum)&&field.enum.length===1)return {value:field.enum[0]};
    if(field.type==="array"&&field.maxItems===0)return {value:[]};
    return null;
  };
  const sourceBranches=evidenceVariants?.map((branch,index)=>{
    const fixed={},properties={sourceBranch:{type:"string",enum:["source"+index]}};
    for(const [key,field] of Object.entries(branch.properties)){
      const constant=fixedValue(field);
      if(constant)fixed[key]=constant.value;else properties[key]=field;
    }
    properties.sourceBranch.enum[0]+=":"+Object.entries(fixed).filter(([,v])=>v!==null&&!Array.isArray(v)).map(([,v])=>v).join("/");
    return {fixed,full:branch,schema:{type:"object",additionalProperties:false,
      required:Object.keys(properties),properties}};
  });
  const evidenceSchema=sourceBranches ? {anyOf:sourceBranches.map(branch=>branch.schema)} : null;
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
  // Lossless field-name projection for native JSON only. String-serialized
  // canonical payloads retain their original names and are never rewritten.
  const names=new Set(),reserved=new Set(["format","request","evidenceContext","sourceBranch"]);
  const discover=node=>{
    if(!plain(node))return;
    if(plain(node.properties))for(const key of Object.keys(node.properties))if(!reserved.has(key))names.add(key);
    for(const [key,value] of Object.entries(node)){
      if(["properties","$defs"].includes(key)&&plain(value))Object.values(value).forEach(discover);
      else if(["anyOf","oneOf","allOf"].includes(key)&&Array.isArray(value))value.forEach(discover);
      else if(["items","additionalProperties"].includes(key))discover(value);
    }
  };
  discover(schema);
  const policyFieldLine=originalInstructions.split("\n")[2];
  const policyAliases=new Map(policyFieldLine.slice(7).split(" ").map(pair=>pair.split("=").reverse()));
  const usedAliases=new Set([...policyAliases.values(),...names,...reserved]);
  let aliasSequence=0;
  const additions=[];
  const aliases=new Map([...names].map(name=>{
    let alias=policyAliases.get(name);
    if(!alias){do{alias="n"+aliasSequence++;}while(usedAliases.has(alias));usedAliases.add(alias);additions.push(alias+"="+name);}
    return [name,alias];
  }));
  const originals=new Map([...aliases].map(([name,alias])=>[alias,name]));
  const renameSchema=node=>{
    if(!plain(node))return node;
    const out={...node};
    // Canonical compilation audits annotations and retains the complete pinned
    // POLICY. Native JSON Schema needs the asserting keywords only.
    delete out.description;
    if(plain(node.properties))out.properties=Object.fromEntries(Object.entries(node.properties).map(([key,value])=>[aliases.get(key)||key,renameSchema(value)]));
    if(Array.isArray(node.required))out.required=node.required.map(key=>aliases.get(key)||key);
    if(plain(node.$defs))out.$defs=Object.fromEntries(Object.entries(node.$defs).map(([key,value])=>[key,renameSchema(value)]));
    for(const key of ["anyOf","oneOf","allOf"])if(Array.isArray(node[key]))out[key]=node[key].map(renameSchema);
    for(const key of ["items","additionalProperties"])if(plain(node[key]))out[key]=renameSchema(node[key]);
    return out;
  };
  const renameValue=(value,reverse)=>{
    if(Array.isArray(value))return value.map(item=>renameValue(item,reverse));
    if(!plain(value))return value;
    const out=Object.create(null);
    for(const [key,item] of Object.entries(value)){
      if(reverse&&aliases.has(key)&&!reserved.has(key))
        throw new Error("ASK_WIRE_CANONICAL_SCHEMA",{cause:{invalidFields:Object.hasOwn(canonicalRequestSchema.properties,key)?[key]:[],nearestBranchFields:Object.hasOwn(canonicalRequestSchema.properties,key)?[key]:[]}});
      const mapped=(reverse?originals:aliases).get(key)||key;
      if(Object.hasOwn(out,mapped))throw new Error("ASK_WIRE_CANONICAL_SCHEMA");
      out[mapped]=renameValue(item,reverse);
    }
    return out;
  };
  const providerSchema=renameSchema(schema);
  const lines=originalInstructions.split("\n"),i=lines.indexOf("POLICY");
  if(lines.length<5 || !lines[0].includes("nodes: supporting postorder tree;")
    || !lines[1].startsWith("ROOT root.") || !lines[2].startsWith("FIELDS ")
    || i<5 || i>=lines.length-3) error("POLICY_LAYOUT");
  const instructions=[
    "Return "+DIRECT_ASK_FORMAT_VERSION+" native JSON. Pick one sourceBranch, restoring only its schema constants and inactive null/[] fields. Emit all required keys. Preserve USER intent; invent no evidence.",
    "FIELDS aliases apply recursively to native keys without POLICY $. Keep format/request/evidenceContext/sourceBranch literal. Never alias string values or serialized JSON keys. Complex string fields are complete canonical JSON: double-quoted and escaped, no markdown/comments/omissions/undefined.",
    "readTicket is native JSON; temporalContext binds authority/operation/temporal. Genuine event anchor iff read_since_event; calendar dates use from/to. stored_report quotes recorded wording, ordinary read only; effective_fact reads settled truth. Saved care entries use saved_history/readTicket; storedRead only Memory/current state/receipts.",
    "conversation requires general or exact USER supplied_context premises and a concise untrusted draftAnswer for independent review; other branches draftAnswer=null. Preserve literal quotes/status; invent no evidence.",
    "catalogIntentJson encodes only complete source-grounded ask-catalog-intent.v1. Other requests use native schema.",
    lines[2]+(additions.length?" "+additions.join(" "):""),"POLICY",...lines.slice(i+1),
  ].join("\n");

  function decode(value, checkRuntime) {
    if(typeof checkRuntime!=="function") error("RUNTIME_CHECK_REQUIRED");
    checkRuntime();
    if(!plain(value) || Object.keys(value).length!==2 || value.format!==DIRECT_ASK_FORMAT_VERSION
      || !plain(value.request)) error("ENVELOPE");
    boundedJsonTree(value,checkRuntime);
    value=renameValue(value,true);
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
          const selected=sourceBranches.find(branch=>branch.schema.properties.sourceBranch.enum[0]===context?.sourceBranch);
          const candidates=selected?[selected.schema]:sourceBranches.map(branch=>branch.schema);
          const failures=candidates.map(branch=>[
            ...Object.entries(branch.properties).filter(([key,field])=>!plain(context)||!evidenceValid(field,context[key])).map(([key])=>key),
            ...Object.keys(plain(context)?context:{}).filter(key=>!Object.hasOwn(branch.properties,key))
          ].filter(key=>Object.hasOwn(canonicalRequestSchema.properties,key)));
          const size=Math.min(...failures.map(fields=>fields.length));
          const hints=[...new Set(failures.filter(fields=>fields.length===size).flat())];
          throw new Error("ASK_WIRE_CANONICAL_SCHEMA",{cause:{invalidFields:[],nearestBranchFields:hints}});
        }
        const {evidenceContext,...rest}=values;
        const branch=sourceBranches.find(branch=>branch.schema.properties.sourceBranch.enum[0]===evidenceContext.sourceBranch);
        const {sourceBranch,...emitted}=evidenceContext;
        values={...rest,...structuredClone(branch.fixed),...emitted};
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
      const valid=makeValidator({anyOf:evidenceVariants},checkRuntime);
      const branch=sourceBranches.find(branch=>valid(branch.full,evidenceContext));
      if(!branch)throw new Error("ASK_WIRE_CANONICAL_SCHEMA");
      const projected={sourceBranch:branch.schema.properties.sourceBranch.enum[0]};
      for(const key of Object.keys(branch.schema.properties))if(key!=="sourceBranch")projected[key]=evidenceContext[key];
      request={...rest,evidenceContext:projected};
    }
    const result=renameValue({format:DIRECT_ASK_FORMAT_VERSION,request},false);
    if(JSON.stringify(result).length>MAX) error("RESOURCE_LIMIT");
    decode(result,checkRuntime);
    return result;
  }
  checkCompilation();
  return Object.freeze({schema:providerSchema,instructions,decode,encode,fieldAliases:Object.freeze(Object.fromEntries(aliases))});
}
