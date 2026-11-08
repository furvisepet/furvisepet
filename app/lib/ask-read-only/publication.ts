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
 const reviewed=result as {answer:{answer:string;replyType:"answer"|"clarification"|"refusal"|"partial";limited:boolean;quotes:Array<{quote:string}>;calculations:Array<{text:string}>};sources:Array<{kind:string}>};
 const body=reviewed.answer;
 const checked=enforceVerifiedStateClaims(body.answer,false);
 const stateRejected=checked!==body.answer&&(containsUnverifiedStateClaim(body.answer)||containsNavigationExecutionClaim(body.answer));
 let limited=body.limited||stateRejected;
 const summary=stateRejected&&checked==="I can help with that."
  ?"I can read saved information, but I can’t make changes through Ask.":checked;
 const contextUsed={petName,usedSources:reviewed.sources.length?["Verified saved sources"]:[]};
 const response=buildAskConversationResponse({title:"Furvise",summary,sections:[],safetyNote:null},
  {intent:"general_pet_question",usedContextSummary:contextUsed.usedSources});
 if(!response)throw new Error("ASK_READ_RESPONSE_INVALID");
 response.answerType=body.replyType==="clarification"?"clarification":"direct_answer";
 response.sections=[
  ...(body.quotes.length?[{heading:"Saved notes",items:body.quotes.map(quote=>quote.quote)}]:[]),
  ...(body.calculations.length?[{heading:"Calculation",items:body.calculations.map(calculation=>calculation.text)}]:[])
 ];
 response.actions=["copy"];
 response.applicationActions=[];

 const sign=()=>{
  const citationProof=issueReadOnlyCitationProof(result,response,ownerId);
  if(reviewed.sources.length&&!citationProof)throw new Error("ASK_READ_CITATION_PROOF_REQUIRED");
  Object.assign(response,{citationProof,readOnlyEvidence:true});
 };
 sign();
 if(publicationBytes(response)>MAX_READ_ONLY_PUBLICATION_BYTES){
  limited=true;
  // Preserve whole source strings or omit them; never trim an attributed quote.
  // Drop the model narrative so it cannot promise omitted quotations.
  const summary=reviewed.sources.length
   ?"These saved sources exceed the reply size limit. Only whole notes that fit are included below; open Saved sources for the originals, or ask for one note at a time."
   :"This answer exceeds the reply size limit. Please ask for a shorter answer or one part at a time.";
  response.summary=summary;response.directAnswer=summary;
  response.answerType="direct_answer";
  response.sections=body.calculations.length?[{heading:"Calculation",items:body.calculations.map(calculation=>calculation.text)}]:[];
  sign();
  const kept:string[]=[];
  for(const quote of body.quotes){
   response.sections=[{heading:"Saved notes",items:[...kept,quote.quote]},
    ...(body.calculations.length?[{heading:"Calculation",items:body.calculations.map(calculation=>calculation.text)}]:[])];
   sign();
   if(publicationBytes(response)<=MAX_READ_ONLY_PUBLICATION_BYTES)kept.push(quote.quote);
  }
  response.sections=[
   ...(kept.length?[{heading:"Saved notes",items:kept}]:[]),
   ...(body.calculations.length?[{heading:"Calculation",items:body.calculations.map(calculation=>calculation.text)}]:[])
  ];
  sign();
 }
 if(publicationBytes(response)>MAX_READ_ONLY_PUBLICATION_BYTES)throw new Error("ASK_READ_PUBLICATION_BUDGET");

 return {response,contextUsed,limited};
}
