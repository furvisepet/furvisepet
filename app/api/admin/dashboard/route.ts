import { createHash } from "node:crypto";
import { readOwnerProviderReservations } from "../../../lib/operations/owner-reservations-server";
import { reservationObservability } from "../../../lib/operations/reservation-observability";
import { requireDashboardOwner, readOwnerDashboard } from "../../../lib/operations/owner-dashboard-server";
import { PRIVATE_CACHE_HEADERS } from "../../../lib/security/private-routes";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const owner = await requireDashboardOwner(request);
  if ("response" in owner) return owner.response;
  const params = new URL(request.url).searchParams;
  if (params.has("sourceReferenceProof")) return sourceReferenceProof(request, owner.userId, params);
  const days = Number(params.get("days") || 7);
  if (![1,7,30,90].includes(days)) return Response.json({error:"Invalid date range."},{status:400,headers:PRIVATE_CACHE_HEADERS});
  try {
    const [data, inventory] = await Promise.all([readOwnerDashboard(days, params.get("includeTests") === "true"), readOwnerProviderReservations(owner.userId)]);
    return Response.json({ ...data, reservationObservability: reservationObservability(days, new Date(), inventory) }, {headers:PRIVATE_CACHE_HEADERS});
  }
  catch { return Response.json({error:"Metrics are temporarily unavailable. Try refreshing."},{status:503,headers:PRIVATE_CACHE_HEADERS}); }
}

const proofUuid = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const proofHash = (x: string) => createHash("sha256").update(x).digest("hex");
/** Preview-only current stored-context compiler evidence. Never a USER turn or paid admission. */
async function sourceReferenceProof(request: Request, ownerId: string, params: URLSearchParams) {
  const hidden = () => Response.json({error:"Not found."},{status:404,headers:PRIVATE_CACHE_HEADERS});
  if (process.env.VERCEL_ENV !== "preview" || process.env.FURVISE_PREVIEW_SEMANTIC_ENABLED !== "true"
    || process.env.FURVISE_PREVIEW_CAPTURE_ENABLED !== "0"
    || process.env.FURVISE_PREVIEW_CAPTURE_USER_ID !== ownerId
    || !/^[0-9a-f]{64}$/.test(process.env.FURVISE_PREVIEW_CAPTURE_SOURCE_SHA256 || "")) return hidden();
  const conversationId = params.get("sourceReferenceProof");
  if ([...params.keys()].length !== 1 || !proofUuid(conversationId))
    return Response.json({error:"Invalid proof request."},{status:400,headers:PRIVATE_CACHE_HEADERS});
  const { getAuthenticatedApiContext } = await import("../../../lib/authenticated-api-server");
  const auth = await getAuthenticatedApiContext(request);
  if ("response" in auth) return Response.json({error:"Authentication required."},{status:auth.response.status,headers:PRIVATE_CACHE_HEADERS});
  if (auth.userId !== ownerId) return hidden();
  try {
    const [{ buildFurvisePlanningContext }, { prepareAskInterpretationRequest }, { askCitedSourceReferences }] = await Promise.all([
      import("../../../lib/intelligence/planning-context"), import("../../../lib/intelligence/interpret-ask"),
      import("../../../lib/intelligence/ask-interpretation-sources")]);
    const {data:conversation,error} = await auth.supabase.from("ask_conversations").select("id,pet_profile_id")
      .eq("id",conversationId).eq("user_id",ownerId).maybeSingle<{id:string;pet_profile_id:string}>();
    if (error) throw Error("SOURCE_PROOF_READ_UNAVAILABLE");
    if (!conversation || !proofUuid(conversation.pet_profile_id)) return hidden();
    const {data:latest,error:messageError} = await auth.supabase.from("ask_conversation_messages").select("id,user_text")
      .eq("conversation_id",conversationId).eq("user_id",ownerId).eq("role","user").order("sequence_number",{ascending:false}).limit(1).maybeSingle<{id:string;user_text:string}>();
    if(messageError)throw Error("SOURCE_PROOF_READ_UNAVAILABLE");
    if(!latest||!proofUuid(latest.id)||typeof latest.user_text!=="string")return hidden();
    const context = await buildFurvisePlanningContext({supabase:auth.supabase,userId:ownerId,petId:conversation.pet_profile_id,
      conversationId,sourceMessageId:latest.id,currentMessage:latest.user_text,locale:"en"});
    context.conversationTurns=context.conversationTurns.filter(turn=>turn.id!==latest.id);
    // Replay the latest existing USER source through the SAME normal planning loader. Persist/send nothing.
    const started = performance.now();
    const prepared = prepareAskInterpretationRequest(context,"gpt-5.4");
    const refs = askCitedSourceReferences(prepared.context);
    const { explicitlyNamedOwnedPets } = await import("../../../lib/intelligence/entities/resolve-turn-subject");
    const owned = context.eligiblePets.filter(p=>p.user_id===ownerId);
    const subjectSources = prepared.context.conversationTurns.filter(t=>t.role==="user").map(t=>({
      turnHash:proofHash(t.id),subjectHashes:explicitlyNamedOwnedPets(t.text,owned).map(p=>proofHash(p.id))
    })).filter(t=>t.subjectHashes.length);
    const retainedIds = new Set(prepared.context.conversationTurns.filter(t=>t.role==="user").map(t=>t.id));
    const schema = JSON.stringify(prepared.request.text.format.schema);
    const serialized = JSON.stringify(prepared.request);
    const instruction = prepared.request.instructions;
    const depth = (x: unknown): number => !x || typeof x !== "object" ? 0 : 1 + Math.max(0,...Object.values(x).map(depth));
    return Response.json({kind:"preview_source_reference_preparation",snapshotMode:"normal_planning_latest_stored_user_replay",observedAt:new Date().toISOString(),
      sourceSha256:process.env.FURVISE_PREVIEW_CAPTURE_SOURCE_SHA256,deploymentHost:process.env.VERCEL_URL || null,
      conversationHash:proofHash(conversationId),subjectHash:proofHash(conversation.pet_profile_id),
      userSubjectProvenance:{retainedExplicitUserTurnCount:subjectSources.length,
        retainedExplicitOwnedSubjectCount:new Set(subjectSources.flatMap(t=>t.subjectHashes)).size,
        subjectSources,pinnedPriorUserTurnCount:(prepared.context.pinnedUserSourceIds||[]).filter(id=>id!==context.currentTurn?.id).length,
        pinnedTurnsAllRetained:(prepared.context.pinnedUserSourceIds||[]).every(id=>retainedIds.has(id)||id===context.currentTurn?.id),
        citedPairTurnsAllRetained:refs.every(ref=>retainedIds.has(ref.sourceTurnId)),
        currentExplicitOwnedSubjectCount:explicitlyNamedOwnedPets(context.currentMessage,owned).length,
        userProvenanceOnly:true,subjectResolutionProven:false},
      sourceReferenceCount:refs.length,sourceReferenceIdentityHashes:refs.map(ref=>proofHash(ref.sourceId)),
      sourceReferencePairHashes:refs.map(ref=>proofHash(JSON.stringify(ref))),
      schemaOffersSourceRef:schema.includes('"source_ref"'),
      literalGuidanceDistinct:instruction.includes("source_ref uses supplied identities; literal filters AND.")
        && !instruction.includes("Predicates select requested content, not record types, source/subject/date locators"),
      requestSha256:proofHash(serialized),schemaSha256:proofHash(schema),instructionsSha256:proofHash(instruction),
      requestCharacters:serialized.length,requestDepth:depth(prepared.request),preparationSeconds:(performance.now()-started)/1000,
      retainedUserTurns:prepared.context.conversationTurns.length,omittedUserTurns:prepared.context.planningSourceWindow?.omittedPriorUserTurns ?? 0,
      newUserTurnPersisted:false,providerCalled:false,reservationEffects:false,rawCapture:false,
      identityNotContentAuthority:true,actualNextProviderInputHashProven:false,paidAdmissionProven:false
    },{headers:PRIVATE_CACHE_HEADERS});
  } catch {
    return Response.json({error:"Source-reference preparation unavailable; no provider call or reservation attempted."},
      {status:503,headers:PRIVATE_CACHE_HEADERS});
  }
}
