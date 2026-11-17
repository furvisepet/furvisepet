/** Typed decision boundaries, not a diagnosis engine or a source of treatment text.
 * The two model passes classify semantics; the server enforces their allowed
 * decision states, escalation timing and unknown-context transitions.
 */
const object=properties=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
const choice=values=>({type:"string",enum:values});
const MISSING=["pet","date","procedure","medicine","prescription","vet_plan"];
export const CLINICAL_ASSESSMENT_SCHEMA=object({
 medicationIntent:choice(["none","organization","decision"]),
 scenario:choice(["none","current","hypothetical","historical","uncertain"]),
 urgency:choice(["routine","prompt","immediate"]),
 referent:choice(["clear","essential_unknown"]),
 missingContext:{type:"array",maxItems:6,items:choice(MISSING)}
});
export const CLINICAL_INSTRUCTIONS=[
 "Before choosing reads, classify the question in safety. Medication organization is logging/reminders/storage or preparing questions without choosing a regimen. Medication decision includes deciding if a prescription gap, missed/redosed medicine, spacing, taper, substitution or other changed administration is safe/effective, including ambiguous claims that an approach is working. No dose or schedule is authorized by this classification.",
 "Mark essential_unknown when pet/time/procedure meaning must be clarified before a saved-history search. A profile read may resolve a pet referent; do not search unrelated history to guess. A vague procedure name is not evidence of which procedure occurred. Use clear for independently answerable questions.",
 "Separate a CURRENT suspected emergency from a hypothetical warning or resolved historical report. Current possible poisoning, respiratory distress, collapse/unresponsiveness, ongoing/repeated seizures, acute swollen abdomen with retching, inability to pass urine, serious bleeding/trauma or acute paralysis/incoordination needs immediate professional assessment. Do not require saved records or diagnostic certainty before urgent escalation. Other signs require context-sensitive veterinary review, not automatic emergency escalation.",
 "The final clinicalReview is a decision contract, not self-certification of medical correctness. It cannot authorize patient-specific medication changes or certify effectiveness from symptom stability. For a medication decision set medicationDisposition=refer_prescriber and regimenDecision=not_provided; ask for missing medicine, exact prescription and clinician-approved plan as needed. Never provide a replacement regimen even if those details are known. Preserve benign organization help and independently answerable components.",
 "handoffIndex identifies the component with actual actionable professional contact guidance. contactTiming=immediate means contact/seek emergency care now, not monitor, wait for symptoms, finish a log, or book a routine visit. Use emergency_veterinarian or veterinarian_or_poison_service for a current emergency, prescriber for non-emergency medication decisions. Put escalation before checklists or questions. A hypothetical emergency must explicitly be conditional and must not assert it is occurring.",
 "Write context-specific guidance in your own words, not a generic safety script. Clarification/partial replies must directly ask for missing essential context, preserve safe independent content and disclose what cannot be concluded. Quoted notes are historical reports, not current diagnoses or permission to alter treatment."
].join("\n");
function reject(field,details={}){
 const error=new Error("ASK_READ_CLINICAL_CONTRACT");error.code="ASK_READ_CLINICAL_CONTRACT";
 error.answerDiagnostic={category:"clinical_contract",field,...details};throw error;
}
const keys=(v,expected)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k));
export function validateClinicalAssessment(value){
 if(!keys(value,Object.keys(CLINICAL_ASSESSMENT_SCHEMA.properties)))reject("assessment_shape");
 for(const field of ["medicationIntent","scenario","urgency","referent"])if(!CLINICAL_ASSESSMENT_SCHEMA.properties[field].enum.includes(value[field]))reject("assessment_enum");
 if(!Array.isArray(value.missingContext)||value.missingContext.length>6||value.missingContext.some(k=>!MISSING.includes(k)))reject("missing_context");
 if(value.scenario==="none"&&value.urgency!=="routine")reject("scenario_urgency");
 return {...value,missingContext:[...new Set(value.missingContext)]};
}
export function clinicalSelectionSchema(tools){
 return object({
  safety:structuredClone(CLINICAL_ASSESSMENT_SCHEMA),
  reads:{type:"array",maxItems:4,items:{anyOf:tools.map(tool=>object({name:choice([tool.name]),arguments:structuredClone(tool.parameters)}))}},
  draft:{type:"string",maxLength:12000,description:"A short preliminary response, not a treatment plan. Leave empty for medication decisions, emergency care or essential ambiguity."}
 });
}
export function decodeClinicalSelection(value,tools){
 if(!keys(value,["safety","reads","draft"])||!Array.isArray(value.reads)||value.reads.length>4||typeof value.draft!=="string"||value.draft.length>12000)reject("selection_shape");
 const safety=validateClinicalAssessment(value.safety);
 const calls=value.reads.map((read,index)=>{
  if(!keys(read,["name","arguments"])||!tools.some(tool=>tool.name===read.name))reject("selection_read");
  return {id:"read-"+(index+1),name:read.name,arguments:JSON.stringify(read.arguments)};
 });
 return {calls,text:value.draft,safety};
}
export function clinicalAnswerSchema(schema,initial){
 const out=structuredClone(schema);
 out.properties.clinicalReview=object({
  assessment:structuredClone(CLINICAL_ASSESSMENT_SCHEMA),
  medicationDisposition:choice(initial?.medicationIntent==="decision"?["refer_prescriber"]:["not_applicable","organization_only","refer_prescriber"]),
  regimenDecision:choice(["not_provided"]),
  symptomStabilityAuthorization:choice(["not_permitted"]),
  handoffIndex:{type:"integer",minimum:-1,maximum:7},
  contactTiming:choice(["none","prompt","immediate"]),
  contactRecipient:choice(["none","prescriber","veterinarian","emergency_veterinarian","veterinarian_or_poison_service"]),
  questionsForMissingContext:{type:"array",maxItems:6,items:choice(MISSING)}
 });
 // Constrain first-pass obligations on the generation wire, not just after
 // paid output. A newly recognized current emergency retains its own branch.
 const review=out.properties.clinicalReview;
 const bindContact=(shape,recipients,timings)=>{
  shape.properties.handoffIndex.minimum=0;
  shape.properties.contactRecipient.enum=recipients;
  shape.properties.contactTiming.enum=timings;
 };
 if(initial?.scenario==="current"&&initial.urgency==="immediate"){
  bindContact(review,["emergency_veterinarian","veterinarian_or_poison_service"],["immediate"]);
 }else if(initial?.medicationIntent==="decision"){
  const ordinary=structuredClone(review),urgent=structuredClone(review);
  bindContact(ordinary,["prescriber"],["prompt","immediate"]);
  // ordinary must not accidentally encode a current emergency whose recipient
  // would then violate the emergency rule. Keep hypotheses/history distinct.
  const notCurrent=structuredClone(CLINICAL_ASSESSMENT_SCHEMA);
  notCurrent.properties.scenario.enum=notCurrent.properties.scenario.enum.filter(v=>v!=="current");
  const currentNonEmergency=structuredClone(CLINICAL_ASSESSMENT_SCHEMA);
  currentNonEmergency.properties.scenario.enum=["current"];
  currentNonEmergency.properties.urgency.enum=["routine","prompt"];
  ordinary.properties.assessment={anyOf:[notCurrent,currentNonEmergency]};
  urgent.properties.assessment.properties.scenario.enum=["current"];
  urgent.properties.assessment.properties.urgency.enum=["immediate"];
  bindContact(urgent,["emergency_veterinarian","veterinarian_or_poison_service"],["immediate"]);
  out.properties.clinicalReview={anyOf:[ordinary,urgent]};
 }else if(["current","uncertain"].includes(initial?.scenario)&&initial.urgency==="prompt"){
  bindContact(review,["veterinarian","prescriber","emergency_veterinarian"],["prompt","immediate"]);
 }
 out.required.push("clinicalReview");
 if(initial?.medicationIntent==="decision"||initial?.referent==="essential_unknown")out.properties.replyType.enum=["clarification","partial"];
 return out;
}
export function reviewClinicalAnswer(value,initial){
 if(!value||!Object.hasOwn(value,"clinicalReview")){if(initial)reject("review_missing");return {value,summary:null};}
 const review=value.clinicalReview;
 const expected=["assessment","medicationDisposition","regimenDecision","symptomStabilityAuthorization","handoffIndex","contactTiming","contactRecipient","questionsForMissingContext"];
 if(!keys(review,expected))reject("review_shape");
 const final=validateClinicalAssessment(review.assessment);
 const schema=clinicalAnswerSchema({properties:{},required:[]},null).properties.clinicalReview.properties;
 for(const field of ["medicationDisposition","regimenDecision","symptomStabilityAuthorization","contactTiming","contactRecipient"])if(!schema[field].enum.includes(review[field]))reject("review_enum");
 if(!Number.isInteger(review.handoffIndex)||review.handoffIndex < -1||review.handoffIndex>7)reject("handoff_index");
 if(!Array.isArray(review.questionsForMissingContext)||review.questionsForMissingContext.length>6||review.questionsForMissingContext.some(k=>!MISSING.includes(k)))reject("question_fields");
 const decision=initial?.medicationIntent==="decision"||final.medicationIntent==="decision";
 const emergency=[initial,final].some(s=>s?.scenario==="current"&&s.urgency==="immediate");
 const conditional=[initial,final].some(s=>s?.scenario==="hypothetical"&&s.urgency==="immediate");
 const missing=[...new Set([...(initial?.missingContext??[]),...final.missingContext])];
 const unknown=initial?.referent==="essential_unknown"||final.referent==="essential_unknown";
 if(decision&&review.medicationDisposition!=="refer_prescriber")reject("medication_authority");
 if(!decision&&review.medicationDisposition==="organization_only"&&![initial?.medicationIntent,final.medicationIntent].includes("organization"))reject("organization_scope");
 if((decision||unknown)&&!["clarification","partial"].includes(value.replyType))reject("unsupported_complete_answer");
 if((decision||unknown)&&missing.some(k=>!review.questionsForMissingContext.includes(k)))reject("missing_questions");
 const promptContact=[initial,final].some(s=>["current","uncertain"].includes(s?.scenario)&&s.urgency==="prompt");
 const requiresHandoff=decision||emergency||conditional||promptContact;
 // A no-contact contract has no executable/display handoff. Generated integer
 // defaults must not turn an unrelated saved component into one. Required care
 // obligations never take this path; their timing/recipient checks still apply.
 const handoffIndex=!requiresHandoff&&review.contactTiming==="none"&&review.contactRecipient==="none"?-1:review.handoffIndex;
 const rejectHandoff=field=>reject(field,{
  contactTiming:schema.contactTiming.enum.includes(review.contactTiming)?review.contactTiming:"invalid",
  contactRecipient:schema.contactRecipient.enum.includes(review.contactRecipient)?review.contactRecipient:"invalid",
  handoffKind:["general","saved","limitation","emergency","conditional_emergency"].includes(value.components?.[review.handoffIndex]?.kind)?value.components[review.handoffIndex].kind:"invalid"
 });
 if(requiresHandoff||handoffIndex>=0){
  const component=value.components?.[handoffIndex];
  if(!component||!["general","limitation","emergency","conditional_emergency"].includes(component.kind)||component.sources?.length)rejectHandoff("handoff_component");
  if(emergency&&(review.contactTiming!=="immediate"||!["emergency_veterinarian","veterinarian_or_poison_service"].includes(review.contactRecipient)||component.kind!=="emergency"))rejectHandoff("emergency_downgrade");
  if(!emergency&&conditional&&!decision&&(review.contactTiming!=="immediate"||component.kind!=="conditional_emergency"))rejectHandoff("conditional_handoff");
  if(decision&&!emergency&&(!["prompt","immediate"].includes(review.contactTiming)||review.contactRecipient!=="prescriber"))rejectHandoff("prescriber_handoff");
  if(promptContact&&!decision&&!emergency&&(!["prompt","immediate"].includes(review.contactTiming)||!["veterinarian","prescriber","emergency_veterinarian"].includes(review.contactRecipient)))rejectHandoff("prompt_handoff");
 }else if(review.contactTiming!=="none"||review.contactRecipient!=="none")reject("unbound_handoff");
 if(!emergency&&value.components?.some(c=>c.kind==="emergency"))reject("unestablished_current_emergency");
 const clean={...value};delete clean.clinicalReview;
 if(handoffIndex>0)clean.components=[value.components[handoffIndex],...value.components.filter((_,i)=>i!==handoffIndex)];
 return {value:clean,summary:{medicationIntent:decision?"decision":final.medicationIntent,medicationDisposition:review.medicationDisposition,currentEmergency:emergency,conditionalEmergency:conditional,requiredInformation:missing,missingContextCount:missing.length,questionsCount:review.questionsForMissingContext.length,contactTiming:review.contactTiming}};
}

/**
 * A display capability, not a semantic medical verifier. If either model pass
 * recognizes a medication decision, arbitrary generated prose has no display
 * authority. Only this bounded contact/clarification protocol plus separately
 * verified quotations, dates and calculations may publish. Classification can
 * still miss a decision; live clinical review remains a release gate.
 */
export function renderMedicationDecision(answer,summary){
 if(summary?.currentEmergency&&summary.medicationIntent!=="decision"){
  return {...answer,answer:[
   "Contact an emergency veterinarian now for immediate assessment. Do not wait for saved-record searches or for a reply here before seeking help.",
   "Describe the current signs and when they began. If an exposure or medicine is involved, have its packaging available if possible; follow the veterinary team's instructions.",
   "I cannot establish the diagnosis or a treatment plan here.",
   ...(answer.quotes.length?["Saved quotations below are historical reports, not an assessment of the current emergency."]:[])
  ].join("\n\n"),replyType:"partial",limited:true,clinicalUrgency:"urgent"};
 }
 if(summary?.medicationIntent!=="decision")return answer;
 const labels={pet:"which pet this concerns",date:"when each dose was actually given or missed",procedure:"which procedure or treatment this relates to",medicine:"the medicine name and strength",prescription:"the exact prescribed directions",vet_plan:"any instructions the prescribing veterinarian gave for missed doses or restarting"};
 const missing=summary.requiredInformation??[];
 const contact=summary.currentEmergency
  ?"Contact an emergency veterinarian now; the reported situation needs urgent professional assessment. Have the medicine packaging and prescription available if possible."
  :"Contact the prescribing veterinarian promptly for instructions specific to this medicine and the doses actually given.";
 const clarification=missing.length?"To help prepare that conversation, please share "+missing.map(key=>labels[key]).join("; ")+".":"Have the medicine label, prescribed directions, actual dose times and any existing veterinarian instructions ready for that conversation.";
 const verified=answer.quotes.length||answer.calculations.length||answer.presentation?.sourceDates?.length;
 return {...answer,answer:[contact,
  "I can help organize the information, but I cannot determine a safe dosing, spacing, tapering or restart plan here. Symptoms appearing stable do not establish that a changed prescription schedule is safe.",
  clarification,
  "Record what was actually given and when, what was missed, and any changes you noticed; keep that record separate from the prescribed schedule.",
  ...(verified?["Any saved quotations below report what was recorded at the time; they do not authorize a current medication decision."]:[]),
  "This reply is limited to medication clarification and any verified saved material below; other requested guidance remains unresolved."
 ].join("\n\n"),replyType:"partial",limited:true};
}
