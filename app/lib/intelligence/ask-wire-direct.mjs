import{compileSingletonTransport,SINGLETON_TRANSPORT_LEGEND}from './ask-wire-singletons.mjs';
import {compileReadCompositionTransport,READ_COMPOSITION_LEGEND,consolidateReadPropositionGuidance} from './ask-wire-read-composition.mjs';
import {compileSubjectStateTransport,SUBJECT_STATE_WIRE_LEGEND} from './ask-wire-subject-state.mjs';
import {compileOrderingTransport} from './ask-wire-ordering.mjs';
import {compileReadTicketTransport,inlineTaggedTicketUnionReferences,inlineSingleSchemaReferences} from './ask-wire-read-ticket.mjs';
import {capturePreviewEvidence} from './ask-preview-capture.mjs';
import {compileOperationWire} from "./ask-wire-operation-choice.mjs";
import {makeValidator as catalogValidator} from "./ask-wire-codec.mjs";
import {correlateCatalog} from "./ask-wire-catalog-correlations.mjs";
import {exactShare} from "./ask-wire-exact-sharing.mjs";
import {createAskProviderWireSchema} from "./ask-wire-provider-schema.ts";
// Furvise Ask: provider-constrained semantic slots, with canonical server reconstruction.
// Never grant authority from the provider's JSON Schema: the pinned codec and Binder decide.
import { expand, makeValidator } from "./ask-wire-codec.mjs";
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
function canonicalFieldSchema(root, field) {
  const alternatives = root?.properties?.request?.anyOf;
  if (!Array.isArray(alternatives)) error("CANONICAL_SCHEMA_DRIFT");
  const variants = [];
  for (const alternative of alternatives) {
    const s = alternative?.properties?.[field];
    if (!s) {
      if (alternative?.properties?.version?.enum?.includes("ask-catalog-intent.v1")) continue;
      error("CANONICAL_SCHEMA_DRIFT");
    }
    if (field === "evidenceNeeds" && (s.type !== "array" || !plain(s.items))) error("CANONICAL_SCHEMA_DRIFT");
    if (!variants.some(v => equal(v,s))) variants.push(structuredClone(s));
  }
  if (!variants.length) error("CANONICAL_SCHEMA_DRIFT");
  return variants.length === 1 ? variants[0] : { anyOf: variants };
}

function buildSlotsSchema(requestSchema, typedSchemas) {
  if (!schemaKeys(requestSchema) || requestSchema.type!=="object" || requestSchema.additionalProperties!==false
    || requestSchema.required.length < 30) error("CANONICAL_SCHEMA_DRIFT");
  const props={};const complex=[];
  for(const [key,s] of Object.entries(requestSchema.properties)) {
    if(Object.hasOwn(typedSchemas,key)) { props[key]=structuredClone(typedSchemas[key]); }
    else if(nativeScalar(s)) {
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


function hoistSavedHistoryGuidance(schema) {
 const out=structuredClone(schema),groups=new Map(),prefixes=['For saved_history,','A root calculation uses'];
 function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return;}if(typeof n.description==='string'){const p=prefixes.find(x=>n.description.startsWith(x));if(p){if(groups.has(p)&&groups.get(p)!==n.description)error('GUIDANCE_DRIFT');groups.set(p,n.description);delete n.description;}}for(const v of Object.values(n))visit(v);}
 visit(out);out.description=[out.description,...groups.values()].filter(Boolean).join(' ');return out;
}

// Pure annotation transport. Constraints and every annotation's position/bytes are retained.
export function compileDescriptionAliases(original){
 const schema=structuredClone(original),counts=new Map();
 function visit(v,fn){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(x=>visit(x,fn));return;}fn(v);for(const[k,x]of Object.entries(v))if(k!=='description')visit(x,fn);}
 visit(schema,v=>{if(typeof v.description==='string')counts.set(v.description,(counts.get(v.description)||0)+1);});
 const aliases={};let index=0;
 for(const[text,n]of counts)if(n>1&&text.length>30){
  const code='@'+String.fromCharCode(97+index);
  if(index>=26||counts.has(code))error('DESCRIPTION_ALIAS_COLLISION');
  if((n-1)*text.length<=n*code.length+code.length+5)continue;
  aliases[code]=text;index++;
 }
 const reverse=new Map(Object.entries(aliases).map(([k,v])=>[v,k]));
 visit(schema,v=>{if(reverse.has(v.description))v.description=reverse.get(v.description);});
 const expanded=structuredClone(schema);visit(expanded,v=>{if(Object.hasOwn(aliases,v.description))v.description=aliases[v.description];});
 if(JSON.stringify(expanded)!==JSON.stringify(original))error('DESCRIPTION_ALIAS_INVERSE');
 const legend=Object.keys(aliases).length?'Schema description codes (expand exactly): '+Object.entries(aliases).map(([k,v])=>k+'='+v).join('\n'):'';
 return {schema,aliases,legend,expanded};
}

export function createDirectSemanticAskWirePlan(wire, originalInstructions, canonicalRequestSchema, checkCompilation = () => {}, canonicalEnvelopeSchema, timeZone = '') {
 checkCompilation();
 if(typeof wire?.encode!=="function"||typeof wire?.decode!=="function")error("COMPILE_CONTRACT");
 const root=correlateCatalog(expand(canonicalEnvelopeSchema));
 const operationWire=compileOperationWire(root);
 const ticketWire=compileReadTicketTransport(exactShare(createAskProviderWireSchema(operationWire.schema,checkCompilation)),timeZone);
 const orderingWire=compileOrderingTransport(ticketWire.schema);
 const subjectStateWire=compileSubjectStateTransport(orderingWire.schema);
 const ticketMeanings=new Map([...ticketWire.entries.values()].flatMap(e=>e.variants.map(v=>{const a=v.source.properties.authority.enum;if(a.length!==1)error('TICKET_MEANING_NOT_FIXED');return[v.tag,a[0]];})));const compositionWire=compileReadCompositionTransport(subjectStateWire.schema,ticketMeanings);
 const sourceSchema=hoistSavedHistoryGuidance(inlineSingleSchemaReferences(inlineTaggedTicketUnionReferences(compositionWire.schema)));const singletonWire=compileSingletonTransport(sourceSchema,checkCompilation);const descriptions=compileDescriptionAliases(singletonWire.schema),schema=descriptions.schema;
 const lines=originalInstructions.split(/\n|\\n/),fieldLine=lines.find(x=>x.startsWith("FIELDS ")),i=lines.indexOf("POLICY");
 if(!fieldLine||i<0)error("POLICY_LAYOUT");
 const names=new Map([...fieldLine.matchAll(/([A-Za-z]+)=([A-Za-z0-9_]+)/g)].map(m=>[m[1],m[2]]));
 const policy=lines.slice(i+1).join("\n").replace(/\$([A-Za-z]+)\b/g,(all,key)=>{if(!names.has(key))error("POLICY_ALIAS");return names.get(key)});
 const initialInstructions=descriptions.legend+"\n"+SINGLETON_TRANSPORT_LEGEND+"\n"+ticketWire.legend+"\n"+READ_COMPOSITION_LEGEND+"\n"+SUBJECT_STATE_WIRE_LEGEND+"\n"+"Choose the explicit operation family in request.kind and supply exactly its typed semantic arguments. Fixed canonical values are reconstructed from that choice, never inferred from the question. Complex values are native objects and arrays. Do not mix read and write intentions, invent missing intent or evidence, or supply authenticated identity. Server validation and confirmation remain authoritative. Use clarification when meaning is unresolved. ReadTicket probe temporal contract: probes[].from and probes[].to are null or valid full ISO timestamps containing a date and time, never date-only or month-only strings. Preserve the requested calendar meaning and the supplied user timezone when expressing grounded interval boundaries; do not invent an unsupported time or timezone, and clarify unresolved temporal meaning. A non-null from must precede a non-null to. The separate probes[].target may be an explicit ISO day or month only when its from/to match that complete UTC calendar window under the existing target contract; otherwise target is null and the intended grounded interval remains in from/to. Do not shift a local-time window merely to populate target. Server temporal validation remains authoritative. ReadTicket operation is read_since_event if and only if temporal.anchor is non-null; ordinary read, compare and rank require a null anchor. Catalog receipts are evidence about prior write/action outcomes (whether a save, correction, deletion or other recorded operation succeeded), not the contents of a saved care note. Choose catalog_receipt_subjects or catalog_receipt_owner_receipt only when that operational receipt is requested and its reference must be selected from the catalog. Reading what records report uses stored_report: attributed recorded statements, whether quotation or reported contents is requested. effective_fact instead asks what is currently settled/corrected or a historical calculation; a stored statement never certifies that truth. Both remain legal explicit choices. A request to read something saved does not itself ask for an operation receipt. Keep actual requested formatting and companions; unsupported catalog combinations remain limited, never drop them or change the chosen operation to pass validation. Each orderBy item is one explicit field:direction enum choice; reconstruct its exact canonical field/direction record from that choice. For read branches, subjectStateRequirement is the requested active-state precondition, not a report of the profile's current state: choose none for a historical lookup alone; active_subjects only for a requested active-subject restriction or necessary living-care precondition. This reconstructs mechanical keep/null-transition fields, never a lifecycle action. Full transition/cancellation operations retain their explicit canonical semantics. A primary_report ticket requests only its primary saved records; primary_with_separately_requested_later_attributed_reports adds a distinct explicitly requested later report about an earlier event window, with recorded.from at or after target.to. Never add a second reporting obligation merely because a note has a creation date and discusses an event. ReadTicket family is one explicit semantic choice with only its applicable arguments. ordinary_records uses calendar from/to bounds for dated records; oldest_calendar_year_records is a requested oldest accessible year. event_relative families request a relation to an actual event, not a synonym for a calendar date. episode_count and episode_membership mean actual episodes, never ordinary care-note contents. grounded_clause_probes are advisory clauses; independent_probe_selections carry every clause's own window and typed selection, with no global window. An operation field appears only where the family supports multiple meaningful read/compare/rank operations. No other episode/calendar/probe knobs are supplied. A temporal.window choice local_calendar_days supplies explicit fromDay/toDayExclusive in the server-supplied user timezone; code lowers those typed day boundaries once. exact_instants preserves supplied timestamps unchanged, including offsets. Never convert a day to UTC and then attach its local offset. catalog_lifecycle_read_saved_history carries its required read plus a requested state prerequisite; catalog_lifecycle_update_state is an explicit lifecycle action. catalog_lifecycle_conversation_general also requires a USER-grounded state prerequisite: it is not conversation continuity or a selected-pet container. Social conversation/general guidance without that prerequisite uses conversation_general_ordinary, lifecyclePlan null, even after a saved read. Catalog subject basis named/selected quotes CURRENT USER; a prior actual USER subject quote requires dialogue basis and its sourceTurnId. Never use assistant text as subject authority. Other legal catalog/read/conversation choices retain their meaning. A saved-content follow-up needs a saved read, not a state-only action or receipt. Each ticketBranch chooses one typed alternative; no_ticket is optional canonical null, never a missing required read. Supply only its variable fields; omitted branch-fixed values are reconstructed exactly from that tag. Unknown tags and extra fields are rejected. Never choose a branch to change the requested meaning. \nPOLICY\n"+policy;
 const instructions=consolidateReadPropositionGuidance(initialInstructions);
 function decode(value,checkRuntime){
  if(typeof checkRuntime!=="function")error("RUNTIME_CHECK_REQUIRED");
  checkRuntime();boundedJsonTree(value,checkRuntime);
  const canonical=operationWire.decode(ticketWire.decode(orderingWire.decode(subjectStateWire.decode(compositionWire.decode(singletonWire.decode(value,checkRuntime))))));checkRuntime();capturePreviewEvidence("operation_decoded",canonical);
  const graph=wire.encode(canonical);checkRuntime();
  const restored=wire.decode(graph);checkRuntime();capturePreviewEvidence("canonical_decoded",restored);return restored;
 }
 function encode(value,checkRuntime){
  if(typeof checkRuntime!=="function")error("RUNTIME_CHECK_REQUIRED");
  checkRuntime();const emitted=singletonWire.encode(compositionWire.encode(subjectStateWire.encode(orderingWire.encode(ticketWire.encode(operationWire.encode(value))))),checkRuntime);decode(emitted,checkRuntime);return emitted;
 }
 checkCompilation();return Object.freeze({schema,instructions,decode,encode});
}
