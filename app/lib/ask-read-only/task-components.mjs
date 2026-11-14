import {reconcileCorrectedReference} from "./corrected-reference.mjs";
import {completeFreshHistory} from "./continuation-evidence.mjs";
import { EVIDENCE_COMPLETION_INSTRUCTIONS, evidenceCompletionSchema } from "./evidence-completion.mjs";
import { explicitCalendarWindow } from "./calendar-scope.mjs";
import { HISTORY_SYNTHESIS_INSTRUCTIONS, historySynthesisSchema, validateHistorySynthesis, renderHistorySynthesis, visibleHistoryEvidence } from "./history-synthesis.mjs";
/** Requested work is independent of prose mode. References remain hints until
 * owner-bound rehydration; fact excerpts gain authority only by exact matching. */
const object=properties=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
const choice=values=>({type:"string",enum:values});
const kinds=["saved_content","saved_continuation","owner_observations","calculation","vet_brief","clarification","general_guidance","clinical_guidance","workflow"];
const workflows=["none","create_care_note","find_care_note","care_photo_attachment","other"];
const missing=["pet","year","date_meaning","which_record","owner_observation","medicine","prescription","vet_plan"];
const scopeMissing=t=>t.missing.some(v=>["pet","year","date_meaning","which_record"].includes(v));
const reasons=["none","missing_context","source_unavailable","source_omitted","not_supported","not_answered"];
const array=(items,maxItems)=>({type:"array",items,maxItems});
const nullable=values=>({type:["string","null"],enum:[...values,null]});
const keys=(v,expected)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k));
function reject(field){throw Object.assign(new Error("ASK_READ_COMPONENT_CONTRACT"),{code:"ASK_READ_COMPONENT_CONTRACT",answerDiagnostic:{category:"component_contract",field}});}
export const COMPONENT_INSTRUCTIONS=[
 HISTORY_SYNTHESIS_INSTRUCTIONS,
 EVIDENCE_COMPLETION_INSTRUCTIONS,
 "Each task is an INDEPENDENT owner-requested deliverable, not an output field. Retrieving a particular saved note, its original wording, and when its event happened versus when it was recorded is ONE saved_content task with recordMode=single and includeSourceDates=true. Those timestamps and quotations are source outputs, never an extra general_guidance task. A month/year lookup does not become a collection merely because its note has several requested fields; use exact_quote for the particular note. Use general_guidance only when the owner actually asks a separate ordinary question that needs its own answer. Do not manufacture an unanswered general task from words such as original wording, event time, recorded time or explain the saved note. Before returning taskPlan, check every task against the actual independent request and combine source metadata with its saved_content task. Preserve genuinely separate general, clinical, workflow and calculation requests.",
 "For collection summaries, use concise grounded themes in historySynthesis. Use historyFacts only for salient source-specific dates/details the owner actually requests, using the exact admitted source and contiguous original sentence. Avoid duplicating their wording in historySynthesis. The server supplies its event/recorded date. Keep component prose to an undated synthesis of patterns and limitations; do not generate month/year-specific paraphrases or citation ranges. Select salient exceptions as historyFacts as well as routine background. Only single source handles may be used as inline references.",
 "Set includeSourceDates only for tasks whose source timestamps the owner requests in the answer, not merely because a note has dates. The server publishes those requested verified dates once; do not repeat them in component prose. calculation means arithmetic over saved typed measurements; ordinary math without saved-record dependency belongs general_guidance.",
 "Set recordMode=collection for a set, period summary, comparison, or continuation, single for identifying one record, and none without saved evidence. A collection does not require choosing a single record: which_record must never block collection membership. Plan collection reads with goal=complete_set and explicit owner pet/time scope. Summarize the actual supplied content, source-reported patterns (never infer recurrence from saved mentions) and dated exceptions; never replace synthesis with a timestamp list or only selected quotations. Do not infer clinical advice merely from medical words inside old notes. clinical_guidance is an explicit care interpretation/triage request, including future IF emergency-response education; that one clinical deliverable is not an additional general_guidance task. Preserve independently requested ordinary work as separate tasks; ordinary historical reporting is saved_content. Plan every essential requested task separately in taskPlan. saved_content means Ask retrieves/quotes/explains owned records, NOT instructions for finding them. workflow is ONLY an explicit request for how to operate Furvise screens. A request for Ask to save, edit, delete or upload is a capability question: use general_guidance, workflow=none, needsHistory=false and no reads unless an independently requested saved-data task needs them. Explain the read-only limit concisely; do not claim completion or ask which screen when the requested action is already clear. Do not create a workflow task merely because a question mentions notes, saved dates, history, a diary or a vet brief.",
 "One integrated overview of earlier and newly fetched history is ONE collection task, with multiple reads, not separate prior/remainder answer tasks. Set combineHistory=true only when the owner asks to combine or integrate an earlier result and newly fetched/continued history. A combined answer must include relevant exact historical facts or synthesis evidence from BOTH retained_prior and fresh_remainder TOOL_DATA groups. Merely reading or listing their source handles is insufficient; preserve salient earlier exceptions. For all other tasks combineHistory=false.",
 "For explicit remaining/continue requests use saved_continuation and the selected reference with an omittedRange (or legacy omittedEventRange); read_remaining_records performs a fresh bounded search of that omitted range, not a snapshot cursor. It may repeat same-day boundary records. Do not use the prior eight retained source bodies as the omitted remainder. For a workflow task, workflow selects the actual screen operation; a photo into a care/history note uses care_photo_attachment, not other. For all non-workflow tasks workflow must be none.",
 "A vet_brief is an actual concise handoff: relevant owner-reported observations, dated original historical facts, and questions/unknowns. Set needsHistory when saved notes/results are requested. Set needsOwnerFacts when current/prior user observations must be included (including what I just told you), and always for owner_observations tasks. Do not mark those tasks complete without actual eligible owner facts. Select the relevant retained reference handle and authorized pets, then re-read it. A prior assistant answer or reference metadata is never source evidence. For collection integration, rehydrate the original result and relevant continuation results; bounded retained sources are a selection, never the full historical set. Do not discuss evidence completeness or source counts in free prose: the server supplies coverage. Select ownerFacts by the exact sentence handle in ownerFactSentenceRefs; do not regenerate or shorten owner wording. Classify each owner fact by meaning; pet/date corrections and requests are not health observations. A corrected pet/date overrides a prior result; plan a new scoped search with reference=null instead. A prior reference can be dialogue context without identifying the newly requested record; never attach an old-pet/year locator to the new task. When the referenced result is ambiguous, ask which one rather than choosing arbitrarily.",
 "A corrected multi-pet calculation keeps each pet and year independent. The unchanged comparison still needs its owned reference operands re-read; an earlier assistant number is not evidence. Plan a fresh bounded read for the changed period and owner-bound rehydration for the unchanged side as history-dependent calculation tasks.",
 "For any requested saved/profile content or calculation set needsHistory=true and bind pets to all explicitly named or unambiguously established authorized subjects. A comparison/calculation may have multiple pets; keep each tool read pet/time scoped. An empty pets list is not permission to guess from the selected UI pet. A selected reference carries its own authorized pet. General guidance alone does not require saved reads. needsOwnerFacts is only for an owner_observations task or a vet_brief that must reproduce actual observations. Preferences, time constraints and plan revisions are ordinary dialogue context, not factual excerpts required before general guidance can be answered.",
 "The date_meaning field means the database event-versus-save filter axis. It cannot block a source-free general explanation or reasoning about owner-supplied statements. If no saved retrieval is needed, answer the stated reasoning question without requesting a database date axis.",
 "which_record means identifying ONE saved record with needsHistory=true and recordMode=single. It is not an information-unavailable flag and cannot apply to a source-free task or a collection. An unknown or explicitly unrecorded detail is not a missing pet identity or a missing saved-result choice. When the owner says the detail was never entered, do not search unrelated history or invent its value. Explain the information limit. If a saved fact may exist and retrieval is requested, needsHistory must remain true and the real scope must be resolved.",
 "missing identifies what is genuinely unresolved. A vague month with no established pet/year requires one pointed pet/year question; do not use the UI-selected pet as evidence of a pronoun. An explicit pet plus month/year is sufficient; do not demand a day. A follow-up pet/year correction overrides the old result and requires a new bounded search. Preserve the established date axis unless the owner changes it. Requesting both event and recorded timestamps is display metadata, not date-axis ambiguity: asking when an event happened and when its note was saved must not create date_meaning or suppress the read. Clinical missing authority must not prevent an independently scoped saved-data task.",
 "In the final completion array account for EACH task ID once. Select componentIndexes for independently answerable ordinary prose, sources for current admitted evidence, and exact factual excerpts for a vet brief. ownerFacts excerpts must be short COMPLETE verbatim sentences preserving negation, attribution and caveats; declarative observations from the selected USER statement, not their request, an assistant assertion, speculation, or a question. historyFacts excerpts must be one or more CONTIGUOUS COMPLETE sentences occurring byte-for-byte in an admitted note, preserving negation and attribution. Never generate a diagnosis or regimen directive in these excerpts; historical plans remain historical quotations. Questions for the vet come from the bounded clinical review fields. Do not put extra clinical recommendations into a summary component.",
 "Use complete only when this requested task is actually delivered. Unresolved/partial requires a specific reason. Preserve the other completed tasks. Do not add a generic partial/context notice when all requested components are delivered. Do not repeat server dates or arithmetic in model prose; the server publishes them once. Source omissions limit only the affected task; never claim a complete collection when bodies are omitted."
].join("\n");
export function componentSelectionSchema(base,context){
 const out=structuredClone(base);
 out.properties.taskPlan={type:"array",minItems:1,maxItems:6,items:object({
  id:choice(["t1","t2","t3","t4","t5","t6"]),kind:choice(kinds),combineHistory:{type:"boolean"},needsHistory:{type:"boolean"},needsOwnerFacts:{type:"boolean"},includeSourceDates:{type:"boolean"},recordMode:choice(["none","single","collection"]),
  workflow:choice(workflows),pets:array(choice(context.pets.map(p=>p.handle)),4),reference:nullable(context.references.map(r=>r.reference)),
  missing:array(choice(missing),7)
 })};
 const withoutHistory=structuredClone(out.properties.taskPlan.items),withHistory=structuredClone(out.properties.taskPlan.items);
 withoutHistory.properties.needsHistory={type:"boolean",enum:[false]};withoutHistory.properties.combineHistory={type:"boolean",enum:[false]};withoutHistory.properties.recordMode=choice(["none"]);
 withoutHistory.properties.missing=array(choice(missing.filter(field=>field!=="which_record")),7);
 withHistory.properties.needsHistory={type:"boolean",enum:[true]};withHistory.properties.recordMode=choice(["single","collection"]);
 // Encode the same kind/workflow relation enforced by checkedTaskPlan.
  // Independent enum fields otherwise allow a schema-valid but unusable packet.
  const variants=[withoutHistory,withHistory].flatMap(history=>{
   const ordinary=structuredClone(history),workflow=structuredClone(history);
   ordinary.properties.kind=choice(kinds.filter(kind=>kind!=="workflow"));
   ordinary.properties.workflow=choice(["none"]);
   workflow.properties.kind=choice(["workflow"]);
   workflow.properties.workflow=choice(workflows.filter(intent=>intent!=="none"));
   return [ordinary,workflow];
  });
  out.properties.taskPlan.items={anyOf:variants};out.required.push("taskPlan");return out;
}
function checkedTaskPlan(plan,context,deferKnownReferencePet=false){
 if(!Array.isArray(plan)||!plan.length||plan.length>6||new Set(plan.map(t=>t?.id)).size!==plan.length)reject("plan");
 for(const raw of plan){
  const t={...raw};delete t.combineHistory;
  if(Object.hasOwn(raw,"combineHistory")&&(typeof raw.combineHistory!=="boolean"||raw.combineHistory&&!raw.needsHistory))reject("task");
  if(!keys(t,["id","kind","needsHistory","needsOwnerFacts","includeSourceDates","recordMode","workflow","pets","reference","missing"])||!/^t[1-6]$/.test(t.id)||!kinds.includes(t.kind)||typeof t.needsHistory!=="boolean"||typeof t.needsOwnerFacts!=="boolean"||typeof t.includeSourceDates!=="boolean"||!Array.isArray(t.missing)||t.missing.length>7||t.missing.some(v=>!missing.includes(v)))reject("task");
  if(!["none","single","collection"].includes(t.recordMode)||(t.recordMode!=="none")!==t.needsHistory)reject("record_mode");
  if(!workflows.includes(t.workflow)||(t.kind==="workflow")!==(t.workflow!=="none"))reject("workflow_task");
  if(!Array.isArray(t.pets)||t.pets.length>4||t.pets.some(h=>!context.pets.some(p=>p.handle===h)))reject("pet");
  const reference=context.references.find(r=>r.reference===t.reference);
  if(t.reference!==null&&(!reference||!deferKnownReferencePet&&t.pets.length>0&&!t.pets.includes(reference.petHandle)))reject("reference");
 }
 // Normalize dependent fields first. Applicability must never consult an
 // irrelevant RAW flag that has already been removed from the task contract.
 return plan.map(t=>({...t,combineHistory:t.combineHistory===true,recordMode:t.kind==="saved_continuation"?"collection":t.recordMode,needsOwnerFacts:t.kind==="owner_observations"||t.kind==="vet_brief"&&t.needsOwnerFacts,missing:[...new Set(t.missing)]}))
  .map(t=>({...t,missing:t.missing.filter(k=>(k!=="which_record"||t.needsHistory&&t.recordMode==="single"&&t.kind!=="saved_continuation")&&(k!=="owner_observation"||["owner_observations","vet_brief"].includes(t.kind))&&(k!=="date_meaning"||t.kind!=="general_guidance"||t.needsHistory||t.reference!==null||t.needsOwnerFacts))}));
}
export function validateTaskPlan(plan,context){return checkedTaskPlan(plan,context);}
export function decodeComponentSelection(value,tools,context,decode){
 // Shape, owned pet handles and locator existence remain strict before decoding.
 // Only a KNOWN reference's old pet can await a current-scope correction; final
 // validation below is always strict, and no IO has been admitted at this stage.
 checkedTaskPlan(value?.taskPlan,context,true);
 const clean={...value};delete clean.taskPlan;
 const first=decode(clean,tools,context),corrected=reconcileCorrectedReference(first,value?.taskPlan,context);
 const taskPlan=validateTaskPlan(corrected?.taskPlan??value?.taskPlan,context);
 const selected=corrected??first;
 const changedPrerequisites=(corrected?.taskPlan??value.taskPlan).some(t=>t.missing.some(field=>!taskPlan.find(checked=>checked.id===t.id)?.missing.includes(field)));
 return {...selected,text:changedPrerequisites?"":selected.text,taskPlan};
}
function containedCollection(outer,inner){
 if(outer.kind!=="history"||inner.kind!=="history"||outer.pet.id!==inner.pet.id||outer.pet.ownerId!==inner.pet.ownerId||outer.referenceTimeZone!==inner.referenceTimeZone||JSON.stringify(outer.terms)!==JSON.stringify(inner.terms))return false;
 const bounded=outer.from&&outer.to||outer.recordedFrom&&outer.recordedTo;
 return !!bounded&&[["from","to"],["recordedFrom","recordedTo"]].every(([lo,hi])=>(!outer[lo]||inner[lo]&&inner[lo]>=outer[lo])&&(!outer[hi]||inner[hi]&&inner[hi]<=outer[hi]));
}
export function fulfillReferenceReads(first,references=[]){
 if(!first.taskPlan)return first;
 let calls=[...first.calls];
 // Keep remainder membership distinct from retained prior evidence. Both are
 // owner-bound reads; only the fresh omitted-window result is the remainder.
 const mergeable=t=>t.needsHistory&&t.recordMode==="collection"&&t.combineHistory===true&&t.reference&&!scopeMissing(t)&&!t.needsOwnerFacts&&["saved_content","saved_continuation"].includes(t.kind);
 const scope=t=>JSON.stringify([t.reference,[...t.pets].sort(),[...t.missing].sort()]);
 // Earlier and newly fetched evidence are two reads for ONE integrated
 // deliverable, not two copies of every theme/fact in the answer wire.
 let taskPlan=[];
 for(const task of first.taskPlan){
  const peer=mergeable(task)&&taskPlan.find(t=>mergeable(t)&&scope(t)===scope(task));
  if(peer){peer.kind=peer.kind==="saved_continuation"||task.kind==="saved_continuation"?"saved_continuation":"saved_content";peer.includeSourceDates||=task.includeSourceDates;}
  else taskPlan.push({...task});
 }
 taskPlan=taskPlan.map(t=>{
  const selected=references.find(r=>r.handle===t.reference),remaining=selected?.request.omittedRange??selected?.request.omittedEventRange;
  // The existing binder and task gate must authorize this range; metadata
  // never substitutes for current owned-source validation or actual IO.
  const omittedIntegration=calls.length===0&&t.recordMode==="collection"&&t.combineHistory===true&&selected?.request.goal==="complete_set"&&remaining;
  if(t.kind==="saved_content"&&t.needsHistory&&t.reference&&!scopeMissing(t)&&(omittedIntegration||calls.some(c=>c.name==="read_remaining_records"&&JSON.parse(c.arguments).reference===t.reference))){
   return {...t,kind:"saved_continuation",recordMode:"collection"};
  }
  return t;
 });
 for(const task of taskPlan){
  if(!task.needsHistory||!task.reference||scopeMissing(task))continue;
  if(task.kind==="saved_continuation"&&!references.some(r=>r.handle===task.reference&&(r.request.omittedRange||r.request.omittedEventRange)))continue;
  const tool=task.kind==="saved_continuation"?"read_remaining_records":"read_referenced_sources";
  const selected=references.find(r=>r.handle===task.reference);
  const related=task.recordMode==="collection"&&task.kind!=="saved_continuation"&&selected?.request.goal==="complete_set"
   ?references.filter(r=>r.handle!==task.reference&&r.request.goal==="complete_set"&&containedCollection(selected.request,r.request)):[];
  for(const [i,ref] of [selected,...related].filter(Boolean).entries()){
   const duplicate=calls.some(c=>c.name===tool&&JSON.parse(c.arguments).reference===ref.handle);
   if(!duplicate&&calls.length<4)calls.push({id:"task-read-"+task.id+"-"+i,name:tool,arguments:JSON.stringify({reference:ref.handle})});
  }
  // A continuation may need an updated combined picture. Anchor validation is
  // not model-visible evidence. Rehydrate the bounded retained source selection
  // through its existing binder as a separately scoped result, within the SAME
  // four-tool/shared acquisition/body/character limits. Never call it remainder.
  if(task.kind==="saved_continuation"&&selected&&calls.length<4&&!calls.some(c=>c.name==="read_referenced_sources"&&JSON.parse(c.arguments).reference===selected.handle)){
   calls.push({id:"task-prior-"+task.id,name:"read_referenced_sources",arguments:JSON.stringify({reference:selected.handle})});
  }
 }
 return {...first,taskPlan,calls};
}

/** Resolve identity, not data availability. Only source-free nonclinical tasks
 * qualify; this grants no read. The existing owner-bound binder checks identity. */
// compositionOnly is a server-only phase: acquisition must already be closed.
// It binds identity for honest unacquired-source presentation, never read authority.
export function reconcileNoReadPet(plan,safety,context,pets,ownerId,bindPet,compositionOnly=false){
 // A model may call a source-free unknown detail "clarification" instead of
 // "saved_content". Once acquisition is CLOSED, a sole missing-pet task can
 // resolve an explicit owned name without acquiring evidence or inventing the
 // private detail. Canonical saved_content then uses the existing unavailable-
 // source renderer; this grants neither a read nor a factual answer.
 const clarificationDetail=t=>compositionOnly&&plan?.length===1&&t.kind==="clarification"
  &&!t.needsHistory&&t.recordMode==="none"&&!t.reference&&!t.needsOwnerFacts
  &&t.pets.length<=1&&t.missing.length===1&&t.missing[0]==="pet";
 if(!plan||!safety||compositionOnly&&plan.length!==1||!Array.isArray(safety.missingContext)||plan.some(t=>(!["saved_content","general_guidance"].includes(t.kind)&&!clarificationDetail(t))||t.needsHistory&&!compositionOnly||t.reference||t.needsOwnerFacts)||!["none","education"].includes(safety.careContext)||safety.medicationIntent!=="none"
  ||safety.scenario!=="none"||safety.currentEvents?.length||safety.conditionalEvents?.length
  ||safety.missingContext.some(k=>k!=="pet"))return null;
 // With no medication/care intent, prescription authority cannot be a missing
 // field of a source-free saved-detail task. This never grants a clinical plan.
 const inapplicable=new Set(["pet","medicine","prescription","vet_plan"]);
 // A general answer still has an owner-bound subject. Resolve identity only;
 // never grant a saved fact, acquisition, medical authority or new scope.
 const generalIdentity=t=>t.kind==="general_guidance"&&!t.needsHistory&&t.recordMode==="none"&&!t.reference&&!t.needsOwnerFacts&&t.pets.length<=1&&t.missing.includes("pet");
 const eligible=t=>generalIdentity(t)||clarificationDetail(t)||t.kind==="saved_content"&&(!t.needsHistory||compositionOnly)&&(t.recordMode==="none"||compositionOnly&&["single","collection"].includes(t.recordMode))&&!t.reference&&!t.needsOwnerFacts&&t.pets.length<=1&&t.missing.some(k=>inapplicable.has(k));
 if(!plan.some(eligible))return null;
 const escaped=name=>name.replace(/[.*+?^{}$()|[\]\\]/g,"\\$&");
 const named=pets.filter(p=>p.ownerId===ownerId&&typeof p.name==="string"&&p.name.trim()
  &&new RegExp("(?<![\\p{L}\\p{N}])"+escaped(p.name)+"(?![\\p{L}\\p{N}])","iu").test(context.question));
 if(named.length!==1)return null;
 const pet=bindPet(named[0].handle);
 if(!pet||pet.id!==named[0].id||pet.ownerId!==ownerId)return null;
 let resolved=0;
 const updated=plan.map(t=>{
  if(!eligible(t))return t;
  resolved++;return {...t,kind:clarificationDetail(t)?"saved_content":t.kind,pets:[pet.handle],missing:t.missing.filter(k=>generalIdentity(t)?k!=="pet":!inapplicable.has(k))};
 });
 if(!resolved)return null;
 const missingContext=safety.missingContext.filter(k=>k!=="pet");
 return {plan:updated,safety:{...safety,missingContext,referent:missingContext.length?safety.referent:"clear"},resolved};
}

export function ownerFactSentences(ownerStatements){
 return ownerStatements.flatMap(s=>[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(s.text)].flatMap((part,index)=>{
  const excerpt=part.segment.trim();return excerpt&&excerpt.length<=280?[{sentence:s.ref+":sentence"+(index+1),ref:s.ref,excerpt}]:[];
 }));
}
export function componentAnswerSchema(base,plan,sources,ownerStatements,completionContext={}){
 if(!plan)return base;
 const out=structuredClone(base),handles=sources.map(s=>s.handle);
 const exact={type:"string",minLength:1,maxLength:280},sentences=ownerFactSentences(ownerStatements);
 out.properties.completion={type:"array",minItems:plan.length,maxItems:plan.length,items:object({
  task:choice(plan.map(t=>t.id)),status:choice(["complete","partial","unresolved"]),reason:choice(reasons),
  componentIndexes:array({type:"integer",minimum:0,maximum:7},8),sources:array(choice(handles.length?handles:["unavailable"]),handles.length?32:0),
  ownerFacts:array(object({sentence:choice(sentences.length?sentences.map(s=>s.sentence):["unavailable"]),kind:choice(["present_observation","past_observation","scope_correction","request"])}),sentences.length?4:0),
  historyFacts:array(object({source:choice(handles.length?handles:["unavailable"]),excerpt:exact}),handles.length?6:0),historySynthesis:historySynthesisSchema(handles)
 })};out.properties.evidenceCompletion=evidenceCompletionSchema(plan,sources,completionContext.supplements??[]);out.required.push("completion","evidenceCompletion");return out;
}
const completeSentence=(body,excerpt)=>{
 const parts=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(body)];
 for(let start=0;start<parts.length;start++){
  let span="";
  for(let end=start;end<parts.length;end++){
   span+=parts[end].segment;
   if(span.trim()===excerpt)return true;
   if(span.trim().length>excerpt.length)break;
  }
 }
 return false;
};
export function reviewComponentCompletion(final,plan,sources,ownerStatements,pets=[]){
 if(!plan)return {value:final,tasks:null};
 const entries=final?.completion;if(!Array.isArray(entries)||entries.length!==plan.length||new Set(entries.map(e=>e?.task)).size!==plan.length)reject("completion");
 const tasks=plan.map(task=>{
  const raw=entries.find(e=>e.task===task.id);
  const strictSynthesis=!!raw&&Object.hasOwn(raw,"historySynthesis");
  const legacy=raw&&{...raw};if(legacy)delete legacy.historySynthesis;
  const e=legacy&&{...legacy,ownerFacts:Array.isArray(raw.ownerFacts)?raw.ownerFacts.map(f=>{
   if(!keys(f,["sentence","kind"]))return f; // Legacy stored/local adapter compatibility only.
   const row=ownerFactSentences(ownerStatements).find(s=>s.sentence===f.sentence);
   if(!row)reject("owner_sentence_reference");
   return {ref:row.ref,kind:f.kind,excerpt:row.excerpt};
  }):raw.ownerFacts};
  if(!keys(e,["task","status","reason","componentIndexes","sources","ownerFacts","historyFacts"])||!["complete","partial","unresolved"].includes(e.status)||!reasons.includes(e.reason)||!Array.isArray(e.componentIndexes)||e.componentIndexes.length>8||e.componentIndexes.some(i=>!Number.isInteger(i)||!final.components?.[i])||!Array.isArray(e.sources)||e.sources.length>32||e.sources.some(h=>!sources.some(s=>s.handle===h)))reject("completion_shape");
  let rejectedFact=false;
  for(const [field,refKey,pool,bodyKey] of [["ownerFacts","ref",ownerStatements,"text"],["historyFacts","source",sources,"body"]]){
   if(!Array.isArray(e[field])||e[field].length>(field==="ownerFacts"?4:6))reject("fact_shape");
   for(const f of e[field]){const row=pool.find(s=>(s.ref??s.handle)===f?.[refKey]);
    if(!(keys(f,[refKey,"excerpt"])||field==="ownerFacts"&&keys(f,[refKey,"kind","excerpt"])&&["present_observation","past_observation","scope_correction","request"].includes(f.kind))||typeof f.excerpt!=="string"||!f.excerpt.trim()||f.excerpt.length>280||!row)reject("fact_reference");
    if(!completeSentence(row[bodyKey],f.excerpt)||field==="historyFacts"&&row.kind!=="history")rejectedFact=true;
   }
  }
  const historyFacts=e.historyFacts.filter(f=>sources.some(s=>s.handle===f.source&&s.kind==="history"&&completeSentence(s.body,f.excerpt)));
  const ownerFacts=e.ownerFacts.filter(f=>(!f.kind||["present_observation","past_observation"].includes(f.kind))&&ownerStatements.some(s=>s.ref===f.ref&&completeSentence(s.text,f.excerpt)));
  const synthesisDiagnostics=[];
  const synthesis= strictSynthesis?validateHistorySynthesis(raw.historySynthesis,sources,sources.map(s=>s.handle),synthesisDiagnostics):undefined;
  const historySynthesis=strictSynthesis?(synthesis?.length?synthesis:historyFacts.map(f=>({topic:"Historical observations",evidence:[{...f,petId:sources.find(s=>s.handle===f.source).petId,pet:sources.find(s=>s.handle===f.source).petName,eventAt:sources.find(s=>s.handle===f.source).eventAt,recordedAt:sources.find(s=>s.handle===f.source).recordedAt}]}))):undefined;
  const selected=[...new Set([...e.sources,...historyFacts.map(f=>f.source),...(historySynthesis??[]).flatMap(t=>t.evidence.map(e=>e.source))])];
  if(task.pets.length>0&&selected.some(h=>!pets.some(p=>task.pets.includes(p.handle)&&p.id===sources.find(s=>s.handle===h).petId)))reject("task_source_pet");
  let status=e.status,reason=e.reason;
  if(strictSynthesis&&["saved_content","saved_continuation"].includes(task.kind)&&(!historySynthesis?.length||synthesisDiagnostics.length)){status="partial";reason="not_answered";}
  if(task.needsOwnerFacts&&!ownerFacts.length){status="partial";reason="missing_context";}
  if(rejectedFact){status="partial";reason="not_answered";}
  if(scopeMissing(task)||task.kind!=="vet_brief"&&task.missing.length){status="unresolved";reason="missing_context";}
  if(task.needsHistory&&!selected.length){status="unresolved";reason="source_unavailable";}
  if(task.kind==="saved_content"&&!task.needsHistory&&task.recordMode==="none"&&!task.reference&&!task.missing.length&&!selected.length){status="unresolved";reason="source_unavailable";}
  if(status==="complete"&&task.kind==="vet_brief"&&(!e.ownerFacts.length&&!e.historyFacts.length||task.needsHistory&&!e.historyFacts.length)){status="partial";reason="not_answered";}
  if(status==="complete"&&!e.componentIndexes.length&&!e.historyFacts.length&&!e.ownerFacts.length&&!["workflow","calculation"].includes(task.kind)){status="unresolved";reason="not_answered";}
  if(status!=="complete"&&reason==="none")reason="not_answered";
  return {...task,...e,missing:task.needsOwnerFacts&&!ownerFacts.length?[...new Set([...task.missing,"owner_observation"])]:task.missing,historyFacts,ownerFacts,historySynthesis,synthesisDiagnostics,status,reason,sources:selected};
 });
 const value={...final,sources:[...new Set([...final.sources,...tasks.flatMap(t=>t.sources)])]};delete value.completion;
 return {value,tasks};
}
// Calendar attribution is rendered from the selected original source, not from
// a generated month/year paraphrase. Independent general tasks are untouched.
function undatedCollectionSynthesis(text){
 // Coverage counts have one authority: the executor's structured coverage.
 // Keep generated synthesis, and let exact source facts carry calendar labels.
 const quantities="(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty)";
 const countClaim=new RegExp("\\b"+quantities+"\\s+(?:(?:saved|owned|distinct|monthly|care|historical)\\s+)*(?:notes|records|entries)\\b","i");
 const prose=text.split(/(?<=[.!?])\s+/).filter(sentence=>!countClaim.test(sentence)).join(" ");
 const month="(?:[Jj]an(?:uary)?|[Ff]eb(?:ruary)?|[Mm]ar(?:ch)?|[Aa]pr(?:il)?|May|[Jj]un(?:e)?|[Jj]ul(?:y)?|[Aa]ug(?:ust)?|[Ss]ep(?:tember)?|[Oo]ct(?:ober)?|[Nn]ov(?:ember)?|[Dd]ec(?:ember)?)";
 const year="(?:19|20|21)\\d{2}(?:-\\d{2}-\\d{2})?";
 const calendar="(?:"+month+"(?:\\s+\\d{1,2}(?:st|nd|rd|th)?\\b,?)?(?:\\s+"+year+")?|"+year+")";
 const range=calendar+"(?:\\s*(?:,|[-–]|through|to|and)\\s*(?:and\\s+)?"+calendar+")*";
 return prose.replace(new RegExp("\\b(?:(?:[Aa]cross|[Ff]rom|[Ii]n|[Dd]uring|[Tt]hrough|[Tt]o|[Bb]y|[Aa]round|[Ss]ince|[Bb]etween)\\s+)?(?:(?:early|mid|late)(?:-to-(?:early|mid|late))?[- ])?"+range+"\\b(?:\\s*,)?","g"),"")
  .replace(/(^|\n)\s*:\s*/g,"$1")
  .replace(/[ \t]{2,}/g," ")
  .replace(/(?:,\s*){2,}/g,", ")
  .replace(/,\s*(?:and\s*,\s*)+(?:and\s+)?/gi,", and ")
  .replace(/([.!?])\s*[,;:]\s*/g,"$1 ")
  .replace(/\b(?:and|or)\s+(?=[,.;!?])/g,"")
  .replace(/,\s*([.!?])/g,"$1")
  .replace(/ +([,.!?;:])/g,"$1")
  .replace(/(^|[.!?]\s+)(\p{Ll})/gu,(_match,separator,letter)=>separator+letter.toUpperCase())
  .replace(/\bA entry\b/g,"An entry").replace(/\ba entry\b/g,"an entry")
  .trim();
}
/** A sole source-free conditional care question already has typed clinical
 * meaning. Reclassify its deliverable, never its events or read authority. */
export function reconcileConditionalEducation(plan,assessment,calls=[]){
 if(plan?.length!==1||calls.length||assessment?.protocolVersion!==3||assessment.careContext!=="education"||assessment.scenario!=="hypothetical"||assessment.medicationIntent!=="none"||assessment.currentEvents?.length!==0||!assessment.conditionalEvents?.length||assessment.missingContext?.length)return null;
 const t=plan[0];
 if(t.kind!=="general_guidance"||t.needsHistory||t.needsOwnerFacts||t.recordMode!=="none"||t.combineHistory||t.includeSourceDates||t.reference!==null||t.missing.length)return null;
 return [{...t,kind:"clinical_guidance"}];
}
const missingLabels={pet:"pet",year:"year",date_meaning:"whether you mean the event date or save date",which_record:"saved result",owner_observation:"observations you want included",medicine:"medicine name and strength",prescription:"exact prescription",vet_plan:"prescriber's instructions"};
export function renderTaskCompletion(answer,tasks,sources,policy,coverage=[]){
 if(!tasks)return answer;
 if(!policy?.active){
  tasks=completeFreshHistory(tasks,sources,coverage);
  // These handles come from the already owner/reference-bound acquisition,
  // not a model claim of membership or permission for another read.
  answer={...answer,sources:[...new Set([...(answer.sources??[]),...tasks.flatMap(t=>t.freshRepresentedHandles??[])])]};
 }
 const firstBrief=tasks.find(t=>t.kind==="vet_brief")?.id;
 tasks=tasks.map(t=>{
  if(t.kind==="workflow"&&t.workflow==="other")return {...t,status:"unresolved",reason:"not_supported"};
  if(t.kind==="vet_brief"&&t.id!==firstBrief)return {...t,status:"partial",reason:"not_answered"};
  const boundedClinicalDelivery=t.kind==="clinical_guidance"&&answer.clinicalDisplayBounded===true&&!policy?.decision&&!!(policy?.current?.length||policy?.conditional?.length)&&!t.needsHistory&&!t.needsOwnerFacts&&!t.missing.length&&t.reference===null&&!t.sources.length;
   if(policy?.active&&t.status==="complete"&&(["general_guidance","clinical_guidance"].includes(t.kind)&&!boundedClinicalDelivery||t.kind==="clarification"&&!t.missing.length||["saved_content","saved_continuation"].includes(t.kind)&&!t.historyFacts.length&&!answer.quotes?.some(q=>t.sources.includes(q.source))||t.kind==="owner_observations"&&!t.ownerFacts.length))return {...t,status:"partial",reason:"not_answered"};
  if(t.kind==="calculation"){
   const scoped=(answer.calculations??[]).filter(c=>Array.isArray(c.sourceHandles)&&c.sourceHandles.length&&c.sourceHandles.every(h=>t.sources.includes(h)));
   if(!scoped.length||scoped.some(c=>c.available===false)||!t.sources.length||t.sources.some(h=>!scoped.some(c=>c.sourceHandles.includes(h))))return {...t,status:"unresolved",reason:"not_answered"};
  }
  if(t.combineHistory){
   const petIds=new Set(sources.filter(s=>t.sources.includes(s.handle)).map(s=>s.petId));
   const groups=coverage.filter(r=>r.scope.kind!=="profile"&&r.sources.some(s=>sources.some(actual=>actual.handle===s.source&&petIds.has(actual.petId))));
   const prior=new Set(groups.filter(r=>r.scope.evidenceRole==="retained_prior").flatMap(r=>r.sources.map(s=>s.source)));
   const fresh=new Set(groups.filter(r=>r.scope.evidenceRole==="fresh_remainder").flatMap(r=>r.sources.map(s=>s.source)));
   const displayed=[...t.historyFacts.map(f=>f.source),...(!policy?.active?(t.historySynthesis??[]).flatMap(theme=>theme.evidence.map(e=>e.source)):[])];
   if(!displayed.some(h=>prior.has(h))||!displayed.some(h=>fresh.has(h)))return {...t,status:"partial",reason:"not_answered",combinedEvidenceMissing:true};
  }
  const relevant=coverage.filter(r=>r.sources.some(s=>t.sources.includes(s.source)));
  if(t.needsHistory&&t.recordMode==="collection"&&relevant.some(r=>r.scope.goal==="complete_set"&&(r.omitted>0||r.hasMore||r.hasPrevious||r.truncated||r.unmet?.includes("prior_source_selection_omitted"))))return {...t,status:"partial",reason:"source_omitted"};
  return t;
 });
 const blocked=new Set(tasks.filter(t=>t.status==="unresolved"||t.needsHistory&&!t.sources.length||t.needsOwnerFacts&&!t.ownerFacts.length).flatMap(t=>t.componentIndexes));
 tasks=tasks.map(t=>t.status==="complete"&&t.componentIndexes.some(i=>blocked.has(i))?{...t,status:"partial",reason:"not_answered"}:t);
 const unavailableDetails=new Set(tasks.filter(t=>t.kind==="saved_content"&&!t.reference&&!t.missing.length&&!t.sources.length&&t.reason==="source_unavailable").map(t=>t.id));
 const workflowParts=new Set(tasks.filter(t=>t.kind==="workflow").flatMap(t=>t.componentIndexes));
 tasks=tasks.map(t=>t.kind!=="workflow"&&t.status==="complete"&&t.componentIndexes.some(i=>workflowParts.has(i))?{...t,status:"partial",reason:"not_answered"}:t);
 const calculationParts=new Set(tasks.filter(t=>t.kind==="calculation"&&answer.calculations?.length).flatMap(t=>t.componentIndexes));
 const assigned=new Set(tasks.filter(t=>t.kind!=="workflow").flatMap(t=>t.componentIndexes).filter(i=>!workflowParts.has(i)));
 const brief=tasks.find(t=>t.kind==="vet_brief"),clarify=tasks.filter(t=>t.missing.length);
 const collectionTasks=tasks.filter(t=>t.needsHistory&&t.recordMode==="collection"&&["saved_content","saved_continuation"].includes(t.kind));
 const collectionParts=new Set(collectionTasks.flatMap(t=>t.componentIndexes));
 const selectedDatedFacts=collectionTasks.flatMap(t=>t.historyFacts).slice(0,6);
 const citationHandles=sources.filter(s=>(answer.sources??[]).includes(s.handle)).map(s=>s.handle);
 let removedCalendar=false;const renderedGrounding=new Set(),renderedEvidence=[];
 const groundingKey=t=>JSON.stringify([t.kind,t.recordMode,[...t.sources].sort()]);
 const eligibleGrounding=tasks.filter(t=>["saved_content","saved_continuation"].includes(t.kind)&&t.historySynthesis!==undefined&&t.componentIndexes.some(i=>assigned.has(i)&&!blocked.has(i)&&!calculationParts.has(i)));
 let text=!policy?.active&&answer.validatedParts?answer.validatedParts.filter(p=>assigned.has(p.index)&&!blocked.has(p.index)&&!calculationParts.has(p.index)).map(p=>{
  if(!collectionParts.has(p.index)&&!tasks.some(t=>t.componentIndexes.includes(p.index)&&["saved_content","saved_continuation"].includes(t.kind)&&t.historySynthesis!==undefined))return p.text;
  const grounded=tasks.filter(t=>t.componentIndexes.includes(p.index)&&["saved_content","saved_continuation"].includes(t.kind)&&t.historySynthesis!==undefined);
  if(grounded.length){
    const keys=new Set(grounded.map(groundingKey)),peers=eligibleGrounding.filter(t=>keys.has(groundingKey(t))),unseen=peers.filter(t=>!renderedGrounding.has(t.id));
    peers.forEach(t=>renderedGrounding.add(t.id));if(!unseen.length)return "";
    const themes=unseen.flatMap(t=>t.historySynthesis??[]);renderedEvidence.push(...visibleHistoryEvidence(themes));
    return renderHistorySynthesis(themes,citationHandles,tasks.flatMap(t=>t.freshSourceHandles??[]))||"The historical synthesis could not be verified against the selected original sentences.";
   }
  const safe=undatedCollectionSynthesis(p.text);removedCalendar||=safe!==p.text.trim();return safe;
 }).filter(Boolean).join("\n\n"):answer.answer,verifiedBriefText=null;
 if(!policy?.active&&!brief&&selectedDatedFacts.length){
  const freshHandles=new Set(tasks.flatMap(t=>t.freshSourceHandles??[])),freshRows=[];
  const rows=selectedDatedFacts.flatMap(f=>{
   const s=sources.find(s=>s.handle===f.source),withRecorded=collectionTasks.some(t=>t.includeSourceDates&&t.historyFacts.includes(f));
   const alreadyQuoted=renderedEvidence.some(e=>e.source===f.source&&e.excerpt.includes(f.excerpt));
   if(alreadyQuoted&&!withRecorded)return [];
   const index=citationHandles.indexOf(f.source),citation=index>=0?" (Source "+(index+1)+")":"";
   const row="• "+s.petName+" — event "+s.eventAt.slice(0,10)+(withRecorded?"; recorded "+s.recordedAt.slice(0,10):"")+(alreadyQuoted?citation:": “"+f.excerpt+"”");
   if(freshHandles.has(f.source)){freshRows.push(row);return [];}
   return [row];
  });
  if(freshRows.length)text+="\n\nNewly read omitted-interval notes:\n"+[...new Set(freshRows)].join("\n");
  if(rows.length)text+="\n\nSelected historical dates and details:\n"+[...new Set(rows)].join("\n");
 }

 if(removedCalendar&&!selectedDatedFacts.length){
  text+="\n\nI couldn't verify the generated date-specific wording. The source cards retain the original dated records.";
  tasks=tasks.map(t=>collectionTasks.includes(t)?{...t,status:"partial",reason:"not_answered"}:t);
 }
 if(brief){
  const facts=[];
  if(brief.ownerFacts.length)facts.push("Owner-reported observations:\n"+brief.ownerFacts.map(f=>"• "+f.excerpt).join("\n"));
  if(brief.historyFacts.length)facts.push("Saved historical background (not a current diagnosis):\n"+brief.historyFacts.map(f=>{const s=sources.find(s=>s.handle===f.source);return "• "+s.petName+" — event "+s.eventAt+"; recorded "+s.recordedAt+": “"+f.excerpt+"”";}).join("\n"));
  if(brief.needsHistory&&!brief.historyFacts.length)facts.push("Historical background remains unresolved: no source-backed historical fact was supplied for this brief. Referenced records must be re-read and verified.");
  if(policy?.briefQuestions?.length)facts.push("Questions and unknowns for the veterinarian:\n"+policy.briefQuestions.map(q=>"• "+q).join("\n"));
  if(policy?.missing?.length)facts.push("Details to confirm for the veterinarian (not supplied here): "+policy.missing.map(k=>missingLabels[k]??k).join("; ")+".");
  verifiedBriefText=["Vet brief",...facts].join("\n\n");
  text=[policy?.active?answer.answer:null,verifiedBriefText].filter(Boolean).join("\n\n");
  answer={...answer,ownerReports:[],presentation:{...answer.presentation,sourceDates:[]}};
 }
 if(unavailableDetails.size){
  const detail=unavailableDetails.size===1?"that detail":"those details",pronoun=unavailableDetails.size===1?"it":"them";
  text=[text,"I don't have verified saved information for "+detail+", so I can't answer "+pronoun+" from Furvise."].filter(Boolean).join("\n\n");
 }
 if(clarify.length){
  const fields=[...new Set(clarify.flatMap(t=>t.missing.filter(k=>!policy?.active||!["medicine","prescription","vet_plan"].includes(k)).filter(k=>k!=="pet"||!policy?.current?.length&&!policy?.conditional?.length||t.needsHistory)))];
  const question=fields.length===1&&fields[0]==="date_meaning"?"Should I use the event date or the save date?":"Which "+fields.map(f=>missingLabels[f]).join(" and ")+" should I use?";
  if(fields.length)text=!policy?.active&&tasks.every(t=>t.missing.length)?question:text+"\n\n"+question;
 }
 if(policy?.active&&!brief){
  const facts=tasks.flatMap(t=>t.historyFacts).map(f=>{const s=sources.find(s=>s.handle===f.source);return s.petName+" — event "+s.eventAt+"; recorded "+s.recordedAt+": “"+f.excerpt+"”";});
  if(facts.length)text+="\n\nSaved historical facts (not a current diagnosis):\n"+[...new Set(facts)].join("\n");
 }
 const incomplete=tasks.filter(t=>t.status!=="complete");
 const labels={saved_content:"Saved history",saved_continuation:"Remaining history",owner_observations:"Owner observations",calculation:"Calculation",vet_brief:"Vet brief",clarification:"Clarification",general_guidance:"General guidance",clinical_guidance:"Care guidance",workflow:"App steps"};
 const reasonsText={missing_context:"Essential context for this part is missing; please repeat the relevant details.",source_unavailable:"The saved-record part remains unresolved: no verified source was supplied for it.",source_omitted:"This part is incomplete because some source bodies were omitted by the evidence limit.",not_supported:"This requested action is unavailable through read-only Ask.",not_answered:"This requested part has not been completed from the available information."};
 for(const task of incomplete.filter(t=>!t.missing.length&&t!==brief&&!unavailableDetails.has(t.id))){
  const relevant=coverage.filter(r=>r.sources.some(s=>task.sources.includes(s.source)));
  const retainedSubset=task.reason==="source_omitted"&&relevant.some(r=>r.unmet?.includes("prior_source_selection_omitted"))
   &&!relevant.some(r=>r.omitted>0||r.hasMore||r.hasPrevious||r.truncated);
  if(task.historySynthesis!==undefined&&task.reason==="source_omitted"&&relevant.some(r=>r.omitted>0||r.hasMore||r.hasPrevious||r.truncated))continue;
  const detail=task.freshEvidenceMissing?"Some freshly read notes could not be represented within this bounded answer; the combined findings remain incomplete.":task.combinedEvidenceMissing?"The combined picture is incomplete: it has not selected verified facts from both the earlier and newly fetched records.":retainedSubset?"This part uses only the bounded source selection retained from an earlier result; the other earlier bodies were not re-read for this answer.":reasonsText[task.reason];
  if(detail&&!text.includes(detail))text+="\n\n"+labels[task.kind]+": "+detail;
 }
 const dateHandles=[...new Set(tasks.filter(t=>t.includeSourceDates).flatMap(t=>t.sources))].filter(h=>!brief?.historyFacts.some(f=>f.source===h));
 const sourceDates=dateHandles.filter(h=>!tasks.some(t=>t.recordMode==="collection"&&t.sources.includes(h))).map(h=>{const s=sources.find(s=>s.handle===h);return {kind:s.kind,eventAt:s.eventAt,recordedAt:s.recordedAt,pet:s.petName??null};});
 const historicalSupport=[...new Set([...tasks.filter(t=>t.status!=="unresolved").flatMap(t=>t.historyFacts.map(f=>f.source)),...renderedEvidence.map(e=>e.source)])].filter(h=>(answer.sources??[]).includes(h));
 const collectionOnly=collectionTasks.length>0&&!tasks.some(t=>t.needsHistory&&t.recordMode!=="collection")&&!coverage.some(r=>r.scope.goal==="exact_quote");
 return {...answer,answer:text,historicalSupport,continuationEvidenceReview:tasks.flatMap(t=>t.continuationEvidenceReview?[{task:t.id,...t.continuationEvidenceReview}]:[]),...(collectionOnly?{quotes:[]}:{}),...(verifiedBriefText?{verifiedBriefText}:{}),...(policy?.active?{ownerReports:brief?[]:[...new Set(tasks.flatMap(t=>t.ownerFacts.map(f=>f.excerpt)))]}:{}),presentation:{...answer.presentation,sourceDates,contextRequired:tasks.some(t=>t.missing.includes("which_record"))&&answer.presentation?.contextRequired===true},taskCompletion:tasks.map(t=>({id:t.id,kind:t.kind,status:t.status,reason:t.reason,sourceCount:t.sources.length})),limited:incomplete.length>0||!!policy?.decision,replyType:!policy?.active&&clarify.length&&tasks.every(t=>t.missing.length)?"clarification":incomplete.length||policy?.decision?"partial":answer.replyType==="refusal"&&!policy?.active&&tasks.every(t=>t.kind==="general_guidance"&&!t.needsHistory&&!t.needsOwnerFacts&&t.status==="complete")?"refusal":"answer"};
}

/** Resolve record-choice ambiguity only after a fully inspected bounded search
 * yields one admitted candidate. Reference hints and partial pages are not proof. */
export function resolveRecordDiscovery(plan,bound,results,context=null){
 if(!plan)return {plan,resolved:0};let resolved=0;
 const updated=plan.map(task=>{
  if(!task.needsHistory||task.pets.length!==1||!task.missing.includes("which_record")||task.missing.some(k=>["pet","year","date_meaning"].includes(k)))return task;
  // A stale task reference is not the identity of a new corrected-scope read.
  // Resolve it only from an explicit calendar/owned-pet scope and a fully
  // inspected unique fresh candidate; never from the old reference metadata.
  if(task.reference!==null){
   if(task.kind!=="saved_content"||task.recordMode!=="single"||!context||!["event","recorded"].includes(context.timeBasis)
    ||plan.some(other=>other!==task&&other.needsHistory&&other.pets.includes(task.pets[0])))return task;
   const calendar=explicitCalendarWindow(context.question);if(!calendar)return task;
   const escaped=name=>name.replace(/[.*+?$^{}()|[\]\\]/g,"\\$&");
   const named=context.pets.filter(p=>new RegExp("(?<![\\p{L}\\p{N}])"+escaped(p.name)+"(?![\\p{L}\\p{N}])","iu").test(context.question));
   if(named.length!==1||named[0].handle!==task.pets[0])return task;
   const matching=bound.filter(c=>c.request.pet.handle===task.pets[0]);
   if(matching.some(c=>c.request.reference||c.request.continuation)||!matching.length)return task;
   const event=context.timeBasis==="event";
   if(matching.some(c=>c.request.kind!=="history"||(event
    ?c.request.from!==calendar.from||c.request.to!==calendar.to||c.request.recordedFrom||c.request.recordedTo
    :c.request.recordedFrom!==calendar.from||c.request.recordedTo!==calendar.to||c.request.from||c.request.to)))return task;
  }
  const searches=bound.map((call,index)=>({request:call.request,result:results[index]})).filter(({request})=>request.kind==="history"&&!request.reference&&request.pet.handle===task.pets[0]);
  if(!searches.length)return task;
  // Several discovery lanes or sort orders may describe the same candidate.
  // Each must be complete; uniqueness belongs to the admitted source union.
  const unique=new Set();
  for(const {request,result} of searches){
   const bounded=!!(request.from&&request.to||request.recordedFrom&&request.recordedTo);
   if(!bounded||!result?.queryScopeExhausted||result.truncated||result.hasPrevious||result.hasMore||result.unmet.length||result.inspected!==1||result.sources.length!==1)return task;
   unique.add(result.sources[0].source);
  }
  if(unique.size!==1)return task;
  resolved++;return {...task,reference:null,missing:task.missing.filter(k=>k!=="which_record")};
 });
 return {plan:updated,resolved};
}

/** A validated set read establishes requested cardinality, not source identity.
 * A selected bound reference resolves identity only for its matching task. */
export function normalizeTaskRecords(plan,bound=[]){
 if(!plan)return plan;
 return plan.map(t=>{
  const matching=bound.filter(c=>t.pets.includes(c.request.pet.handle)&&(!t.reference||c.reference===t.reference));
  // A pet match does not identify which requested task a set read serves.
  // Recover a mislabeled sole history task, but preserve independent single-
  // record identity when several tasks share that pet.
  const soleHistoryTask=t.needsHistory&&!plan.some(other=>other!==t&&other.needsHistory&&other.pets.some(p=>t.pets.includes(p)));
  const collection=t.recordMode==="collection"||t.kind==="saved_continuation"||soleHistoryTask&&matching.some(c=>c.request.goal==="complete_set"&&!c.request.reference);
  const referenced=t.reference&&matching.some(c=>c.reference===t.reference&&(c.request.reference||c.request.continuation));
  return {...t,recordMode:collection?"collection":t.recordMode,missing:t.missing.filter(k=>k!=="which_record"||!collection&&!referenced)};
 });
}
