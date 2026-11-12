import * as legacy from "./clinical.mjs";
import {WORKFLOW_INTENTS} from "./app-capabilities.mjs";
/** Typed display actions, not a diagnosis engine. Recognition remains semantic
 * and must be qualified live; recognized clinical directives never use raw prose.
 */
const object=properties=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
const choice=values=>({type:"string",enum:values});
export const EMERGENCY_EVENTS=Object.freeze({
 breathing_distress:"difficulty breathing or open-mouth breathing in a cat",
 collapse:"collapse, loss of consciousness or inability to respond normally",
 toxin_exposure:"known or suspected exposure to a potentially harmful substance or too much medicine",
 repeated_seizures:"an ongoing or repeated seizure",
 swollen_abdomen_retching:"a suddenly swollen abdomen with repeated unproductive retching",
 unable_to_urinate:"inability to pass urine",
 major_trauma_bleeding:"major trauma or serious uncontrolled bleeding",
 acute_neurologic_change:"sudden paralysis or severe loss of coordination",
 heat_emergency:"suspected heatstroke",
 other_urgent_signs:"another severe or rapidly worsening sign"
});
const contexts=["none","education","organization","current_concern","clinical_history","vet_summary"];
const observations=Object.freeze({
 onset:"when the change began and how it differs from the usual pattern",
 appetite:"what was eaten, what was refused and how that compares with normal",
 drinking:"drinking and whether water is staying down",
 energy:"energy, movement and responsiveness",
 digestion:"vomiting, stool changes and their timing",
 urination:"urination and any difficulty passing urine",
 breathing:"any change in breathing",
 discomfort:"signs of discomfort or a swollen abdomen",
 exposure:"possible exposure, product details, amount and time if known",
 medicines:"medicine packaging, strength, exact prescribed directions and any veterinarian instructions",
 administration:"what was actually given or missed and when, separately from what was prescribed"
});
const list=(values,max=12)=>({type:"array",maxItems:max,items:choice(values)});
export const CLINICAL_ASSESSMENT_SCHEMA=object({
 ...structuredClone(legacy.CLINICAL_ASSESSMENT_SCHEMA.properties),
 careContext:choice(contexts),
 currentEvents:list(Object.keys(EMERGENCY_EVENTS)),
 conditionalEvents:list(Object.keys(EMERGENCY_EVENTS))
});
export const CLINICAL_INSTRUCTIONS=[
 "Classify the CURRENT question using its actual conversational meaning. Earlier dialogue supplies referents, not an automatic clinical mode. careContext distinguishes education, benign organization, a current patient concern, a clinical historical report and preparation of a vet summary.",
 "Current and conditional events are INDEPENDENT lists. A current mild appetite concern can have currentEvents=[] and conditionalEvents containing future emergency warning signs. Never convert an IF warning or resolved past event into a present emergency. Explicit negation is not evidence the event is occurring. Map paraphrases by meaning, not a symptom keyword match.",
 "currentEvents identifies a present or reasonably suspected acute event. Do not require certainty, a pet name or saved records before immediate contact for breathing distress, collapse, toxin/overdose exposure, ongoing/repeated seizures, acute bloat/retching, blocked urination, major trauma/bleeding or acute neurologic signs. conditionalEvents lists severe warning scenarios you would otherwise mention: if they occur, the server supplies IMMEDIATE emergency contact, never merely same-day care.",
 "Medication intent decision includes asking whether to take, omit, catch up, redose, delay, space, taper, replace or restart prescribed medicine, including indirect claims that a changed approach is working because symptoms seem stable. Do not authorize a regimen. Unknown medicine, exact prescription and prescriber plan belong in missingContext when needed. Organization means logging/reminders/label handling or preparing questions without selecting care. General education can explain concepts without a patient-specific schedule.",
 "referent=essential_unknown is for genuinely unresolved pet/source/time/procedure MEANING, not missing clinical authority or the absence of a day within an explicit month/year. Month/year is a complete bounded calendar interval. Do not request a day or permission to search that interval. Missing medicine does not prevent an independently scoped history read.",
 "For a recognized current concern, medication decision, conditional urgent scenario, clinical history or vet summary, final user-visible clinical action text comes from server policy. Put currentEvents/conditionalEvents in clinicalReview.assessment, select useful observationFields and exact ownerStatementRefs. Do not hide extra medical directions in general components; those components are not displayed in these modes. Original saved quotes and server calculations remain available.",
 "Owner statement references identify only the user's visible dialogue or question. Select relevant reported facts for a vet summary, never assistant-generated facts. They are labeled owner reports, not verified saved records or diagnosis. Historical plan descriptions must remain attributed reports, not permission to change current treatment.",
 "Use historyIntent.requested only when the question asks for owned saved information. Choose event versus recorded time explicitly; ambiguous means clarify the relation, never substitute it. General knowledge and routine planning do not require private history. Use clinical_history for clinical interpretation of a historical symptom or treatment report, not ordinary note/date/quotation/measurement comparison requests. Those use careContext=none unless a clinical decision is actually requested. Respect correction of a pet/date and preserve independently answerable parts."
].join("\n");
function reject(field){const e=new Error("ASK_READ_CLINICAL_CONTRACT");e.code="ASK_READ_CLINICAL_CONTRACT";e.answerDiagnostic={category:"clinical_contract",field};throw e;}
const keys=(v,expected)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k));
const v2=value=>value&&Object.hasOwn(value,"careContext");
export function validateClinicalAssessment(value){
 if(!v2(value))return legacy.validateClinicalAssessment(value);
 if(!keys(value,Object.keys(CLINICAL_ASSESSMENT_SCHEMA.properties)))reject("assessment_shape");
 const base=Object.fromEntries(Object.keys(legacy.CLINICAL_ASSESSMENT_SCHEMA.properties).map(k=>[k,value[k]]));
 legacy.validateClinicalAssessment(base);
 if(!contexts.includes(value.careContext))reject("assessment_enum");
 for(const key of ["currentEvents","conditionalEvents"])if(!Array.isArray(value[key])||value[key].length>12||value[key].some(k=>!Object.hasOwn(EMERGENCY_EVENTS,k)))reject("clinical_events");
 return {...value,missingContext:[...new Set(value.missingContext)],currentEvents:[...new Set(value.currentEvents)],conditionalEvents:[...new Set(value.conditionalEvents)]};
}
export function clinicalSelectionSchema(tools){
 const schema=legacy.clinicalSelectionSchema(tools);
 schema.properties.safety=structuredClone(CLINICAL_ASSESSMENT_SCHEMA);
 schema.properties.historyIntent=object({requested:{type:"boolean"},timeBasis:choice(["event","recorded","ambiguous"]),pet:{type:["string","null"],enum:[...tools[0].parameters.properties.pet.enum,null]}});
 schema.properties.workflowIntent=choice([...WORKFLOW_INTENTS]);
 schema.required.push("historyIntent","workflowIntent");return schema;
}
export function decodeClinicalSelection(value,tools){
 if(!keys(value,["safety","reads","draft","historyIntent","workflowIntent"])||!v2(value.safety))reject("selection_shape");
 const safety=validateClinicalAssessment(value.safety);
 if(!keys(value.historyIntent,["requested","timeBasis","pet"])||typeof value.historyIntent.requested!=="boolean"||!["event","recorded","ambiguous"].includes(value.historyIntent.timeBasis))reject("history_intent");
 if(value.historyIntent.pet!==null&&!tools[0].parameters.properties.pet.enum.includes(value.historyIntent.pet))reject("history_pet");
 if(!WORKFLOW_INTENTS.includes(value.workflowIntent))reject("workflow_intent");
 const base=Object.fromEntries(Object.keys(legacy.CLINICAL_ASSESSMENT_SCHEMA.properties).map(k=>[k,safety[k]]));
 const decoded=legacy.decodeClinicalSelection({safety:base,reads:value.reads,draft:value.draft},tools);
 return {...decoded,safety,historyIntent:{...value.historyIntent},workflowIntent:value.workflowIntent};
}
export function ownerStatementCatalog(context,pets,ownerId){
 const denied=[ownerId,...pets.map(p=>p.id)].filter(v=>typeof v==="string"&&v.length>=16);
 const items=context.dialogue.map((turn,index)=>({text:turn.text,dialogueIndex:index,role:turn.role})).filter(t=>t.role==="user").slice(-5);
 items.push({text:context.question,question:true,role:"user"});
 return items.filter(t=>typeof t.text==="string"&&t.text.length<=1200&&!denied.some(id=>t.text.includes(id))&&!/\b[ps]\d+(?::m\d+)?\b/.test(t.text))
 .map((t,index)=>({...t,ref:"owner"+(index+1)}));
}
export function clinicalAnswerSchema(schema,initial,ownerStatements=[],pets=[]){
 if(!v2(initial))return legacy.clinicalAnswerSchema(schema,initial);
 const out=structuredClone(schema);
 const refs=ownerStatements.map(t=>t.ref);
 out.properties.clinicalReview=object({
  assessment:structuredClone(CLINICAL_ASSESSMENT_SCHEMA),
  ownerStatementRefs:{type:"array",maxItems:4,items:{type:"string",...(refs.length?{enum:refs}:{})},...(!refs.length?{maxItems:0}:{})},
  observationFields:list(Object.keys(observations),8)
 });
 out.properties.appHelp=object({intent:choice([...WORKFLOW_INTENTS]),pet:{type:["string","null"],enum:[...pets.map(p=>p.handle),null]}});
 out.required.push("clinicalReview","appHelp");return out;
}
export function reviewClinicalAnswer(value,initial,ownerStatements=[],pets=[],workflowIntent="none"){
 if(!v2(initial))return legacy.reviewClinicalAnswer(value,initial);
 const review=value?.clinicalReview;
 if(!keys(value?.appHelp,["intent","pet"])||!WORKFLOW_INTENTS.includes(value.appHelp.intent)||(value.appHelp.pet!==null&&!pets.some(p=>p.handle===value.appHelp.pet)))reject("app_help");
 const workflow={...value.appHelp,intent:value.appHelp.intent==="none"?workflowIntent:value.appHelp.intent};
 if(!keys(review,["assessment","ownerStatementRefs","observationFields"])||!v2(review.assessment))reject("review_shape");
 const final=validateClinicalAssessment(review.assessment);
 if(!Array.isArray(review.ownerStatementRefs)||review.ownerStatementRefs.length>4||review.ownerStatementRefs.some(ref=>!ownerStatements.some(t=>t.ref===ref)))reject("owner_statement_reference");
 if(!Array.isArray(review.observationFields)||review.observationFields.length>8||review.observationFields.some(k=>!Object.hasOwn(observations,k)))reject("observation_field");
 const states=[initial,final],decision=states.some(s=>s.medicationIntent==="decision");
 const current=[...new Set(states.flatMap(s=>s.currentEvents))],conditional=[...new Set(states.flatMap(s=>s.conditionalEvents))];
 // Keep earlier recognized obligations; a later classification cannot downgrade them.
 if(states.some(s=>s.scenario==="current"&&s.urgency==="immediate")&&!current.length)current.push("other_urgent_signs");
 if(states.some(s=>s.scenario==="hypothetical"&&s.urgency==="immediate")&&!conditional.length)conditional.push("other_urgent_signs");
 const currentConcern=states.some(s=>s.careContext==="current_concern"||["current","uncertain"].includes(s.scenario)&&s.urgency==="prompt");
 const summaryContext=states.some(s=>s.careContext==="vet_summary"),historical=states.some(s=>s.careContext==="clinical_history");
 const active=decision||current.length>0||conditional.length>0||currentConcern||summaryContext||historical;
 if(!active&&value.components?.some(c=>c.kind==="emergency"||c.kind==="conditional_emergency"))reject("unbound_clinical_component");
 const missing=[...new Set(states.flatMap(s=>s.missingContext))];
 const clean={...value};delete clean.clinicalReview;delete clean.appHelp;
 const policy={version:2,active,decision,current,conditional,currentConcern,summaryContext,historical,missing,ownerRefs:[...new Set(review.ownerStatementRefs)],observations:[...new Set(review.observationFields)]};
 return {value:clean,policy,workflow,summary:{policyVersion:2,medicationIntent:decision?"decision":final.medicationIntent,medicationDisposition:decision?"refer_prescriber":"not_applicable",currentEmergency:current.length>0,conditionalEmergency:conditional.length>0,currentEventCount:current.length,conditionalEventCount:conditional.length,careContext:final.careContext,missingContextCount:missing.length,ownerStatementCount:policy.ownerRefs.length,contactTiming:current.length?"immediate":decision||currentConcern?"prompt":"none"}};
}
export function renderMedicationDecision(answer,policy,ownerStatements=[],sources=[]){
 if(policy?.version!==2)return legacy.renderMedicationDecision(answer,policy);
 if(!policy.active)return answer;
 const parts=[],emergency=policy.current.length>0;
 if(emergency)parts.push("Contact an emergency veterinarian now for immediate assessment. Do not wait for saved-record searches, additional questions or a reply here. If a possible harmful exposure or medicine error is involved, an animal poison service can also provide urgent professional advice.");
 else if(policy.decision)parts.push("Contact the prescribing veterinarian promptly for instructions specific to this medicine and what was actually given or missed.");
 else if(policy.currentConcern)parts.push("Contact your veterinarian promptly about the current change; the cause cannot be determined from this conversation.");
 if(policy.conditional.length)parts.push("If "+policy.conditional.map(k=>EMERGENCY_EVENTS[k]).join("; or ")+" occurs, contact an emergency veterinarian immediately. For possible harmful exposure, contact a veterinarian or animal poison service immediately rather than waiting for symptoms."+(!emergency?" These are conditional warning signs, not a claim that they are happening now.":""));
 if(policy.current.includes("toxin_exposure")||policy.conditional.includes("toxin_exposure"))parts.push("Do not induce vomiting or give home treatments unless a veterinarian or animal poison professional specifically directs you.");
 if(emergency&&answer.quotes.length)parts.push("Saved quotations below are historical reports, not an assessment of the current emergency. Do not delay emergency contact to review them.");
 if(policy.decision)parts.push("I cannot choose a catch-up dose, spacing, taper, substitution or restart schedule here. Looking stable does not establish that an altered prescription schedule is safe.");
 const missingLabels={pet:"which pet and species this concerns",date:"when the relevant events or administrations occurred",procedure:"which procedure or treatment is meant",medicine:"the medicine name and strength",prescription:"the exact prescribed directions",vet_plan:"the prescriber's existing instructions for this situation"};
 if(policy.missing.length)parts.push("Useful details to clarify: "+policy.missing.map(k=>missingLabels[k]).join("; ")+".");
 if(policy.observations.length)parts.push("For the veterinary conversation, note "+policy.observations.map(k=>observations[k]).join("; ")+".");
 if(policy.decision)parts.push("Keep a factual log of actual administrations and missed times, separately from the prescribed schedule. A reported or historical plan is not authority for a new medication decision.");
 const privateIds=sources.flatMap(s=>[s.id,s.petId]).filter(v=>typeof v==="string"&&v.length>=16);
 const ownerReports=policy.ownerRefs.map(ref=>ownerStatements.find(t=>t.ref===ref)).filter(Boolean).filter(t=>!privateIds.some(id=>t.text.includes(id))).map(t=>t.text);
 if(policy.summaryContext)parts.push("The owner reports and original saved notes below can support a vet-call summary. They are not a diagnosis; questions about a changed or missed medicine remain for the prescriber.");
 else if(policy.historical)parts.push("The original saved notes below describe what was recorded at the time, not a verified current condition or a new treatment instruction.");
 if(!parts.length)parts.push("Use the owner reports and original saved notes below as context for your veterinarian.");
 return {...answer,answer:parts.join("\n\n"),clinicalDisplayBounded:true,clinicalUrgency:emergency?"urgent":"routine",ownerReports,replyType:policy.decision?"partial":answer.replyType==="refusal"?"partial":answer.replyType,limited:answer.limited||policy.decision,presentation:{...answer.presentation,delivery:"direct"}};
}
