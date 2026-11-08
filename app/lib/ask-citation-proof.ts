import { isReadOnlyResult } from "./ask-read-only/core.mjs";
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AskReasoningResult } from "./ai/ask-reasoning.ts";
import { readReviewedHistoryAnswer } from "./intelligence/history-review-state.ts";
import { labsListReviewFailure } from "./intelligence/labs-list.ts";

export type VerifiedAskCitation = { label: string; quote: string; eventAt: string; recordedAt: string };
type Body = { title?: unknown; summary: string; sections: unknown; safetyNote?: unknown; supportingText?: unknown };
type Source = { id: string; petId: string; hash: string; event: string; recorded: string };
type Proof = { v: 1; owner: string; body: string; sources: Source[] };
export const citationBodyHash = (body: Body) => createHash("sha256").update(JSON.stringify([body.title??"Furvise",body.summary,body.sections,body.safetyNote??null,body.supportingText??null])).digest("hex");
function key() { const value = process.env.FURVISE_RATE_LIMIT_HASH_SECRET; return value && value.length >= 32 ? value : null; }
function mac(payload: string, secret: string) { return createHmac("sha256",secret).update("furvise.ask.citations.v1\0"+payload).digest("hex"); }
/** Issued only from the original in-memory source review, never model JSON. */
export function issueAskCitationProof(result: AskReasoningResult | undefined, body: Body, owner: string): string | null {
 const secret=key(), labs=result?.labsList;
 if (!secret || !result || !labs || labs.ticket.authority!=="stored_report" || labsListReviewFailure(result)
   || !readReviewedHistoryAnswer(result) || body.title!==result.answer.title || (body.safetyNote??null)!==result.answer.safetyNote || (body.supportingText??null)!==null || body.summary!==result.answer.summary
   || JSON.stringify(body.sections)!==JSON.stringify(result.answer.sections) || labs.records.length>32) return null;
 const sources=labs.records.map(r=>({id:r.id,petId:r.petId,hash:createHash("sha256").update(r.body).digest("hex"),event:r.event_at,recorded:r.recorded_at!}));
 if (!sources.length || sources.some(r=>!result.evidenceContract?.scope.authorizedPetIds.includes(r.petId))) return null;
 const payload=Buffer.from(JSON.stringify({v:1,owner,body:citationBodyHash(body),sources} satisfies Proof)).toString("base64url");
 if(payload.length>96000)return null;
 return payload+"."+mac(payload,secret);
}
/** Verification is necessary but not sufficient: the authenticated endpoint rechecks current source rows. */
export function verifyAskCitationProof(token: unknown, owner: string, body: Body): Proof | null {
 const secret=key();
 if(!secret || typeof token!=="string" || token.length>97000)return null;
 const parts=token.split(".");
 if(parts.length!==2 || !/^[a-f0-9]{64}$/.test(parts[1]))return null;
 if(!timingSafeEqual(Buffer.from(parts[1],"hex"),Buffer.from(mac(parts[0],secret),"hex")))return null;
 try {
  const p=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")) as Proof;
  if(p.v!==1 || p.owner!==owner || p.body!==citationBodyHash(body) || !Array.isArray(p.sources) || !p.sources.length || p.sources.length>32
   || new Set(p.sources.map(s=>s.id)).size!==p.sources.length
   || p.sources.some(s=>!s || [s.id,s.petId,s.hash,s.event,s.recorded].some(v=>typeof v!=="string")))return null;
  return p;
 } catch { return null; }
}
export type CitationSourceRow = {id:string;user_id:string;pet_profile_id:string;note:string|null;title:string|null;occurred_at:string;created_at:string;deleted_at:string|null};
export function checkedCitationSources(proof: NonNullable<ReturnType<typeof verifyAskCitationProof>>, rows: CitationSourceRow[]): VerifiedAskCitation[] | null {
 if(rows.length!==proof.sources.length)return null;
 const matched=proof.sources.map(s=>rows.find(r=>r.id===s.id));
 if(matched.some((r,i)=>!r || r.user_id!==proof.owner || r.pet_profile_id!==proof.sources[i].petId || r.deleted_at
  || createHash("sha256").update(r.note??r.title??"").digest("hex")!==proof.sources[i].hash || r.occurred_at!==proof.sources[i].event || r.created_at!==proof.sources[i].recorded))return null;
 return matched.map((r,i)=>({label:"Saved note "+(i+1),quote:r!.note??r!.title??"",eventAt:r!.occurred_at,recordedAt:r!.created_at}));
}

/** Issued only for a source-validated in-memory read-only result, never a model proof. */
export function issueReadOnlyCitationProof(result:unknown,body:Body,owner:string):string|null {
 if(!isReadOnlyResult(result))return null;
 const reviewed=result as {sources:Array<{kind:string;id:string;ownerId:string;petId:string;body:string;eventAt:string;recordedAt:string}>};
 const rows=reviewed.sources.filter(source=>source.kind==="history");
 const secret=key();
 if(!secret||!rows.length||rows.length>32||rows.some(row=>row.ownerId!==owner))return null;
 const sources=rows.map(row=>({id:row.id,petId:row.petId,hash:createHash("sha256").update(row.body).digest("hex"),event:row.eventAt,recorded:row.recordedAt}));
 const payload=Buffer.from(JSON.stringify({v:1,owner,body:citationBodyHash(body),sources} satisfies Proof)).toString("base64url");
 return payload+"."+mac(payload,secret);
}
