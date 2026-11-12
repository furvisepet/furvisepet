/** Requested work is independent of prose mode. References remain hints until
 * owner-bound rehydration; fact excerpts gain authority only by exact matching. */
const object=properties=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
const choice=values=>({type:"string",enum:values});
const kinds=["saved_content","saved_continuation","owner_observations","calculation","vet_brief","clarification","general_guidance","workflow"];
const workflows=["none","create_care_note","find_care_note","care_photo_attachment","other"];
const missing=["pet","year","date_meaning","which_record","owner_observation","medicine","prescription","vet_plan"];
const scopeMissing=t=>t.missing.some(v=>["pet","year","date_meaning","which_record"].includes(v));
const reasons=["none","missing_context","source_unavailable","source_omitted","not_supported","not_answered"];
const array=(items,maxItems)=>({type:"array",items,maxItems});
const nullable=values=>({type:["string","null"],enum:[...values,null]});
const keys=(v,expected)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k));
function reject(field){throw Object.assign(new Error("ASK_READ_COMPONENT_CONTRACT"),{code:"ASK_READ_COMPONENT_CONTRACT",answerDiagnostic:{category:"component_contract",field}});}
export const COMPONENT_INSTRUCTIONS=[
 "Set includeSourceDates only for tasks whose source timestamps the owner requests in the answer, not merely because a note has dates. The server publishes those requested verified dates once; do not repeat them in component prose. calculation means arithmetic over saved typed measurements; ordinary math without saved-record dependency belongs general_guidance.",
 "Plan every essential requested task separately in taskPlan. saved_content means Ask retrieves/quotes/explains owned records, NOT instructions for finding them. workflow is ONLY an explicit request for how to operate Furvise screens or for an action Ask cannot perform. Do not create a workflow task merely because a question mentions notes, saved dates, history, a diary or a vet brief.",
 "For explicit remaining/continue requests use saved_continuation and the selected reference with an omittedEventRange; read_remaining_records performs a fresh bounded search of that omitted range, not a snapshot cursor. It may repeat same-day boundary records. Do not use the prior eight retained source bodies as the omitted remainder. For a workflow task, workflow selects the actual screen operation; a photo into a care/history note uses care_photo_attachment, not other. For all non-workflow tasks workflow must be none.",
 "A vet_brief is an actual concise handoff: relevant owner-reported observations, dated original historical facts, and questions/unknowns. Set needsHistory when saved notes/results are requested. Set needsOwnerFacts when current/prior user observations must be included (including what I just told you), and always for owner_observations tasks. Do not mark those tasks complete without actual eligible owner facts. Select the relevant retained reference handle and authorized pets, then re-read it. A prior assistant answer or reference metadata is never source evidence. A corrected pet/date overrides a prior result; plan a new scoped read instead. When the referenced result is ambiguous, ask which one rather than choosing arbitrarily.",
 "For any requested saved/profile content or calculation set needsHistory=true and bind pets to all explicitly named or unambiguously established authorized subjects. A comparison/calculation may have multiple pets; keep each tool read pet/time scoped. An empty pets list is not permission to guess from the selected UI pet. A selected reference carries its own authorized pet. General guidance alone does not require saved reads.",
 "missing identifies what is genuinely unresolved. A vague month with no established pet/year requires one pointed pet/year question; do not use the UI-selected pet as evidence of a pronoun. An explicit pet plus month/year is sufficient; do not demand a day. Clinical missing authority must not prevent an independently scoped saved-data task.",
 "In the final completion array account for EACH task ID once. Select componentIndexes for independently answerable ordinary prose, sources for current admitted evidence, and exact factual excerpts for a vet brief. ownerFacts excerpts must be short COMPLETE verbatim sentences preserving negation, attribution and caveats; declarative observations from the selected USER statement, not their request, an assistant assertion, speculation, or a question. historyFacts excerpts must be one or more CONTIGUOUS COMPLETE sentences occurring byte-for-byte in an admitted note, preserving negation and attribution. Never generate a diagnosis or regimen directive in these excerpts; historical plans remain historical quotations. Questions for the vet come from the bounded clinical review fields. Do not put extra clinical recommendations into a summary component.",
 "Use complete only when this requested task is actually delivered. Unresolved/partial requires a specific reason. Preserve the other completed tasks. Do not add a generic partial/context notice when all requested components are delivered. Do not repeat server dates or arithmetic in model prose; the server publishes them once. Source omissions limit only the affected task; never claim a complete collection when bodies are omitted."
].join("\n");
export function componentSelectionSchema(base,context){
 const out=structuredClone(base);
 out.properties.taskPlan={type:"array",minItems:1,maxItems:6,items:object({
  id:choice(["t1","t2","t3","t4","t5","t6"]),kind:choice(kinds),needsHistory:{type:"boolean"},needsOwnerFacts:{type:"boolean"},includeSourceDates:{type:"boolean"},
  workflow:choice(workflows),pets:array(choice(context.pets.map(p=>p.handle)),4),reference:nullable(context.references.map(r=>r.reference)),
  missing:array(choice(missing),7)
 })};out.required.push("taskPlan");return out;
}
export function validateTaskPlan(plan,context){
 if(!Array.isArray(plan)||!plan.length||plan.length>6||new Set(plan.map(t=>t?.id)).size!==plan.length)reject("plan");
 for(const t of plan){
  if(!keys(t,["id","kind","needsHistory","needsOwnerFacts","includeSourceDates","workflow","pets","reference","missing"])||!/^t[1-6]$/.test(t.id)||!kinds.includes(t.kind)||typeof t.needsHistory!=="boolean"||typeof t.needsOwnerFacts!=="boolean"||typeof t.includeSourceDates!=="boolean"||!Array.isArray(t.missing)||t.missing.length>7||t.missing.some(v=>!missing.includes(v)))reject("task");
  if(!workflows.includes(t.workflow)||(t.kind==="workflow")!==(t.workflow!=="none"))reject("workflow_task");
  if(!Array.isArray(t.pets)||t.pets.length>4||t.pets.some(h=>!context.pets.some(p=>p.handle===h)))reject("pet");
  const reference=context.references.find(r=>r.reference===t.reference);
  if(t.reference!==null&&(!reference||t.pets.length>0&&!t.pets.includes(reference.petHandle)))reject("reference");
 }
 return plan.map(t=>({...t,needsOwnerFacts:t.needsOwnerFacts||t.kind==="owner_observations",missing:[...new Set(t.missing)]}));
}
export function decodeComponentSelection(value,tools,context,decode){
 const taskPlan=validateTaskPlan(value?.taskPlan,context),clean={...value};delete clean.taskPlan;
 return {...decode(clean,tools,context),taskPlan};
}
export function fulfillReferenceReads(first,references=[]){
 if(!first.taskPlan)return first;
 const calls=[...first.calls];
 for(const task of first.taskPlan){
  if(!task.needsHistory||!task.reference||scopeMissing(task))continue;
  if(task.kind==="saved_continuation"&&!references.some(r=>r.handle===task.reference&&r.request.omittedEventRange))continue;
  const tool=task.kind==="saved_continuation"?"read_remaining_records":"read_referenced_sources";
  const duplicate=calls.some(c=>c.name===tool&&JSON.parse(c.arguments).reference===task.reference);
  if(!duplicate&&calls.length<4)calls.push({id:"task-read-"+task.id,name:tool,arguments:JSON.stringify({reference:task.reference})});
 }
 return {...first,calls};
}
export function componentAnswerSchema(base,plan,sources,ownerStatements){
 if(!plan)return base;
 const out=structuredClone(base),handles=sources.map(s=>s.handle),refs=ownerStatements.map(s=>s.ref);
 const exact={type:"string",minLength:1,maxLength:280};
 out.properties.completion={type:"array",minItems:plan.length,maxItems:plan.length,items:object({
  task:choice(plan.map(t=>t.id)),status:choice(["complete","partial","unresolved"]),reason:choice(reasons),
  componentIndexes:array({type:"integer",minimum:0,maximum:7},8),sources:array(choice(handles.length?handles:["unavailable"]),handles.length?32:0),
  ownerFacts:array(object({ref:choice(refs.length?refs:["unavailable"]),excerpt:exact}),refs.length?4:0),
  historyFacts:array(object({source:choice(handles.length?handles:["unavailable"]),excerpt:exact}),handles.length?6:0)
 })};out.required.push("completion");return out;
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
  const e=entries.find(e=>e.task===task.id);
  if(!keys(e,["task","status","reason","componentIndexes","sources","ownerFacts","historyFacts"])||!["complete","partial","unresolved"].includes(e.status)||!reasons.includes(e.reason)||!Array.isArray(e.componentIndexes)||e.componentIndexes.length>8||e.componentIndexes.some(i=>!Number.isInteger(i)||!final.components?.[i])||!Array.isArray(e.sources)||e.sources.length>32||e.sources.some(h=>!sources.some(s=>s.handle===h)))reject("completion_shape");
  let rejectedFact=false;
  for(const [field,refKey,pool,bodyKey] of [["ownerFacts","ref",ownerStatements,"text"],["historyFacts","source",sources,"body"]]){
   if(!Array.isArray(e[field])||e[field].length>(field==="ownerFacts"?4:6))reject("fact_shape");
   for(const f of e[field]){const row=pool.find(s=>(s.ref??s.handle)===f?.[refKey]);
    if(!keys(f,[refKey,"excerpt"])||typeof f.excerpt!=="string"||!f.excerpt.trim()||f.excerpt.length>280||!row)reject("fact_reference");
    if(!completeSentence(row[bodyKey],f.excerpt)||field==="historyFacts"&&row.kind!=="history")rejectedFact=true;
   }
  }
  const historyFacts=e.historyFacts.filter(f=>sources.some(s=>s.handle===f.source&&s.kind==="history"&&completeSentence(s.body,f.excerpt)));
  const ownerFacts=e.ownerFacts.filter(f=>ownerStatements.some(s=>s.ref===f.ref&&completeSentence(s.text,f.excerpt)));
  const selected=[...new Set([...e.sources,...historyFacts.map(f=>f.source)])];
  if(task.pets.length>0&&selected.some(h=>!pets.some(p=>task.pets.includes(p.handle)&&p.id===sources.find(s=>s.handle===h).petId)))reject("task_source_pet");
  let status=e.status,reason=e.reason;
  if(task.needsOwnerFacts&&!ownerFacts.length){status="partial";reason="missing_context";}
  if(rejectedFact){status="partial";reason="not_answered";}
  if(scopeMissing(task)||task.kind!=="vet_brief"&&task.missing.length){status="unresolved";reason="missing_context";}
  if(task.needsHistory&&!selected.length){status="unresolved";reason="source_unavailable";}
  if(status==="complete"&&task.kind==="vet_brief"&&(!e.ownerFacts.length&&!e.historyFacts.length||task.needsHistory&&!e.historyFacts.length)){status="partial";reason="not_answered";}
  if(status==="complete"&&!e.componentIndexes.length&&!e.historyFacts.length&&!e.ownerFacts.length&&task.kind!=="workflow"){status="unresolved";reason="not_answered";}
  if(status!=="complete"&&reason==="none")reason="not_answered";
  return {...task,...e,missing:task.needsOwnerFacts&&!ownerFacts.length?[...new Set([...task.missing,"owner_observation"])]:task.missing,historyFacts,ownerFacts,status,reason,sources:selected};
 });
 const value={...final,sources:[...new Set([...final.sources,...tasks.flatMap(t=>t.sources)])]};delete value.completion;
 return {value,tasks};
}
const missingLabels={pet:"pet",year:"year",date_meaning:"whether you mean the event date or save date",which_record:"saved result",owner_observation:"observations you want included",medicine:"medicine name and strength",prescription:"exact prescription",vet_plan:"prescriber's instructions"};
export function renderTaskCompletion(answer,tasks,sources,policy,coverage=[]){
 if(!tasks)return answer;
 const firstBrief=tasks.find(t=>t.kind==="vet_brief")?.id;
 tasks=tasks.map(t=>{
  if(t.kind==="workflow"&&t.workflow==="other")return {...t,status:"unresolved",reason:"not_supported"};
  if(t.kind==="vet_brief"&&t.id!==firstBrief)return {...t,status:"partial",reason:"not_answered"};
  if(policy?.active&&t.status==="complete"&&(t.kind==="general_guidance"||t.kind==="clarification"&&!t.missing.length||["saved_content","saved_continuation"].includes(t.kind)&&!t.historyFacts.length&&!answer.quotes?.some(q=>t.sources.includes(q.source))||t.kind==="owner_observations"&&!t.ownerFacts.length))return {...t,status:"partial",reason:"not_answered"};
  if(t.kind==="calculation"&&(!answer.calculations?.length||answer.calculations.some(c=>c.available===false)))return {...t,status:"unresolved",reason:"not_answered"};
  const relevant=coverage.filter(r=>r.sources.some(s=>t.sources.includes(s.source)));
  if(t.needsHistory&&relevant.some(r=>r.scope.goal==="complete_set"&&(r.omitted>0||r.hasMore||r.hasPrevious||r.truncated)))return {...t,status:"partial",reason:"source_omitted"};
  return t;
 });
 const blocked=new Set(tasks.filter(t=>t.status==="unresolved"||t.needsHistory&&!t.sources.length||t.needsOwnerFacts&&!t.ownerFacts.length).flatMap(t=>t.componentIndexes));
 tasks=tasks.map(t=>t.status==="complete"&&t.componentIndexes.some(i=>blocked.has(i))?{...t,status:"partial",reason:"not_answered"}:t);
 const workflowParts=new Set(tasks.filter(t=>t.kind==="workflow").flatMap(t=>t.componentIndexes));
 tasks=tasks.map(t=>t.kind!=="workflow"&&t.status==="complete"&&t.componentIndexes.some(i=>workflowParts.has(i))?{...t,status:"partial",reason:"not_answered"}:t);
 const assigned=new Set(tasks.filter(t=>t.kind!=="workflow").flatMap(t=>t.componentIndexes).filter(i=>!workflowParts.has(i)));
 const brief=tasks.find(t=>t.kind==="vet_brief"),clarify=tasks.filter(t=>t.missing.length);
 const incomplete=tasks.filter(t=>t.status!=="complete");
 let text=!policy?.active&&answer.validatedParts?answer.validatedParts.filter(p=>assigned.has(p.index)&&!blocked.has(p.index)).map(p=>p.text).join("\n\n"):answer.answer,verifiedBriefText=null;
 if(brief){
  const facts=[];
  if(brief.ownerFacts.length)facts.push("Owner-reported observations:\n"+brief.ownerFacts.map(f=>"• "+f.excerpt).join("\n"));
  if(brief.historyFacts.length)facts.push("Saved historical background (not a current diagnosis):\n"+brief.historyFacts.map(f=>{const s=sources.find(s=>s.handle===f.source);return "• "+s.petName+" — event "+s.eventAt+"; recorded "+s.recordedAt+": “"+f.excerpt+"”";}).join("\n"));
  if(brief.needsHistory&&!brief.historyFacts.length)facts.push("Historical background remains unresolved: no source-backed historical fact was supplied for this brief. Referenced records must be re-read and verified.");
  if(policy?.missing?.length)facts.push("Details to confirm for the veterinarian (not supplied here): "+policy.missing.map(k=>missingLabels[k]??k).join("; ")+".");
  verifiedBriefText=["Vet brief",...facts].join("\n\n");
  text=[policy?.active?answer.answer:null,verifiedBriefText].filter(Boolean).join("\n\n");
  answer={...answer,ownerReports:[],presentation:{...answer.presentation,sourceDates:[]}};
 }
 if(clarify.length){
  const fields=[...new Set(clarify.flatMap(t=>t.missing))];
  const question="Which "+fields.map(f=>missingLabels[f]).join(" and ")+" should I use?";
  text=!policy?.active&&tasks.every(t=>t.missing.length)?question:text+"\n\n"+question;
 }
 if(policy?.active&&!brief){
  const facts=tasks.flatMap(t=>t.historyFacts).map(f=>{const s=sources.find(s=>s.handle===f.source);return s.petName+" — event "+s.eventAt+"; recorded "+s.recordedAt+": “"+f.excerpt+"”";});
  if(facts.length)text+="\n\nSaved historical facts (not a current diagnosis):\n"+[...new Set(facts)].join("\n");
 }
 const labels={saved_content:"Saved history",saved_continuation:"Remaining history",owner_observations:"Owner observations",calculation:"Calculation",vet_brief:"Vet brief",clarification:"Clarification",general_guidance:"General guidance",workflow:"App steps"};
 const reasonsText={missing_context:"Essential context for this part is missing; please repeat the relevant details.",source_unavailable:"The saved-record part remains unresolved: no verified source was supplied for it.",source_omitted:"This part is incomplete because some source bodies were omitted by the evidence limit.",not_supported:"This requested action is unavailable through read-only Ask.",not_answered:"This requested part has not been completed from the available information."};
 for(const task of incomplete.filter(t=>!t.missing.length&&t!==brief))if(reasonsText[task.reason]&&!text.includes(reasonsText[task.reason]))text+="\n\n"+labels[task.kind]+": "+reasonsText[task.reason];
 const dateHandles=[...new Set(tasks.filter(t=>t.includeSourceDates).flatMap(t=>t.sources))].filter(h=>!brief?.historyFacts.some(f=>f.source===h));
 const sourceDates=dateHandles.map(h=>{const s=sources.find(s=>s.handle===h);return {kind:s.kind,eventAt:s.eventAt,recordedAt:s.recordedAt,pet:s.petName??null};});
 return {...answer,answer:text,...(verifiedBriefText?{verifiedBriefText}:{}),...(policy?.active?{ownerReports:brief?[]:[...new Set(tasks.flatMap(t=>t.ownerFacts.map(f=>f.excerpt)))]}:{}),presentation:{...answer.presentation,sourceDates,contextRequired:tasks.some(t=>t.missing.includes("which_record"))&&answer.presentation?.contextRequired===true},taskCompletion:tasks.map(t=>({id:t.id,kind:t.kind,status:t.status,reason:t.reason,sourceCount:t.sources.length})),limited:incomplete.length>0||!!policy?.decision,replyType:!policy?.active&&clarify.length&&tasks.every(t=>t.missing.length)?"clarification":incomplete.length||policy?.decision?"partial":"answer"};
}

/** Resolve record-choice ambiguity only after a fully inspected bounded search
 * yields one admitted candidate. Reference hints and partial pages are not proof. */
export function resolveRecordDiscovery(plan,bound,results){
 if(!plan)return {plan,resolved:0};let resolved=0;
 const updated=plan.map(task=>{
  if(!task.needsHistory||task.reference!==null||task.pets.length!==1||!task.missing.includes("which_record")||task.missing.some(k=>["pet","year","date_meaning"].includes(k)))return task;
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
  resolved++;return {...task,missing:task.missing.filter(k=>k!=="which_record")};
 });
 return {plan:updated,resolved};
}
