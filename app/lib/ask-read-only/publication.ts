import { readCoverageMessages } from "./coverage.mjs";
import "server-only";
import { buildAskConversationResponse } from "../ask.mjs";
import { enforceVerifiedStateClaims, containsUnverifiedStateClaim, containsNavigationExecutionClaim } from "../application-actions/state-claims.ts";
import { isReadOnlyResult } from "./core.mjs";
import { issueReadOnlyCitationProof } from "../ask-citation-proof.ts";

// The database accepts 64 KiB of JSONB text. Leave room for durable turn
// metadata and measure a whitespace-expanded UTF-8 representation, not UTF-16.
export const MAX_READ_ONLY_PUBLICATION_BYTES=56*1024;
const publicationBytes=(response:unknown)=>Buffer.byteLength(JSON.stringify(response,null,1),"utf8");

/** No stored-text normalization: only the conversational prose passes state-claim checks. */
export function buildReadOnlyPublication(result:unknown,ownerId:string,petName:string) {
 if(!isReadOnlyResult(result))throw new Error("ASK_READ_RESULT_INVALID");
 const reviewed=result as {answer:{answer:string;replyType:"answer"|"clarification"|"refusal"|"partial";limited:boolean;clinicalUrgency?:"routine"|"urgent";presentation?:{contextRequired:boolean;sourceDates:Array<{kind:string;eventAt:string;recordedAt:string;pet:string|null}>};quotes:Array<{quote:string}>;calculations:Array<{text:string}>};sources:Array<{kind:string}>};
 const body=reviewed.answer;
 const coverageRows=(result as {coverage?:Array<{scope?:{kind?:string};unmet?:string[];hasMore?:boolean;hasPrevious?:boolean;truncated?:boolean;inspected?:number;returned?:number;queryScopeExhausted?:boolean}>}).coverage??[];
 const coverageMessages=readCoverageMessages(coverageRows);
 const smallLatest=(result as {queryShape?:string}).queryShape==="latest_saved_note"&&coverageRows.length===1
  &&coverageRows[0].scope?.kind==="history"&&coverageRows[0].unmet?.length===0
  &&coverageRows[0].inspected===1&&coverageRows[0].returned===1&&coverageRows[0].queryScopeExhausted===true
  &&!coverageRows[0].hasMore&&!coverageRows[0].hasPrevious&&!coverageRows[0].truncated;
 if(smallLatest&&coverageMessages.length===1)coverageMessages[0]=
  "Checked 1 saved-note candidate for this query. This does not establish all related history was found.";
 const dialogue=(result as {dialogueCoverage?:{partial?:boolean;omittedKnownMessages?:number;truncatedMessages?:number}}).dialogueCoverage;
 const contextMessages=dialogue?.partial===true&&body.presentation?.contextRequired!==false
  ?[dialogue.omittedKnownMessages||dialogue.truncatedMessages
   ?"Some earlier conversation text is outside Ask’s current context window. Repeat any older details you want me to use."
   :"Earlier conversation context may be incomplete. Repeat any older details you want me to use."]:[];
 const coverageSections=[
  ...(coverageMessages.length?[{heading:"Search coverage",items:coverageMessages}]:[]),
  ...(contextMessages.length?[{heading:"Conversation context",items:contextMessages}]:[])
 ];
 const protectedBrief=(body as typeof body & {verifiedBriefText?:string}).verifiedBriefText;
 const briefAt=protectedBrief?body.answer.indexOf(protectedBrief):-1;
 // Exact verified fact quotations are source/owner data, never execution prose.
 // Keep them whole while checking the surrounding conversational text.
 const prose=briefAt>=0?[body.answer.slice(0,briefAt),body.answer.slice(briefAt+protectedBrief!.length)]:[body.answer];
 const checkedParts=prose.map(text=>text.trim()?enforceVerifiedStateClaims(text,false):text);
 const checked=briefAt>=0?checkedParts[0]+protectedBrief+checkedParts[1]:checkedParts[0];
 const stateRejected=prose.some((text,index)=>checkedParts[index]!==text&&(containsUnverifiedStateClaim(text)||containsNavigationExecutionClaim(text)));
 let limited=body.limited||stateRejected;
 // A removed execution claim must leave a truthful capability explanation,
 // even when an unrelated joke or general answer survives the filter.
 const boundary="I can read saved information, but I can’t make changes or open pages through Ask.";
 let checkedSummary=stateRejected
  ?boundary+(checked==="I can help with that."?"":" "+checked):checked;
 // Only complete a model's empty date sentence using the one verified event date.
 const dateSource=body.presentation?.sourceDates?.length===1&&body.quotes.length===1
  ?body.presentation.sourceDates[0]:null;
 const verifiedDate=dateSource?.eventAt.slice(0,10)??null;
 if(verifiedDate&&/^\d{4}-\d{2}-\d{2}$/.test(verifiedDate))
  checkedSummary=checkedSummary.replace(/(The latest saved journal note I found is dated)\./i,"$1 "+verifiedDate+".");
 // These values are server-verified result fields, not model prose claiming a write.
 const dateDetails=(body.presentation?.sourceDates??[]).filter(source=>!(checkedSummary.includes(source.eventAt.slice(0,10))&&checkedSummary.includes(source.recordedAt.slice(0,10))));
 const verifiedDetails=[...dateDetails.map(source=>(source.pet?source.pet+": ":"")+(source.kind==="profile"?"Profile updated: ":"Event date: ")+source.eventAt+(source.kind==="profile"?"; profile created: ":"; recorded date: ")+source.recordedAt+"."),...body.calculations.map(calculation=>calculation.text)];
 const taskCompletion=(body as typeof body & {taskCompletion?:Array<Record<string,unknown>>}).taskCompletion;
 let publishedTasks=stateRejected?taskCompletion?.map(task=>task.status==="complete"?{...task,status:"partial",reason:"publication_changed"}:task):taskCompletion;
 const summary=[checkedSummary,...verifiedDetails].join("\n");
 const contextUsed={petName,usedSources:reviewed.sources.length?["Verified saved sources"]:[]};
 const response=buildAskConversationResponse({title:"Furvise",summary,sections:[],safetyNote:null},
  {intent:"general_pet_question",urgent:body.clinicalUrgency==="urgent",usedContextSummary:contextUsed.usedSources});
 if(!response)throw new Error("ASK_READ_RESPONSE_INVALID");
 response.answerType=body.replyType==="clarification"?"clarification":"direct_answer";
 response.sections=[
  ...((body as typeof body & {ownerReports?:string[]}).ownerReports?.length?[{heading:"Owner reports  -  not saved-record evidence",items:(body as typeof body & {ownerReports:string[]}).ownerReports}]:[]),
  ...(body.quotes.some(quote=>!checkedSummary.includes(quote.quote))?[{heading:"Saved notes",items:body.quotes.filter(quote=>!checkedSummary.includes(quote.quote)).map(quote=>quote.quote)}]:[]),
  ...(!taskCompletion&&body.calculations.length?[{heading:"Calculation",items:body.calculations.map(calculation=>calculation.text)}]:[]),
  ...coverageSections
 ];
 response.actions=["copy"];
 response.applicationActions=[];
 if(contextMessages.length)Object.assign(response,{missingUsefulDetails:[...contextMessages]});

 const sign=()=>{
  const citationProof=issueReadOnlyCitationProof(result,response,ownerId);
  if(reviewed.sources.length&&!citationProof)throw new Error("ASK_READ_CITATION_PROOF_REQUIRED");
  Object.assign(response,{citationProof,readOnlyEvidence:true,readOnlyReferences:(result as {readReferences?:unknown}).readReferences,readOnlyTaskCompletion:publishedTasks});
 };
 sign();
 if(publicationBytes(response)>MAX_READ_ONLY_PUBLICATION_BYTES){
  limited=true;
  // Preserve whole source strings or omit them; never trim an attributed quote.
  // Drop the model narrative so it cannot promise omitted quotations.
  const sizeNotice=reviewed.sources.length
   ?"These saved sources exceed the reply size limit. Only whole notes that fit are included below; open Saved sources for the originals, or ask for one note at a time."
   :"This answer exceeds the reply size limit. Please ask for a shorter answer or one part at a time.";
  // A size fallback may omit whole evidence, never the bounded clinical actions.
  const preserveClinical=(body as typeof body & {clinicalDisplayBounded?:boolean}).clinicalDisplayBounded===true;
  publishedTasks=publishedTasks?.map(task=>task.status==="complete"&&task.kind!=="calculation"&&!(preserveClinical&&task.kind==="vet_brief")?{...task,status:"partial",reason:"publication_limit"}:task);
  const summary=preserveClinical?checkedSummary+"\n\n"+sizeNotice:stateRejected?boundary+" "+sizeNotice:sizeNotice;
  response.summary=summary;response.directAnswer=summary;
  response.answerType="direct_answer";
  response.sections=[...(body.calculations.length?[{heading:"Calculation",items:body.calculations.map(calculation=>calculation.text)}]:[]),...coverageSections];
  sign();
  const kept:string[]=[];
  for(const quote of body.quotes){
   response.sections=[{heading:"Saved notes",items:[...kept,quote.quote]},
    ...(body.calculations.length?[{heading:"Calculation",items:body.calculations.map(calculation=>calculation.text)}]:[]),...coverageSections];
   sign();
   if(publicationBytes(response)<=MAX_READ_ONLY_PUBLICATION_BYTES)kept.push(quote.quote);
  }
  response.sections=[
   ...(kept.length?[{heading:"Saved notes",items:kept}]:[]),
   ...(body.calculations.length?[{heading:"Calculation",items:body.calculations.map(calculation=>calculation.text)}]:[]),...coverageSections
  ];
  sign();
 }
 if(publicationBytes(response)>MAX_READ_ONLY_PUBLICATION_BYTES)throw new Error("ASK_READ_PUBLICATION_BUDGET");

 return {response,contextUsed,limited};
}
