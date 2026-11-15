import test from "node:test";
import assert from "node:assert/strict";
import {clinicalSelectionSchema,decodeClinicalSelection,clinicalAnswerSchema,reviewClinicalAnswer,renderMedicationDecision,ownerStatementCatalog} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {runReadOnlyAsk,readOnlyToolsForPets,readOnlyAnswerSchemaForSources,READ_ONLY_LIMITS} from "../app/lib/ask-read-only/core.mjs";
import {readOnlyProvider} from "../app/lib/ask-read-only/provider.ts";
import {buildReadOnlyPublication} from "../app/lib/ask-read-only/publication.ts";
import {explicitCalendarScopes,recoverBoundedCalendarRead} from "../app/lib/ask-read-only/calendar-scope.mjs";
import {renderAppWorkflow,APP_CAPABILITIES} from "../app/lib/ask-read-only/app-capabilities.mjs";
const pets=[{id:"private-pet-id-123456789",ownerId:"owned",handle:"p1",name:"Willow",species:"cat"},{id:"second-private-pet-id",ownerId:"owned",handle:"p2",name:"Rowan",species:"dog"}];
const tools=readOnlyToolsForPets(pets);
const assessment=(extra={})=>({medicationIntent:"none",scenario:"none",urgency:"routine",referent:"clear",missingContext:[],careContext:"none",currentEvents:[],conditionalEvents:[],...extra});
const toWire=s=>({medicationIntent:s.medicationIntent,referent:s.referent,missingContext:s.missingContext,careContext:s.careContext,eventAssessments:[...s.currentEvents.map(event=>({event,occurrence:"current",ownerStatementRef:"owner1"})),...s.conditionalEvents.map(event=>({event,occurrence:"conditional",ownerStatementRef:null}))]});
const wire=(s=assessment(),extra={})=>({safety:toWire(s),reads:[],draft:"A preliminary answer.",historyIntent:{requested:false,timeBasis:"event",pet:null},workflowIntent:"none",...extra});
const final=(s=assessment(),text="An ordinary answer.",extra={})=>({presentation:{sourceDates:[],contextRequired:false},components:[{kind:"general",text,sources:[]}],sources:[],quotes:[],calculations:[],replyType:"answer",clinicalReview:{assessment:toWire(s),ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},...extra});
const base={answer:"",quotes:[],sources:[],calculations:[],replyType:"answer",limited:false,presentation:{sourceDates:[],contextRequired:false}};
const input={ownerId:"owned",selectedPetId:pets[0].id,pets,dialogue:[],question:"An unfamiliar owner question.",now:"2026-11-11T12:00:00Z",timeZone:"UTC"};
async function run(first,answer,extraInput={},read=async()=>({sources:[],total:0})){
 let count=0;const requests=[],events=[];
 const result=await runReadOnlyAsk({...input,...extraInput},{read,provider:async(request)=>{requests.push(request);return ++count===1?decodeClinicalSelection(first,tools,request.context):answer;},onAnswerBoundary:e=>events.push(e)});
 return {result,requests,events};
}
function display(first,second,text,extra={}){
 const reviewed=reviewClinicalAnswer(final(second,text,extra),first,[],pets);
 return renderMedicationDecision({...base,answer:text},reviewed.policy);
}
test("strict active selection and final contracts require all typed fields",()=>{
 const schema=clinicalSelectionSchema(tools);
 assert.ok(schema.required.includes("workflowIntent"));assert.ok(schema.required.includes("historyIntent"));
 assert.ok(clinicalAnswerSchema(readOnlyAnswerSchemaForSources([]),assessment(),[],pets).required.includes("appHelp"));
 assert.equal(decodeClinicalSelection(wire(),tools).safety.careContext,"none");
 for(const field of ["eventAssessments","referent","careContext"]){const w=wire();delete w.safety[field];assert.throws(()=>decodeClinicalSelection(w,tools));}
 const w=wire();w.historyIntent.pet="foreign";assert.throws(()=>decodeClinicalSelection(w,tools));
 assert.throws(()=>reviewClinicalAnswer({...final(),appHelp:{intent:"upload",pet:null}},assessment(),[],pets));
});
test("current mild concern and independent conditional emergencies never share same-day timing",()=>{
 const s=assessment({careContext:"current_concern",scenario:"current",urgency:"prompt",conditionalEvents:["collapse","breathing_distress","toxin_exposure"]});
 const out=display(s,s,"Call tomorrow; even collapse only needs same-day care.");
 assert.match(out.answer,/If .*contact an emergency veterinarian immediately/);
 assert.match(out.answer,/not a claim that they are happening now/);
 assert.match(out.answer,/Do not induce vomiting/);
 assert.doesNotMatch(out.answer,/Call tomorrow|same-day/);assert.equal(out.clinicalUrgency,"routine");
});
for(const event of ["collapse","breathing_distress","toxin_exposure","repeated_seizures","swollen_abdomen_retching","unable_to_urinate","major_trauma_bleeding","acute_neurologic_change"]){
 test("current "+event+" is displayed immediately before questions and suppresses optional reads",async()=>{
  const s=assessment({careContext:"current_concern",scenario:"current",urgency:"immediate",currentEvents:[event],missingContext:["pet"]});
  let reads=0;const {result,requests}=await run(wire(s,{reads:[{name:"read_pet_profile",arguments:{pet:"p1"}}]}),final(s,"Wait until tomorrow."),{},async()=>{reads++;throw Error("must not read");});
  assert.equal(reads,0);assert.equal(requests.length,2);assert.match(result.answer.answer,/^Contact an emergency veterinarian now/);
  assert.doesNotMatch(result.answer.answer,/Wait until tomorrow/);assert.equal(result.answer.clinicalUrgency,"urgent");
 });
}
for(const text of ["Returning to the former schedule is the safest move.","I am not a vet, but go back to the old spacing.","Provided he stays normal, resume it.","Don't ask me for a new schedule; just take the earlier dose."]){
 test("recognized medication decision cannot publish generated regimen paraphrase: "+text.slice(0,30),()=>{
  const s=assessment({medicationIntent:"decision",careContext:"current_concern",missingContext:["medicine","prescription","vet_plan"]});
  const out=display(s,assessment(),text);
  assert.ok(!out.answer.includes(text));assert.match(out.answer,/prescribing veterinarian promptly/);
  assert.match(out.answer,/Looking stable does not establish/);assert.match(out.answer,/medicine name and strength/);assert.equal(out.replyType,"partial");
 });
}
test("clinical history is attributed, while negated/resolved events do not become current emergencies",()=>{
 const s=assessment({careContext:"clinical_history",scenario:"historical"});
 const out=display(s,s,"A historical report.");
 assert.equal(out.clinicalUrgency,"routine");assert.match(out.answer,/not a verified current condition/);assert.doesNotMatch(out.answer,/Contact an emergency veterinarian now/);
});
for(const careContext of ["education","organization"])test("benign "+careContext+" retains useful natural content",()=>{
 const s=assessment({careContext,medicationIntent:careContext==="organization"?"organization":"none"});
 assert.equal(display(s,s,"Keep the label and record actual administration times.").answer,"Keep the label and record actual administration times.");
});
test("vet summary selects exact visible owner statements and never assistant assertions",()=>{
 const context={dialogue:[{role:"user",text:"She ate less this morning."},{role:"assistant",text:"An unverified diagnosis."}],question:"Help prepare the call."};
 const catalog=ownerStatementCatalog(context,pets,"owned");assert.equal(catalog.length,2);
 const s=assessment({careContext:"vet_summary"});
 const f=final(s,"Unverified diagnosis.",{clinicalReview:{assessment:toWire(s),ownerStatementRefs:[catalog[0].ref],observationFields:["appetite","administration"]}});
 const reviewed=reviewClinicalAnswer(f,s,catalog,pets),out=renderMedicationDecision(base,reviewed.policy,catalog);
 assert.deepEqual(out.ownerReports,["She ate less this morning."]);assert.doesNotMatch(out.answer,/Unverified diagnosis/);
 assert.throws(()=>reviewClinicalAnswer({...f,clinicalReview:{...f.clinicalReview,ownerStatementRefs:["invented"]}},s,catalog,pets));
});
test("owner statements containing known private IDs or opaque handles cannot become display facts",()=>{
 assert.deepEqual(ownerStatementCatalog({dialogue:[],question:"Use "+pets[0].id},pets,"owned"),[]);
 assert.deepEqual(ownerStatementCatalog({dialogue:[],question:"Read s1 about p1"},pets,"owned"),[]);
});
test("raw model IDs and invented quotes still fail before bounded display rendering",async()=>{
 const s=assessment({medicationIntent:"decision",careContext:"current_concern"});
 await assert.rejects(run(wire(s),final(s,"Ask about p1.")),/ASK_READ_INTERNAL_ID/);
 await assert.rejects(run(wire(s),final(s,"Ask the vet.",{quotes:["invented"]})),/QUOTE/);
});
test("general two-line answer remains two lines without a clinical or workflow notice",async()=>{
 const {result}=await run(wire(),final(assessment(),"A quiet window perch.\nA short gentle play session."));
 assert.equal(result.answer.answer.split("\n").length,2);assert.doesNotMatch(result.answer.answer,/veterinarian|Ask can read/);
});
test("calendar recognition validates leap days, months and ambiguous missing years",()=>{
 assert.deepEqual(explicitCalendarScopes("February 2024"),[{from:"2024-02-01",to:"2024-02-29",precision:"month"}]);
 assert.deepEqual(explicitCalendarScopes("2027-02"),[{from:"2027-02-01",to:"2027-02-28",precision:"month"}]);
 assert.deepEqual(explicitCalendarScopes("February 30 2024"),[]);
 assert.deepEqual(explicitCalendarScopes("May or June 2024"),[]);
 assert.equal(explicitCalendarScopes("April 2022 and April 2023").length,2);
});
test("month recovery runs through the normal owner-bound reader and preserves recorded axis",async()=>{
 const s=assessment({referent:"essential_unknown",missingContext:["date"]});
 const first=wire(s,{draft:"Which exact day?",historyIntent:{requested:true,timeBasis:"recorded",pet:"p1"}});
 let scope;
 const out=await run(first,final(),{question:"Find Willow's notes recorded in February 2024."},async request=>{scope=request;return {sources:[],total:0};});
 assert.equal(scope.pet.id,pets[0].id);assert.equal(scope.recordedFrom,"2024-02-01");assert.equal(scope.recordedTo,"2024-02-29");assert.equal(scope.from,null);
 assert.ok(out.events.some(e=>e.outcome==="calendar_scope_recovered"));assert.equal(out.requests.length,2);
 assert.equal(out.requests[1].draft,"");
});
test("recovery never guesses missing pet, event meaning, multiple periods or general knowledge",()=>{
 const first=decodeClinicalSelection(wire(assessment({referent:"essential_unknown",missingContext:["date"]}),{historyIntent:{requested:true,timeBasis:"event",pet:"p1"}}),tools);
 for(const [question,change] of [["Find May 2024.",{}],["Willow and Rowan May 2024.",{}],["Willow May 2024 and June 2024.",{}],["Willow May 2024.",{historyIntent:{requested:false,timeBasis:"event",pet:"p1"}}],["Willow May 2024.",{historyIntent:{requested:true,timeBasis:"ambiguous",pet:"p1"}}],["Willow May 2024.",{historyIntent:{requested:true,timeBasis:"event",pet:"p2"}}]]){
  assert.equal(recoverBoundedCalendarRead({...first,...change},{question},pets),null);
 }
 assert.deepEqual(READ_ONLY_LIMITS,{providerCalls:2,tools:4,records:32,page:16,sourceCharacters:24000,dialogueCharacters:8000});
});
test("UI-grounded photo help cannot invent an upload button or claim a save",async()=>{
 const {result}=await run(wire(assessment(),{workflowIntent:"care_photo_attachment"}),final(assessment(),"I uploaded your photo."),{question:"How can I attach a photo to a Furvise care note?"});
 const text=result.answer.answer;assert.match(text,/no photo attachment or upload control/);assert.match(text,/Something worth remembering/);assert.match(text,/REMEMBER/);assert.doesNotMatch(text,/I uploaded/);
 assert.equal(APP_CAPABILITIES.ask.canSave,false);assert.equal(APP_CAPABILITIES.careNotes.photoAttachments,false);
});
test("app help cannot replace emergency prominence in a mixed question",()=>{
 const out=renderAppWorkflow({...base,answer:"Contact an emergency veterinarian now."},{intent:"find_care_note",pet:"p1"},pets,true);
 assert.match(out.answer,/^Contact an emergency veterinarian now/);assert.match(out.answer,/Open History/);assert.match(out.answer,/LOAD OLDER/);
});
test("active strict provider consumes actual event-contract JSON envelopes in exactly two physical local calls",async()=>{
 const Ajv=(await import("ajv")).default;const validateWire=new Ajv({strict:false});
 let physical=0;const events=[];
 const client={responses:{create:async request=>{const envelope=({status:"completed",output:[{type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:JSON.stringify(++physical===1?{...wire(),measurementRequests:[],taskPlan:[{id:"t1",kind:"general_guidance",combineHistory:false,recordMode:"none",needsHistory:false,needsOwnerFacts:false,includeSourceDates:false,workflow:"none",pets:[],reference:null,missing:[]}] }:{...final(),clinicalReview:{...final().clinicalReview,concernReview:{occurrence:"none",sentence:null}},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:[],ownerFacts:[],historyFacts:[],historySynthesis:[]}],evidenceCompletion:{sourceReview:{routine:[],noteworthy:[],uncertain:[],irrelevant:[]},missingReference:null}})}]}],usage:{input_tokens:1,output_tokens:1}});const validate=validateWire.compile(request.text.format.schema);assert.ok(validate(JSON.parse(envelope.output[0].content[0].text)),JSON.stringify(validate.errors));return envelope;}}};
 const result=await runReadOnlyAsk(input,{provider:readOnlyProvider("offline",e=>events.push(e),client),read:async()=>{throw Error("unexpected private read");}});
 assert.equal(result.providerCallCount,2);assert.equal(physical,2);assert.equal(result.answer.answer,"An ordinary answer.");assert.equal(events.filter(e=>e.outcome==="succeeded").length,2);
});

test("bounded clinical actions and owner reports survive actual publication",async()=>{
 const s=assessment({careContext:"vet_summary",conditionalEvents:["collapse"]});
 const f=final(s,"Same-day if she collapses.",{clinicalReview:{assessment:toWire(s),ownerStatementRefs:["owner1"],observationFields:["onset"]}});
 const {result}=await run(wire(s),f,{question:"She missed breakfast. Help prepare my vet call."});
 const {response:publication}=buildReadOnlyPublication(result,"owned","Willow");
 assert.match(publication.summary,/emergency veterinarian immediately/);
 assert.doesNotMatch(publication.summary,/Same-day/);
 assert.ok(publication.sections.some(s=>s.heading==="Owner reports: not saved-record evidence"&&s.items[0]==="She missed breakfast. Help prepare my vet call."));
 assert.deepEqual(publication.applicationActions,[]);assert.ok(publication.actions.includes("copy"));
});

test("publication byte overflow keeps emergency escalation and omits whole oversized evidence",async()=>{
 const prior=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;process.env.FURVISE_RATE_LIMIT_HASH_SECRET="local-only-qualification-key-not-production";
 try{
  const current=assessment({careContext:"current_concern",scenario:"current",urgency:"immediate",currentEvents:["breathing_distress"]});
  const first=wire(assessment({careContext:"clinical_history"}),{reads:[{name:"search_saved_records",arguments:{pet:"p1",from:null,to:null,goal:"relevant_records",alternatives:[],recordedFrom:null,recordedTo:null,orderBy:"event",query:null,offset:0,order:"asc"}}]});
  const source={kind:"history",id:"private-note-id-123456789",ownerId:"owned",petId:pets[0].id,body:"猫".repeat(5000),eventAt:"2024-03-04T12:00:00Z",recordedAt:"2024-03-05T12:00:00Z"};
  const {result}=await run(first,final(current,"Wait until tomorrow.",{sources:["s1","s2","s3","s4"],quotes:["s1","s2","s3","s4"]}),{},async()=>({sources:Array.from({length:4},(_,i)=>({...source,id:source.id+"-"+i})),total:4}));
  const {response,limited}=buildReadOnlyPublication(result,"owned","Willow");
  assert.equal(limited,true);assert.match(response.summary,/^Contact an emergency veterinarian now/);
  assert.doesNotMatch(response.summary,/Wait until tomorrow/);assert.ok(Buffer.byteLength(JSON.stringify(response,null,1),"utf8")<=56*1024);
  for(const section of response.sections.filter(s=>s.heading==="Saved notes"))for(const text of section.items)assert.equal(text,source.body,"only whole quotations may publish");
  assert.ok(response.sections.filter(s=>s.heading==="Saved notes").flatMap(s=>s.items).length<4);
 }finally{if(prior===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=prior;}
});

test("strict provider rejection records typed phase and no generated private text",async()=>{
 const marker="private owner prose must not escape";const w=wire();w.safety.eventAssessments=[{event:marker,occurrence:"conditional",ownerStatementRef:null}];const events=[];let calls=0;
 const client={responses:{create:async()=>{calls++;return {status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(w)}]}]};}}};
 await assert.rejects(readOnlyProvider("offline",e=>events.push(e),client)({instructions:"Classify.",context:{question:marker},tools,selectionSchema:clinicalSelectionSchema(tools)},"read_selection"));
 assert.equal(calls,1);const details=JSON.parse(events.find(e=>e.outcome==="failed").validationDetails);
 assert.equal(details.phase,"read_selection");assert.equal(details.field,"clinical_events");assert.ok(!JSON.stringify(events).includes(marker));
});

test("event contract has no global scenario/urgency collision and rejects duplicate occurrence",()=>{
 const schema=clinicalSelectionSchema(tools,[{ref:"owner1"}]).properties.safety;
 assert.ok(!schema.properties.scenario);assert.ok(!schema.properties.urgency);
 const w=wire();w.safety.eventAssessments=[{event:"collapse",occurrence:"conditional",ownerStatementRef:null},{event:"collapse",occurrence:"current",ownerStatementRef:"owner1"}];
 assert.throws(()=>decodeClinicalSelection(w,tools,{question:"She collapsed.",dialogue:[],ownerStatementRefs:[{ref:"owner1",question:true}]}),/CLINICAL/);
});
test("current event needs a checked owner reference; conditional event does not assert current",()=>{
 const context={question:"If she fell down, would that be urgent?",dialogue:[],ownerStatementRefs:[{ref:"owner1",question:true}]};
 const w=wire();w.safety.eventAssessments=[{event:"collapse",occurrence:"conditional",ownerStatementRef:null}];
 const normalized=decodeClinicalSelection(w,tools,context).safety;assert.deepEqual(normalized.currentEvents,[]);assert.equal(normalized.protocolVersion,3);
 for(const ownerStatementRef of [null,"foreign"]){
  w.safety.eventAssessments=[{event:"collapse",occurrence:"current",ownerStatementRef}];assert.throws(()=>decodeClinicalSelection(w,tools,context));
 }
});

test("a workflow collision cannot erase an independently verified saved answer",async()=>{
 const s=assessment(),source={kind:"history",id:"owned-note-id-123456789",ownerId:"owned",petId:pets[0].id,body:"An original historical observation.",eventAt:"2021-07-05T12:00:00Z",recordedAt:"2021-07-06T12:00:00Z"};
 const first=wire(s,{workflowIntent:"find_care_note",historyIntent:{requested:true,timeBasis:"event",pet:"p1"},reads:[{name:"search_saved_records",arguments:{pet:"p1",from:null,to:null,goal:"relevant_records",alternatives:[],recordedFrom:null,recordedTo:null,orderBy:"event",query:null,offset:0,order:"asc"}}]});
 const out=await run(first,final(s,"The original note is quoted below.",{sources:["s1"],quotes:["s1"]}),{},async()=>({sources:[source],total:1}));
 assert.match(out.result.answer.answer,/^The original note is quoted below/);assert.equal(out.result.answer.quotes[0].quote,source.body);assert.equal(out.requests.length,2);
});
test("unrelated exposure boilerplate cannot attach to a non-exposure warning",()=>{
 const s=assessment({careContext:"current_concern",conditionalEvents:["unable_to_urinate"]});
 const out=display(s,s,"An unsafe irrelevant draft.");
 assert.match(out.answer,/If inability to pass urine occurs, contact an emergency veterinarian immediately/);assert.doesNotMatch(out.answer,/poison|harmful exposure|vomiting/);
});

test("bounded recovery repairs a suppressed planned read without changing other ambiguity rules",async()=>{
 const s=assessment({referent:"essential_unknown",missingContext:["date"]});
 const first=wire(s,{historyIntent:{requested:true,timeBasis:"event",pet:"p1"},reads:[{name:"search_saved_records",arguments:{pet:"p1",from:null,to:null,goal:"exact_quote",alternatives:[],recordedFrom:null,recordedTo:null,orderBy:"event",query:null,offset:0,order:"asc"}}]});
 let scope;const out=await run(first,final(),{question:"Use Willow's September 2023 note instead."},async request=>{scope=request;return {sources:[],total:0};});
 assert.equal(scope.from,"2023-09-01");assert.equal(scope.to,"2023-09-30");assert.equal(scope.goal,"exact_quote");
 assert.ok(out.events.some(e=>e.outcome==="calendar_scope_recovered"));
});
test("a uniquely named owned pet can resolve a redundant missing-pet flag, never clinical authority",()=>{
 const raw=decodeClinicalSelection(wire(assessment({referent:"essential_unknown",missingContext:["pet","date"]}),{historyIntent:{requested:true,timeBasis:"recorded",pet:null}}),tools);
 assert.ok(recoverBoundedCalendarRead(raw,{question:"Willow's notes recorded in November 2025."},pets));
 assert.equal(recoverBoundedCalendarRead({...raw,safety:{...raw.safety,missingContext:["medicine"]}},{question:"Willow November 2025."},pets),null);
 assert.equal(recoverBoundedCalendarRead({...raw,calls:[{name:"delete_record"}]},{question:"Willow November 2025."},pets),null);
});
test("an unresolved requested record component stays explicit alongside a useful general answer",async()=>{
 const first=wire(assessment({referent:"essential_unknown",missingContext:["date"]}),{historyIntent:{requested:true,timeBasis:"ambiguous",pet:"p1"}});
 const out=await run(first,final(assessment(),"Keep a dated list of observations."),{question:"Find her old note and help me keep a diary."});
 assert.match(out.result.answer.answer,/^Keep a dated list/);assert.match(out.result.answer.answer,/did not check saved records/);assert.equal(out.result.answer.replyType,"partial");
});

test("historical and summary display never promise saved notes that were not supplied",()=>{
 const history=assessment({careContext:"clinical_history",scenario:"historical"});
 const out=display(history,history,"An unsupported original-note promise.");
 assert.doesNotMatch(out.answer,/original saved notes below/);assert.match(out.answer,/historical report/);
 const summary=assessment({careContext:"vet_summary"}),brief=display(summary,summary,"A draft.");
 assert.doesNotMatch(brief.answer,/original saved notes below/);
});

test("a checked current emergency survives an invalid second clinical envelope without accepting it",async()=>{
 const s=assessment({careContext:"current_concern",currentEvents:["breathing_distress"]}),bad=final(s,"Expose p1.");
 bad.clinicalReview.assessment.eventAssessments[0].ownerStatementRef=null;
 const out=await run(wire(s),bad);
 assert.match(out.result.answer.answer,/^Contact an emergency veterinarian now/);
 assert.match(out.result.answer.answer,/fuller answer could not be verified/);assert.doesNotMatch(out.result.answer.answer,/Expose p1/);
 assert.equal(out.result.answer.clinicalDecision.emergencyFallback,true);assert.equal(out.result.answer.replyType,"partial");assert.equal(out.requests.length,2);assert.equal(out.result.sources.length,0);
 const {response}=buildReadOnlyPublication(out.result,"owned","Willow");assert.equal(response.urgency,"urgent");assert.deepEqual(response.applicationActions,[]);
});
test("a checked current emergency survives second-provider failure with no third call",async()=>{
 const s=assessment({careContext:"current_concern",currentEvents:["collapse"]});let calls=0,reads=0;
 const out=await runReadOnlyAsk(input,{provider:async request=>{if(++calls===1)return decodeClinicalSelection(wire(s),tools,request.context);throw Error("private provider detail");},read:async()=>{reads++;throw Error("no optional reads");}});
 assert.equal(calls,2);assert.equal(reads,0);assert.match(out.answer.answer,/^Contact an emergency veterinarian now/);assert.doesNotMatch(out.answer.answer,/private provider detail/);
});
test("unverified normalized metadata cannot manufacture an emergency handoff",async()=>{
 const forged={calls:[],text:"",safety:{...assessment({currentEvents:["collapse"]}),protocolVersion:3},historyIntent:{requested:false,timeBasis:"event",pet:null},workflowIntent:"none"};
 let calls=0;await assert.rejects(runReadOnlyAsk(input,{provider:async()=>{if(++calls===1)return forged;throw Error("not a checked first assessment");},read:async()=>{throw Error("no reads");}}));
 assert.equal(calls,2);
});
test("actual public POST persists an urgent partial handoff after a final clinical-reference failure",async()=>{
 const {readOnlyFailureRouteFixture:fixture}=await import("./helpers/ask-read-only-failure-route.mjs");
 const f=fixture(async(request,_phase,call)=>{
  if(call===1)return decodeClinicalSelection(wire(assessment({careContext:"current_concern",currentEvents:["collapse"]})),request.tools,request.context);
  return {invalid:true};
 });
 const response=await f.send(),body=await response.json();
 assert.equal(response.status,200,JSON.stringify(f.state.errors.map(e=>String(e.error))));
 assert.match(body.response.directAnswer,/^Contact an emergency veterinarian now/);assert.equal(body.response.urgency,"urgent");
 assert.equal(f.state.calls,2);assert.equal(f.state.reads,0);assert.equal(body.response.turn.finalStage,"COMPLETED");
});

test("recorded-only retrieval removes an accidental event intersection before owner-bound reads",async()=>{
 const source={kind:"history",id:"date-source-123456789",ownerId:"owned",petId:pets[0].id,body:"A historical observation.",eventAt:"2024-06-11T12:00:00Z",recordedAt:"2024-06-12T12:00:00Z"};
 const first=wire(assessment(),{historyIntent:{requested:true,timeBasis:"recorded",pet:"p1"},reads:[{name:"search_saved_records",arguments:{pet:"p1",from:"2024-06-12",to:"2024-06-12",goal:"exact_quote",alternatives:[],recordedFrom:"2024-06-12",recordedTo:"2024-06-12",orderBy:"recorded",query:null,offset:0,order:"asc"}}]});
 let scope;const out=await run(first,final(assessment(),"The original note follows.",{sources:["s1"],quotes:["s1"]}),{},async request=>{scope=request;return {sources:[source],total:1};});
 assert.equal(scope.from,null);assert.equal(scope.to,null);assert.equal(scope.recordedFrom,"2024-06-12");assert.equal(out.result.sources[0].eventAt,source.eventAt);
 assert.ok(out.events.some(e=>e.outcome==="temporal_scope_normalized"&&e.removedAxis==="event"));
});
test("independent requested event and recorded constraints survive combined scope",async()=>{
 const {normalizeReadTemporalScope}=await import("../app/lib/ask-read-only/temporal-scope.mjs");
 const args={from:"2021-02-01",to:"2021-02-28",recordedFrom:"2021-04-01",recordedTo:"2021-04-30"};
 assert.deepEqual(normalizeReadTemporalScope("search_saved_records",args,"combined").args,args);
 const event=normalizeReadTemporalScope("search_saved_records",args,"event").args;assert.equal(event.from,args.from);assert.equal(event.recordedFrom,null);
 assert.throws(()=>normalizeReadTemporalScope("search_saved_records",{...args,recordedFrom:null,recordedTo:null},"recorded"),/TEMPORAL/);
});

test("component vet brief publishes exact historical execution wording as a quotation, not an app action",async()=>{
 const prior=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;process.env.FURVISE_RATE_LIMIT_HASH_SECRET="local-only-component-citation-fixture";
 try{
  const s=assessment({careContext:"vet_summary"});let count=0;
  const row={kind:"history",id:"source-component-private-id",ownerId:"owned",petId:pets[0].id,body:"I deleted the note.",eventAt:"2021-03-01T12:00:00Z",recordedAt:"2021-03-02T12:00:00Z"};
  const task={id:"t1",kind:"vet_brief",recordMode:"single",needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,workflow:"none",pets:["p1"],reference:null,missing:[]};
  const result=await runReadOnlyAsk({...input,question:"Prepare a brief with the original historical report."},{provider:async req=>{
   if(++count===1)return {...decodeClinicalSelection(wire(s,{reads:[{name:"search_saved_records",arguments:{pet:"p1",from:"2021-03-01",to:"2021-03-31",query:null,offset:0}}]}),req.tools,req.context),taskPlan:[task]};
   return final(s,"A brief follows.",{sources:["s1"],completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:["s1"],ownerFacts:[],historyFacts:[{source:"s1",excerpt:row.body}]}]});
  },read:async()=>({sources:[row],total:1,scopeExhausted:true})});
  const {response}=buildReadOnlyPublication(result,"owned","Willow");
  assert.match(response.directAnswer,/I deleted the note\./);assert.match(response.directAnswer,/^Vet brief/);assert.doesNotMatch(response.directAnswer,/I can help with that|I can read saved information/);
  assert.deepEqual(response.applicationActions,[]);assert.ok(response.citationProof);assert.equal(response.readOnlyTaskCompletion[0].status,"complete");
 }finally{if(prior===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=prior;}
});

test("publication omissions cannot leave a requested quote component marked complete",async()=>{
 const prior=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;process.env.FURVISE_RATE_LIMIT_HASH_SECRET="local-only-component-publication-fixture";
 try{
  let count=0;const task={id:"t1",kind:"saved_content",recordMode:"single",needsHistory:true,needsOwnerFacts:false,includeSourceDates:false,workflow:"none",pets:["p1"],reference:null,missing:[]};
  const rows=Array.from({length:4},(_,i)=>({kind:"history",id:"oversized-private-component-"+i,ownerId:"owned",petId:pets[0].id,body:"猫".repeat(5000)+".",eventAt:"2021-03-01T12:00:00Z",recordedAt:"2021-03-02T12:00:00Z"}));const handles=rows.map((_,i)=>"s"+(i+1));
  const result=await runReadOnlyAsk(input,{provider:async req=>{
   if(++count===1)return {...decodeClinicalSelection(wire(assessment(),{reads:[{name:"search_saved_records",arguments:{pet:"p1",from:"2021-03-01",to:"2021-03-31",query:null,offset:0}}]}),req.tools,req.context),taskPlan:[task]};
   return final(assessment(),"The original notes follow.",{components:[{kind:"saved",text:"The original notes follow.",sources:handles}],sources:handles,quotes:handles,completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:handles,ownerFacts:[],historyFacts:[]}]});
  },read:async()=>({sources:rows,total:4,scopeExhausted:true})});
  assert.equal(result.answer.taskCompletion[0].status,"complete");
  const {response,limited}=buildReadOnlyPublication(result,"owned","Willow");
  assert.equal(limited,true);assert.equal(response.readOnlyTaskCompletion[0].status,"partial");assert.equal(response.readOnlyTaskCompletion[0].reason,"publication_limit");
  const kept=response.sections.find(s=>s.heading==="Saved notes")?.items??[];assert.ok(kept.length<4);assert.ok(kept.every(text=>text===rows[0].body));
 }finally{if(prior===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=prior;}
});

test("a historical event also negated today is nonacute while conflicting acute occurrences remain rejected",async()=>{
 const {validateClinicalAssessment,EMERGENCY_EVENTS}=await import("../app/lib/ask-read-only/clinical-policy.mjs");
 const event=Object.keys(EMERGENCY_EVENTS)[0];
 const observation=occurrence=>({event,occurrence,ownerStatementRef:"owner1"});
 const value=events=>({medicationIntent:"none",referent:"clear",missingContext:[],careContext:"clinical_history",eventAssessments:events});
 const owners=[{ref:"owner1",text:"The old event resolved years ago and is not occurring today."}];
 const safe=validateClinicalAssessment(value([observation("historical"),observation("negated")]),owners);
 assert.deepEqual(safe.currentEvents,[]);assert.deepEqual(safe.conditionalEvents,[]);
 assert.equal(safe.scenario,"historical");
 assert.throws(()=>validateClinicalAssessment(value([observation("current"),observation("negated")]),owners),/ASK_READ_CLINICAL_CONTRACT/);
 assert.throws(()=>validateClinicalAssessment(value([observation("conditional"),observation("historical")]),owners),/ASK_READ_CLINICAL_CONTRACT/);
 assert.throws(()=>validateClinicalAssessment(value([observation("historical"),{...observation("negated"),ownerStatementRef:"forged"}]),owners),/ASK_READ_CLINICAL_CONTRACT/);
});

test("introduced acute IF directions cannot narrow emergency timing behind an empty assessment",()=>{
 const text="The old episode resolved. If a collapse happens again and Willow has trouble breathing, repeated episodes, severe weakness, or does not recover normally, seek urgent veterinary care immediately.";
 const reviewed=reviewClinicalAnswer(final(assessment(),text),assessment(),[],pets);
 assert.equal(reviewed.policy.active,true);
 assert.ok(reviewed.policy.conditional.includes("collapse"));
 assert.deepEqual(reviewed.policy.current,[]);
 const out=renderMedicationDecision({...base,answer:text},reviewed.policy);
 assert.match(out.answer,/If .*collapse.*contact an emergency veterinarian immediately/);
 assert.doesNotMatch(out.answer,/and Willow has|does not recover normally/);
 assert.doesNotMatch(out.answer,/Contact an emergency veterinarian now/);
 const ordinary=reviewClinicalAnswer(final(assessment(),"If you find the old discharge report, ask the vet which dates to record."),assessment(),[],pets);
 assert.equal(ordinary.policy.active,false);
});

test("native historical education uses bounded v3 review without legacy emergency component authority",async()=>{
 const {decodeComponentSelection}=await import("../app/lib/ask-read-only/task-components.mjs");
 let physical=0,reads=0;const safety={medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]};
 const task={id:"t1",kind:"clinical_guidance",combineHistory:false,needsHistory:false,needsOwnerFacts:false,includeSourceDates:false,recordMode:"none",workflow:"none",pets:["p1"],reference:null,missing:[]};
 const out=await runReadOnlyAsk({...input,question:"My cat had a resolved breathing episode years ago and breathes normally now. Does that past event alone establish an emergency today?"},{
  read:async()=>{reads++;throw Error("No historical source was requested");},
  provider:async(req,phase)=>{physical++;
   if(phase==="read_selection")return decodeComponentSelection({safety,reads:[],draft:"",historyIntent:{requested:false,timeBasis:"ambiguous",pet:null},workflowIntent:"none",taskPlan:[task]},req.tools,req.context,decodeClinicalSelection);
   for(const v of req.schema.properties.components.items.anyOf)assert.ok(v.properties.kind.enum.every(k=>!["emergency","conditional_emergency"].includes(k)),"v3 must not request legacy free-form urgency components");
   assert.doesNotMatch(req.instructions,/IF\/THEN emergency guidance in a conditional_emergency component/);
   assert.ok(req.schema.properties.clinicalReview.properties.assessment.properties.eventAssessments,"independent occurrence review remains available");
   return {components:[{kind:"general",text:"A resolved episode years ago does not by itself establish a current emergency. That is not a diagnosis of the old event or a guarantee of present health.",sources:[]}],quotes:[],sources:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:[],ownerFacts:[],historyFacts:[]}]};
  }
 });
 assert.equal(physical,2);assert.equal(reads,0);assert.match(out.answer.answer,/does not by itself establish a current emergency/);assert.doesNotMatch(out.answer.answer,/Contact an emergency veterinarian now/);
 const checked=decodeClinicalSelection(wire(),tools).safety;
 assert.throws(()=>reviewClinicalAnswer({...final(),components:[{kind:"conditional_emergency",text:"Unbound directive.",sources:[]}]},checked,[],pets),/CLINICAL_CONTRACT/,"runtime rejection is not weakened");
});
test("native general-only components cannot suppress an independently reviewed current emergency",async()=>{
 const {decodeComponentSelection}=await import("../app/lib/ask-read-only/task-components.mjs");
 let physical=0;const initial={medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]};
 const current={...initial,careContext:"current_concern",eventAssessments:[{event:"breathing_distress",occurrence:"current",ownerStatementRef:"owner1"}]};
 const task={id:"t1",kind:"clinical_guidance",combineHistory:false,needsHistory:false,needsOwnerFacts:false,includeSourceDates:false,recordMode:"none",workflow:"none",pets:["p1"],reference:null,missing:[]};
 const out=await runReadOnlyAsk({...input,question:"My cat is struggling to breathe right now."},{read:async()=>{throw Error("No delay");},provider:async(req,phase)=>{
  physical++;if(phase==="read_selection")return decodeComponentSelection({safety:initial,reads:[],draft:"",historyIntent:{requested:false,timeBasis:"event",pet:null},workflowIntent:"none",taskPlan:[task]},req.tools,req.context,decodeClinicalSelection);
  return {components:[{kind:"general",text:"Wait until tomorrow.",sources:[]}],quotes:[],sources:[],calculations:[],replyType:"answer",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:current,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[],sources:[],ownerFacts:[],historyFacts:[]}]};
 }});
 assert.equal(physical,2);assert.match(out.answer.answer,/^Contact an emergency veterinarian now/);assert.doesNotMatch(out.answer.answer,/Wait until tomorrow/);assert.equal(out.answer.clinicalUrgency,"urgent");
});
