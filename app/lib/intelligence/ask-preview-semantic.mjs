import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const enums=new Set(['read_recorded_statements','read_settled_facts','composed_read','read','read_since_event','stored_report','effective_fact','calculate','difference','calculate_recorded_history','calculate_saved_history','calculate_certified_facts','calculate_supplied_context','count_saved_records','read_saved_history_ordinary','read_saved_history_chronological','recorded','premise','result','target','reference','measurement','event_at','conversation_general_ordinary','conversation','clarify','general','none','selected','named','account','read_general_ordinary']);
const keys=new Set(['kind','mode','scope','operation','authority','role','operator','field']);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function semanticEvidence(stage,value){
 // Only finite structural metadata crosses the storage boundary. No source text or numeric values.
 const out={version:1,mode:'semantic',stage,shapeSha256:hash(JSON.stringify(value)),tokens:[],operandShapes:[],ticketTags:[],incomplete:false};
 out.operandSourceKinds=[];
 out.catalogShapes=[];
 let nodes=0;
 function visit(v,depth=0){
  if(++nodes>50000||depth>64){out.incomplete=true;return;}
  if(!v||typeof v!=='object')return;
  if(Array.isArray(v)){for(const x of v.slice(0,256))visit(x,depth+1);if(v.length>256)out.incomplete=true;return;}
  const catalog=catalogShapeEvidence(v);if(catalog&&out.catalogShapes.length<16)out.catalogShapes.push(catalog);
  for(const [k,x]of Object.entries(v)){
   if(keys.has(k)&&typeof x==='string'&&enums.has(x)&&out.tokens.length<128)out.tokens.push({field:k,value:x});
   if(k==='ticketBranch'&&typeof x==='string'&&out.ticketTags.length<16)out.ticketTags.push(hash(x));
   if(k==='operands'&&Array.isArray(x)){
    for(const o of x.slice(0,64-out.operandSourceKinds.length))out.operandSourceKinds.push({sourceKind:o?.source==='anchor'?'anchor':o&&Object.hasOwn(o,'clause')&&Object.hasOwn(o,'item')?'selected':'unknown',role:['target','reference'].includes(o?.role)?o.role:'other_or_omitted'});
    for(const o of x.slice(0,64-out.operandShapes.length))out.operandShapes.push({
     domain:o?.kind==='recorded'?'recorded':o?.kind==='premise'?'premise':o?.kind==='result'?'result':
      o&&typeof o==='object'&&!Object.hasOwn(o,'kind')&&['measurement','event_at'].includes(o.field)?'factual_read':'not_explicit',
     role:['target','reference'].includes(o?.role)?o.role:'other_or_omitted'
    });
   }
   visit(x,depth+1);
   if(nodes>50000)break;
  }
 }
 if(stage==='raw_provider'){
  // Parse only public Responses output-text fields, before deterministic decoding. Ignore reasoning items.
  const texts=[];
  if(typeof value?.output_text==='string')texts.push(value.output_text);
  else if(Array.isArray(value?.output))for(const item of value.output)if(item?.type==='message'&&Array.isArray(item.content))
   for(const c of item.content)if(c?.type==='output_text'&&typeof c.text==='string')texts.push(c.text);
  out.outputTextCount=Math.min(texts.length,16);
  out.jsonParsed=false;
  if(texts.length===1&&Buffer.byteLength(texts[0])<=4194304){try{visit(JSON.parse(texts[0]));out.jsonParsed=true;}catch{}}
 }else if(stage==='request'){
  const req=value?.request;
  out.requestSha256=hash(JSON.stringify(req));
  if(req?.text?.format?.schema)out.schemaSha256=hash(JSON.stringify(req.text.format.schema));
  if(typeof req?.instructions==='string')out.instructionsSha256=hash(req.instructions);
 }else if(stage==='route_request'){
  if(uuid(value?.applicationRequestId))out.applicationRequestId=value.applicationRequestId;
 }else if(stage==='history_publication'){
  // Publication observations can contain complete clinical records. Retain no body, value or arbitrary status.
  out.observationPresent=true;
  if(value?.phase==='calculation_status')out.calculationStatus=calculationStatusEvidence(value);
 }else {
  visit(value);
  if(stage==='capability')out.capabilityDecision={available:typeof value?.decision?.available==='boolean'?value.decision.available:null,reason:['supported','calculation','mutation'].includes(value?.decision?.reason)?value.decision.reason:'unknown'};
 }
   if(stage==='binder_input'&&value?.sourceReferenceMembership)out.sourceReferenceMembership=boundedSourceReferenceMembership(value.sourceReferenceMembership);
  if(stage==='binder_input'&&value?.catalogBoundary)out.catalogBoundary=catalogBoundaryEvidence(value.catalogBoundary);
  if(stage==='error_exit'&&value?.validationFailure)out.validationFailure=validationFailureEvidence(value.validationFailure);
 if(stage==='binder_output'&&value?.catalogLimitation)out.catalogDecision={reason:['public_policy','unsupported_residual','target_unresolved'].includes(value.catalogLimitation.reason)?value.catalogLimitation.reason:'unknown'};
 out.operandShapes=out.operandShapes.slice(0,64);
 return out;
}

const calculationSteps=new Set(['policy','materialization','execution','publication']);
const calculationReasons=new Set(['started','supported','policy_disabled','request_contract','presentation_unsupported','read_transport_unavailable','operand_variant_unsupported','anchor_missing','selected_source_unavailable','anchor_unavailable','numeric_ambiguous','source_reader_unavailable','source_scope_denied','source_changed','numeric_ineligible','proof_invalid','deadline_cancelled','result_limited','proof_verified','completed','publication_source_changed','unknown']);
const calculationGateKeys=new Set(['ownerPresent','ownerMatches','preview','differenceEnabled','anchorEnabled','storedReport','singleDifference','allRecorded','needsAnchor']);
export function calculationStatusEvidence(value){
 const out={phase:'calculation_status',step:calculationSteps.has(value?.step)?value.step:'unknown',reason:calculationReasons.has(value?.reason)?value.reason:'unknown',gates:{},operands:[]};
 for(const [key,v]of Object.entries(value?.gates??{}))if(calculationGateKeys.has(key)&&typeof v==='boolean')out.gates[key]=v;
 if(typeof value?.supported==='boolean')out.supported=value.supported;
 for(const o of Array.isArray(value?.operands)?value.operands.slice(0,64):[]){
  out.operands.push({domain:['recorded','premise','result','factual_read'].includes(o?.domain)?o.domain:'unknown',
   sourceKind:['anchor','selected','result','premise'].includes(o?.sourceKind)?o.sourceKind:'unknown',
   role:['target','reference','member','source','start','end','part'].includes(o?.role)?o.role:'unknown'});
 }
 return out;
}

const validationReasons=new Set(["omitted_subject_reference","append_job","append_read_ticket","append_source","append_subject","basis_update","calculate_premises","calculate_scope","canonical_read_strategy","conflicting_subjects","conversation_scope","conversation_subject","correction_workflow","dates","excluded_ownership","excluded_subject","fields","finite_selection","frame","lifecycle_mixed","lifecycle_subject","measurement_calculation_required","missing_supplied_premise","mixed_mutation_jobs","mutation_intent","navigation","ownership","premise_domain","premise_source","profile_fields","profile_mutation_mixed","profile_mutation_source","profile_scope","projection","read_needs","read_ticket","read_ticket_required","read_ticket_write","record_selection","reference","remove_job","schema","scope","selected_subject","shape","source_identity","source_pin_missing","source_span","stored_read_mixed","stored_read_required","stored_read_scope","task","temporal_scope","unknown","version","write_job"]);
const validationFields=new Set(['mode','scope','petNames','referenceTurnIds','readTicket','frame','evidenceBasis','question','sourceTurnId','sourceMessageId','readTicket.predicates','readTicket.subjects','readTicket.temporal']);
const validationErrorTypes=new Set(['Error','TypeError','RangeError','AskInterpretationValidationError','StageDeadlineError','AiAdmissionError']);
export function validationFailureEvidence(value){
 return {origin:['canonical_validation','binder_boundary'].includes(value?.origin)?value.origin:'unknown',
  reason:(value?.family==='catalog_invalid'?catalogValidationReasons:validationReasons).has(value?.reason)?value.reason:'unknown',
  family:['request_invalid','request_contract','catalog_invalid'].includes(value?.family)?value.family:'unknown',
  field:validationFields.has(value?.field)?value.field:'unknown',
  errorType:validationErrorTypes.has(value?.errorType)?value.errorType:'unknown'};
}
export function interpretationValidationEvidence(error,origin){
 const text=typeof error?.reason==='string'?error.reason:typeof error?.message==='string'?error.message:'';
 const catalog=/^ASK_CATALOG_INVALID:([a-z_]+)$/.exec(text),invalid=/^ASK_REQUEST_INVALID:([a-z_]+)$/.exec(text),contract=/^ASK_REQUEST_CONTRACT_([A-Z_]+)$/.exec(text);
 return validationFailureEvidence({origin,reason:catalog?.[1]??invalid?.[1]??contract?.[1]?.toLowerCase(),
  family:catalog?'catalog_invalid':invalid?'request_invalid':contract?'request_contract':'unknown',field:error?.cause?.field,errorType:error?.name});
}

const catalogPurposes=new Set(['replace','remove','concern','lifecycle','receipt']);
const catalogScopes=new Set(['subjects','owner_receipt']);
const catalogFormats=new Set(['prose','bullets','table','json','csv']);
// A provider no_ticket object is the explicit wire representation of null.
// Do not report an unexpanded tagged object as an authorized or present read.
function catalogReadTicketPresence(request,canonical){
 if(!request||!Object.hasOwn(request,'readTicket'))return null;
 const ticket=request.readTicket;
 if(ticket===null)return false;
 if(!ticket||typeof ticket!=='object'||Array.isArray(ticket))return null;
 if(canonical)return true;
 return Object.keys(ticket).length===1&&ticket.ticketBranch==='no_ticket'?false:null;
}
export function catalogShapeEvidence(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const tag=typeof value.kind==='string'?/^catalog_(replace|remove|concern|lifecycle|receipt)_(subjects|owner_receipt)(?:_(?:unqualified_cancellation|subjects))?$/.exec(value.kind):null;
 const lifecycleTag=/^catalog_lifecycle_(read_saved_history|read_saved_profile|read_unspecified_evidence|conversation_general|conversation_saved_history|conversation_unspecified_evidence|update_state)(?:_unqualified_cancellation)?$/.exec(value.kind);
 const canonical=value.version==='ask-catalog-intent.v1';
 if(!canonical&&!tag&&!lifecycleTag)return null;
 const req=value.request&&typeof value.request==='object'&&!Array.isArray(value.request)?value.request:null;
 const requirements=req&&Array.isArray(req.requirements)?req.requirements:null;
 return {representation:canonical?'canonical_catalog_intent':'provider_catalog_tag',
  purpose:canonical?(catalogPurposes.has(value.purpose)?value.purpose:'unknown'):lifecycleTag?'lifecycle':tag[1],
  scope:canonical?(catalogScopes.has(value.scope)?value.scope:'unknown'):lifecycleTag?'subjects':tag[2],
  requirementsCount:requirements?Math.min(requirements.length,64):null,requirementsTruncated:requirements?requirements.length>64:false,
  outputFormat:req&&Object.hasOwn(req,'outputFormat')?(req.outputFormat===null?'null':catalogFormats.has(req.outputFormat)?req.outputFormat:'unknown'):'not_exposed',
  storedDomain:req?.storedRead?.domain==='operation_receipt'?'operation_receipt':req&&Object.hasOwn(req,'storedRead')&&req.storedRead===null?'null':'not_exposed',
  readTicketPresent:lifecycleTag&&lifecycleTag[1]!=='read_saved_history'&&req&&!Object.hasOwn(req,'readTicket')?false:catalogReadTicketPresence(req,canonical)};
}

// Finite original catalog error vocabulary. Unknown strings never cross the private boundary.
const catalogValidationReasons=new Set(["admission_required", "ambiguous_subject", "catalog_byte_limit", "catalog_snapshot", "constraint_authority", "constraint_overlap", "constraints", "continuation_authority", "continuation_catalog", "continuation_limitation", "continuation_snapshot", "conversation_identity", "current_user", "duplicate_subject", "exact_handle", "frozen_request", "grounding", "grounding_source", "mixed_catalog_operation", "owner_receipt_scope", "owner_scope_grounding", "permit_identity_phase_or_expiry", "persistence_veto", "receipt_purpose", "scope_contradiction", "selected_contradiction", "shape", "source_identity", "source_semantics", "source_span", "subject_ownership", "subject_span", "typed_purpose", "unbound_target"]);

const catalogJobs=['writeJob','removeJob','stateTransitionJob','lifecyclePlan','storedRead','appendJob','fieldMutationJob','task','calculatePlan'];
const catalogSteps=new Set(['canonical_check','catalog_binding','catalog_bound']);
const spanStates=new Set(['unique','missing','ambiguous','invalid','not_exposed']);
const sourceRoles=new Set(['user','furvise','other','missing']);
const bool=x=>typeof x==='boolean'?x:null;
const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
function spanState(text,quote){
 if(typeof text!=='string')return 'not_exposed';
 if(typeof quote!=='string'||!quote.trim()||quote.length>1600)return 'invalid';
 const i=text.indexOf(quote);return i<0?'missing':text.indexOf(quote,i+1)<0?'unique':'ambiguous';
}
// Diagnostic comparisons only. Original Binder alone decides admission/authority.
export function catalogBindingEvidence(value,context,step){
 const request=record(value?.request)?value.request:null,current=context?.currentTurn;
 const purpose=catalogPurposes.has(value?.purpose)?value.purpose:'unknown';
 const expected={replace:'writeJob',remove:'removeJob',concern:'stateTransitionJob',lifecycle:'lifecyclePlan',receipt:'storedRead'}[purpose];
 const job=request&&expected&&record(request[expected])?request[expected]:null;
 const subjects=Array.isArray(value?.subjects)?value.subjects:null;
 return catalogBoundaryEvidence({step,purpose,
  currentUserPresent:current?.role==='user'&&!current.recoveredReceiptReference,
  conversationPresent:typeof context?.conversationId==='string'&&!!context.conversationId,
  sourceTurnMatches:typeof value?.sourceTurnId==='string'&&typeof current?.id==='string'?value.sourceTurnId===current.id:null,
  instructionMatches:typeof value?.instructionQuote==='string'&&typeof context?.currentMessage==='string'?value.instructionQuote===context.currentMessage.trim():null,
  authorizationSpan:spanState(current?.text,value?.authorizationQuote),
  expectedJobPresent:request&&expected?record(request[expected]):null,
  jobs:Object.fromEntries(catalogJobs.map(k=>[k,request&&Object.hasOwn(request,k)?record(request[k]):null])),
  jobInstructionMatches:job&&Object.hasOwn(job,'instructionQuote')&&typeof context?.currentMessage==='string'?job.instructionQuote===context.currentMessage.trim():null,
  jobAuthorizationSpan:job&&Object.hasOwn(job,'authorizationQuote')?spanState(current?.text,job.authorizationQuote):'not_exposed',
  subjectsCount:subjects?Math.min(subjects.length,20):null,subjectsTruncated:!!subjects&&subjects.length>20,
  subjects:subjects?subjects.slice(0,20).map(item=>{
   const turn=item?.sourceTurnId===current?.id?current:Array.isArray(context?.conversationTurns)?context.conversationTurns.find(t=>t.id===item?.sourceTurnId):null;
   return {basis:['named','selected','dialogue'].includes(item?.basis)?item.basis:'unknown',
    sourceRole:!turn?'missing':['user','furvise'].includes(turn.role)?turn.role:'other',
    recoveredReference:bool(turn?.recoveredReceiptReference)??false,quoteSpan:spanState(turn?.text,item?.quote)};
  }):[]});
}
export function catalogBoundaryEvidence(value){
 const out={step:catalogSteps.has(value?.step)?value.step:'unknown',purpose:catalogPurposes.has(value?.purpose)?value.purpose:'unknown'};
 for(const k of ['currentUserPresent','conversationPresent','sourceTurnMatches','instructionMatches','expectedJobPresent','jobInstructionMatches'])out[k]=bool(value?.[k]);
 for(const k of ['authorizationSpan','jobAuthorizationSpan'])out[k]=spanStates.has(value?.[k])?value[k]:'not_exposed';
 out.jobs=Object.fromEntries(catalogJobs.map(k=>[k,bool(value?.jobs?.[k])]));
 out.subjectsCount=Number.isInteger(value?.subjectsCount)&&value.subjectsCount>=0?Math.min(value.subjectsCount,20):null;
 out.subjectsTruncated=value?.subjectsTruncated===true;
 out.subjects=(Array.isArray(value?.subjects)?value.subjects:[]).slice(0,20).map(s=>({
  basis:['named','selected','dialogue'].includes(s?.basis)?s.basis:'unknown',
  sourceRole:sourceRoles.has(s?.sourceRole)?s.sourceRole:'missing',
  recoveredReference:bool(s?.recoveredReference),
  quoteSpan:spanStates.has(s?.quoteSpan)?s.quoteSpan:'not_exposed'}));
 return out;
}

// Diagnostic-only comparisons from the unchanged Binder. No IDs or content leave this boundary.
const membershipReasons=new Set(['matched','undeclared_reference_turn','unsupplied_citation_pair','unknown']);
const boundedCount=(v,max)=>Number.isInteger(v)&&v>=0?Math.min(v,max):null;
function boundedSourceReferenceMembership(value){
 const declaredTurn=typeof value?.declaredTurn==='boolean'?value.declaredTurn:null;
 const suppliedPair=typeof value?.suppliedPair==='boolean'?value.suppliedPair:null;
 return {declaredTurn,suppliedPair,
  reason:membershipReasons.has(value?.reason)?value.reason:'unknown',
  declaredCount:boundedCount(value?.declaredCount,8),suppliedCount:boundedCount(value?.suppliedCount,64),
  turnSha256:/^[a-f0-9]{64}$/.test(value?.turnSha256??'')?value.turnSha256:null,
  pairSha256:/^[a-f0-9]{64}$/.test(value?.pairSha256??'')?value.pairSha256:null};
}
export function sourceReferenceMembershipEvidence(value){
 const declaredTurn=typeof value?.declaredTurn==='boolean'?value.declaredTurn:null;
 const suppliedPair=typeof value?.suppliedPair==='boolean'?value.suppliedPair:null;
 const validPair=uuid(value?.sourceTurnId)&&typeof value?.sourceId==='string'
  &&/^care:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.sourceId);
 return boundedSourceReferenceMembership({declaredTurn,suppliedPair,
  reason:declaredTurn===false?'undeclared_reference_turn':suppliedPair===false?'unsupplied_citation_pair':
   declaredTurn===true&&suppliedPair===true?'matched':'unknown',
  declaredCount:value?.declaredCount,suppliedCount:value?.suppliedCount,
  turnSha256:uuid(value?.sourceTurnId)?hash(value.sourceTurnId):null,
  pairSha256:validPair?hash(JSON.stringify({sourceTurnId:value.sourceTurnId,sourceId:value.sourceId})):null});
}
