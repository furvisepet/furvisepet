import { READ_ONLY_LIMITS } from "../../../lib/ask-read-only/core.mjs";
import { READ_ONLY_PROFILE_FIELDS } from "../../../lib/ask-read-only/data";
import type { DogProfileRow } from "../../../lib/supabase";
import { getAskConversationRequestContext } from "../../../lib/ask-conversation-server";
import { readBoundedJson, API_BODY_LIMITS } from "../../../lib/security/request";
import { verifyAskCitationProof, checkedReadOnlyCitationSources, type CitationSourceRow } from "../../../lib/ask-citation-proof";

export async function POST(request: Request) {
 const auth=await getAskConversationRequestContext(request);
 if("response" in auth)return auth.response;
 let input: {proof?:unknown;title?:unknown;summary?:unknown;sections?:unknown;safetyNote?:unknown;supportingText?:unknown};
 try { input=await readBoundedJson(request,API_BODY_LIMITS.askCitations) as typeof input; }
 catch { return Response.json({error:"These references could not be checked."},{status:400}); }
 if(typeof input?.summary!=="string" || !Array.isArray(input.sections))return Response.json({error:"These references could not be checked."},{status:400});
 const proof=verifyAskCitationProof(input.proof,auth.userId,{title:input.title,summary:input.summary,sections:input.sections,safetyNote:input.safetyNote,supportingText:input.supportingText});
 if(!proof)return Response.json({error:"These references are unavailable."},{status:404});
 // RLS and explicit owner/subject checks both apply; no service-role read.
 const petIds=[...new Set(proof.sources.map(s=>s.petId))];
 const {data:pets,error:petError}=await Promise.resolve(auth.supabase.from("dog_profiles").select(proof.sources.some(source=>source.kind==="profile")?READ_ONLY_PROFILE_FIELDS:"id,user_id")
  .eq("user_id",auth.userId).in("id",petIds).limit(32).abortSignal(AbortSignal.timeout(5000)).returns<DogProfileRow[]>())
  .catch(()=>({data:null,error:true}));
 if(petError || !pets || pets.length!==petIds.length || petIds.some(id=>!pets.some(p=>p.id===id)))
  return Response.json({error:"These references are unavailable."},{status:404,headers:{"Cache-Control":"no-store"}});
 const noteIds=proof.sources.filter(source=>source.kind!=="profile").map(source=>source.id);
 const {data,error}=noteIds.length?await Promise.resolve(auth.supabase.from("pet_care_entries")
  .select("id,user_id,pet_profile_id,note,title,occurred_at,created_at,deleted_at")
  .eq("user_id",auth.userId).in("id",noteIds).is("deleted_at",null).limit(READ_ONLY_LIMITS.records).abortSignal(AbortSignal.timeout(5000)).returns<CitationSourceRow[]>())
  .catch(()=>({data:null,error:true})):{data:[],error:null};
 const sources=!error && data ? checkedReadOnlyCitationSources(proof,data,pets) : null;
 if(!sources)return Response.json({error:"These references have changed or are unavailable."},{status:404,headers:{"Cache-Control":"no-store"}});
 return Response.json({sources},{headers:{"Cache-Control":"no-store"}});
}
