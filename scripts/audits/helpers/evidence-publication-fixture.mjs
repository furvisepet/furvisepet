import {database} from "./lifetime-harness.mjs";
import {decisive,ownerId,pets} from "../fixtures/ask-lifetime-history.mjs";
const {buildFurviseContext}=await import("../../../app/lib/intelligence/retrieve-context.ts");
const {createAskEvidenceContract}=await import("../../../app/lib/intelligence/ask-evidence.ts");
const {assertStoredPublicationUnavailable}=await import("../../../tests/helpers/unsupported-stored-publication.mjs");
const {certifiedHistoryRead}=await import("../../../tests/helpers/certified-history-read.mjs");

/** Exercise the actual loader, then prove loaded/represented rows alone cannot
 * publish. No fixture metadata is promoted into an organ certificate. */
export async function uncertifiedRead(question,{petId="milo",rows=decisive,authoritativePetIds=[petId],
 evidenceReadProposal,prepareContext,prepareEvidence,...options}={}) {
 const supabase=database(rows,{fixturePets:pets,...options});
 const context=await buildFurviseContext({supabase,userId:ownerId,petId,currentMessage:question,
  conversationId:options.messages?"chat":null,conversationPetId:petId,dateRange:options.dateRange});
 prepareContext?.(context);
 if(evidenceReadProposal)context.evidenceReadProposal=evidenceReadProposal;
 const evidence=createAskEvidenceContract(context,authoritativePetIds);
 prepareEvidence?.(evidence);
 const response=await assertStoredPublicationUnavailable(evidence);
 return {context,evidence,response,queries:supabase.queries};
}

/** A distinct positive carrier: typed plan -> real Lungs -> receipts -> Labs. */
export async function certifiedRows(rows,{petId="milo",terms=[],from=null,to=null}={}) {
 return certifiedHistoryRead({scope:{authorizedPetIds:[petId]},petNames:{[petId]:pets.find(p=>p.id===petId)?.name||petId},
  represented:rows.map(row=>({sourceId:"care:"+row.id,sourceType:"care_update",petId:row.pet_profile_id,text:row.note,
   occurredAt:row.occurred_at,createdAt:row.created_at}))},
 {temporal:{from,to,anchor:null},predicates:terms.length?[{kind:"text_any",terms}]:[]});
}
