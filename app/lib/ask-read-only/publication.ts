import "server-only";
import { buildAskConversationResponse } from "../ask.mjs";
import { enforceVerifiedStateClaims, containsUnverifiedStateClaim, containsNavigationExecutionClaim } from "../application-actions/state-claims.ts";
import { isReadOnlyResult } from "./core.mjs";
import { issueReadOnlyCitationProof } from "../ask-citation-proof.ts";

/** No stored-text normalization: only the conversational prose passes state-claim checks. */
export function buildReadOnlyPublication(result:unknown,ownerId:string,petName:string) {
 if(!isReadOnlyResult(result))throw new Error("ASK_READ_RESULT_INVALID");
 const reviewed=result as {answer:{answer:string;limited:boolean;quotes:Array<{quote:string}>;calculations:Array<{text:string}>};sources:Array<{kind:string}>};
 const body=reviewed.answer;
 const checked=enforceVerifiedStateClaims(body.answer,false);
 const stateRejected=checked!==body.answer&&(containsUnverifiedStateClaim(body.answer)||containsNavigationExecutionClaim(body.answer));
 const limited=body.limited||stateRejected;
 const summary=stateRejected&&checked==="I can help with that."
  ?"I can read saved information, but I can’t make changes through Ask.":checked;
 const contextUsed={petName,usedSources:reviewed.sources.length?["Verified saved sources"]:[]};
 const response=buildAskConversationResponse({title:"Furvise",summary,sections:[],safetyNote:null},
  {intent:"general_pet_question",usedContextSummary:contextUsed.usedSources});
 if(!response)throw new Error("ASK_READ_RESPONSE_INVALID");
 response.sections=[
  ...(body.quotes.length?[{heading:"Saved notes",items:body.quotes.map(quote=>quote.quote)}]:[]),
  ...(body.calculations.length?[{heading:"Calculation",items:body.calculations.map(calculation=>calculation.text)}]:[])
 ];
 response.actions=["copy"];
 response.applicationActions=[];
 const citationProof=issueReadOnlyCitationProof(result,response,ownerId);
 if(reviewed.sources.length&&!citationProof)throw new Error("ASK_READ_CITATION_PROOF_REQUIRED");
 Object.assign(response,{citationProof,readOnlyEvidence:true});
 return {response,contextUsed,limited};
}
