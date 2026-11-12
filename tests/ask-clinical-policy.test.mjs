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
const toWire=s=>({medicationIntent:s.medicationIntent,referent:s.referent,missingContext:s.missingContext,careContext:s.careContext,eventAssessments:[...s.currentEvents.map(event=>({event,occurrence:"current",ownerStatementRef:"owner1",ownerQuote:input.question})),...s.conditionalEvents.map(event=>({event,occurrence:"conditional",ownerStatementRef:null,ownerQuote:null}))]});
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
 const {result}=await run(wire(assessment(),{workflowIntent:"care_photo_attachment"}),final(assessment(),"I uploaded your photo."));
 const text=result.answer.answer;assert.match(text,/no photo attachment or upload control/);assert.match(text,/Something worth remembering/);assert.match(text,/REMEMBER/);assert.doesNotMatch(text,/I uploaded/);
 assert.equal(APP_CAPABILITIES.ask.canSave,false);assert.equal(APP_CAPABILITIES.careNotes.photoAttachments,false);
});
test("app help cannot replace emergency prominence in a mixed question",()=>{
 const out=renderAppWorkflow({...base,answer:"Contact an emergency veterinarian now."},{intent:"find_care_note",pet:"p1"},pets,true);
 assert.match(out.answer,/^Contact an emergency veterinarian now/);assert.match(out.answer,/Open History/);assert.match(out.answer,/LOAD OLDER/);
});
test("active strict provider consumes actual event-contract JSON envelopes in exactly two physical local calls",async()=>{
 let physical=0;const events=[];
 const client={responses:{create:async()=>({status:"completed",output:[{type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:JSON.stringify(++physical===1?wire():final())}]}],usage:{input_tokens:1,output_tokens:1}})}};
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
 assert.ok(publication.sections.some(s=>s.heading==="Owner reports — not saved-record evidence"&&s.items[0]==="She missed breakfast. Help prepare my vet call."));
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
 const marker="private owner prose must not escape";const w=wire();w.safety.eventAssessments=[{event:marker,occurrence:"conditional",ownerStatementRef:null,ownerQuote:null}];const events=[];let calls=0;
 const client={responses:{create:async()=>{calls++;return {status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(w)}]}]};}}};
 await assert.rejects(readOnlyProvider("offline",e=>events.push(e),client)({instructions:"Classify.",context:{question:marker},tools,selectionSchema:clinicalSelectionSchema(tools)},"read_selection"));
 assert.equal(calls,1);const details=JSON.parse(events.find(e=>e.outcome==="failed").validationDetails);
 assert.equal(details.phase,"read_selection");assert.equal(details.field,"clinical_events");assert.ok(!JSON.stringify(events).includes(marker));
});

test("event contract has no global scenario/urgency collision and rejects duplicate occurrence",()=>{
 const schema=clinicalSelectionSchema(tools,[{ref:"owner1"}]).properties.safety;
 assert.ok(!schema.properties.scenario);assert.ok(!schema.properties.urgency);
 const w=wire();w.safety.eventAssessments=[{event:"collapse",occurrence:"conditional",ownerStatementRef:null,ownerQuote:null},{event:"collapse",occurrence:"current",ownerStatementRef:"owner1",ownerQuote:"She collapsed."}];
 assert.throws(()=>decodeClinicalSelection(w,tools,{question:"She collapsed.",dialogue:[],ownerStatementRefs:[{ref:"owner1",question:true}]}),/CLINICAL/);
});
test("current event needs exact owned dialogue evidence; conditional event does not assert current",()=>{
 const context={question:"If she fell down, would that be urgent?",dialogue:[],ownerStatementRefs:[{ref:"owner1",question:true}]};
 const w=wire();w.safety.eventAssessments=[{event:"collapse",occurrence:"conditional",ownerStatementRef:null,ownerQuote:null}];
 const normalized=decodeClinicalSelection(w,tools,context).safety;assert.deepEqual(normalized.currentEvents,[]);assert.equal(normalized.protocolVersion,3);
 for(const [ownerStatementRef,ownerQuote] of [[null,null],["foreign","She collapsed."],["owner1","She collapsed."]]){
  w.safety.eventAssessments=[{event:"collapse",occurrence:"current",ownerStatementRef,ownerQuote}];assert.throws(()=>decodeClinicalSelection(w,tools,context));
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
