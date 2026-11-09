"use client";
import { useEffect, useState } from "react";
import { formatAskCitationDate as date } from "../lib/ask-citation-date";
import { getBrowserSupabase } from "../lib/supabase";
import type { VerifiedAskCitation as Source } from "../lib/ask-citation-proof";
/** Rechecks every mount/replay. No citation is displayed from stored DTO fields alone. */
export function AskCitations({proof,title,summary,sections,safetyNote,supportingText}:{proof?:string;title:string;summary:string;sections:unknown;safetyNote:string|null;supportingText:string|null}) {
 const identity=JSON.stringify([proof,title,summary,sections,safetyNote,supportingText]);
 const [checked,setChecked]=useState<{identity:string;sources:Source[];unavailable:boolean}|null>(null);
 const sources=checked?.identity===identity ? checked.sources : [];
 const unavailable=checked?.identity===identity && checked.unavailable;
 useEffect(()=>{
  const abort=new AbortController();
  if(!proof)return ()=>abort.abort();
  void (async()=>{
   try {
    const client=getBrowserSupabase();
    if(!client)throw Error("auth");
    const {data}=await client.auth.getSession();
    const token=data.session?.access_token;
    if(!token)throw Error("auth");
    const response=await fetch("/api/ask/citations",{method:"POST",signal:abort.signal,cache:"no-store",
     headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({proof,title,summary,sections,safetyNote,supportingText})});
    if(!response.ok)throw Error("unavailable");
    const result=await response.json() as {sources:Source[]};
    if(!abort.signal.aborted)setChecked({identity,sources:result.sources,unavailable:false});
   } catch { if(!abort.signal.aborted)setChecked({identity,sources:[],unavailable:true}); }
  })();
  return ()=>abort.abort();
 },[proof,title,summary,sections,safetyNote,supportingText,identity]);
 if(!proof)return null;
 if(unavailable)return <p className="mt-3 text-sm">The saved source references could not be rechecked.</p>;
 if(!sources.length)return null;
 return <section aria-label="Saved sources" className="mt-4 space-y-2">
  <p className="text-sm font-semibold">Saved sources</p>
  {sources.map((source,index)=><details key={index} className="rounded-lg border p-3">
   <summary className="min-h-11 cursor-pointer break-words py-2 text-sm">{source.label} · Event date: {date(source.eventAt)}</summary>
   <p className="mt-2 text-xs">Recorded date: {date(source.recordedAt)}</p>
   <blockquote className="mt-2 whitespace-pre-wrap break-words">{source.quote}</blockquote>
  </details>)}
  <p className="text-xs">Exact saved wording. These references do not establish the current or corrected facts.</p>
 </section>;
}
