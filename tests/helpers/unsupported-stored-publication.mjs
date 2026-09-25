import assert from "node:assert/strict";
import {generateContextAwareAskResponse} from "../../app/lib/ai/ask-reasoning.ts";
import {reviewHistoricalAnswer} from "../../app/lib/intelligence/review-history-narrative.ts";
import {validateGeneratedAnswer} from "../../app/lib/intelligence/validation/validate-answer.ts";
/** Rehost obsolete lexical projections at the real source-free boundary.
 * This supplies no organ proof and never synthesizes certification. */
export async function assertStoredPublicationUnavailable(original) {
 const before=structuredClone(original),e=structuredClone(original);
 e.version="ask-evidence.v1";e.scope={status:"resolved",requestKind:"ordinary",...e.scope};e.scope.requestText ||= "Typed stored-information request.";
 e.sources ||= [];e.sources=e.sources.map(source=>({completeness:{retrieval:"unknown",corrections:"unknown",extraction:"unknown",grouping:"unknown"},...source}));e.represented ||= [];e.losses ||= [];e.verifiedFacts ||= [];e.completeness ||= {};e.representation ||= "complete";
 e.interpretation ||= {};
 e.interpretation.request={mode:"read",evidenceBasis:"saved_history",referenceTurnIds:[],requirements:[],profileFields:[],...e.interpretation.request};
 const profiles=e.scope.authorizedPetIds.map(id=>({id,user_id:"owner",name:e.petNames?.[id]||id,species:"dog"}));
 let calls=0;const client={responses:{create:async()=>{calls++;throw Error("RETIRED_FACTUAL_PROVIDER");}}};
 const result=await generateContextAwareAskResponse({question:e.scope.requestText,profiles,careEntries:[],memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],evidenceContract:e,client});
 assert.ok(["server-history-unavailable","server-factual-unavailable"].includes(result.model),result.model);
 assert.deepEqual(result.relevantContextIds,[]);assert.deepEqual(result.referencedRecords,[]);assert.deepEqual(result.applicationActions,[]);
 assert.equal(result.labsList,undefined);assert.equal(result.profileFieldLabs,undefined);
 assert.equal(await reviewHistoricalAnswer({result,client}),true);
 const context={owner:{userId:"owner"},pet:profiles[0],eligiblePets:profiles,currentMessage:e.scope.requestText,memories:[],careEntries:[]};
 const validation=validateGeneratedAnswer(result,context,"routine",e.scope.authorizedPetIds);
 assert.equal(validation.valid,true,validation.errors.join());assert.equal(validation.assessment.outcome,"limited");
 assert.equal(calls,0);assert.deepEqual(original,before);
 return result;
}
