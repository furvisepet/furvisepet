/** Historical synthesis has no free-prose frequency authority. Source selection
 * is already owner/pet/date bound; these claims retain complete original
 * sentences and quantify reports, never inferred episodes or persistence. */
export const HISTORY_SYNTHESIS_INSTRUCTIONS = [
 "Every completion entry must include historySynthesis. For saved_content or saved_continuation, group salient admitted evidence into up to four useful themes. Each theme has a topic that is an exact short phrase present in its evidence, and one or two source/excerpt pairs of COMPLETE contiguous original sentences. Use one representative complete sentence for an unchanged routine theme; use a second only for a meaningful difference or conflict. Omit unrelated weight sentences unless weight is requested. Include meaningful exceptions, not just routine boilerplate. The server renders the historical synthesis from these themes; component prose cannot establish historical facts, recurrence or trends.",
 "Several saved notes can mention the SAME episode. Different recorded dates do not establish different event dates, and different event dates do not prove separate episodes. Never infer recurring, persistent, worsening, improving, always, never, frequency, causation or absence from a count of mentions. Source-reported patterns must remain attributed exact quotations; numeric change requires server calculation over verified measurements. Negative, conditional and hypothetical evidence must retain its complete wording. A partial source selection cannot establish whole-history absence. Vet briefs use exact historyFacts and attributed ownerFacts; historySynthesis is empty for other tasks."
].join("\n");
const object=properties=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
export function historySynthesisSchema(handles){
 return {type:"array",maxItems:handles.length?4:0,items:object({
  topic:{type:"string",minLength:2,maxLength:60},
  evidence:{type:"array",minItems:1,maxItems:2,items:object({source:{type:"string",enum:handles.length?handles:["unavailable"]},excerpt:{type:"string",minLength:1,maxLength:280}})}
 })};
}
const keys=(o,k)=>o&&typeof o==="object"&&!Array.isArray(o)&&Object.keys(o).length===k.length&&k.every(x=>Object.hasOwn(o,x));
function complete(body,excerpt){
 const sentences=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(body)].map(s=>s.segment);
 for(let i=0;i<sentences.length;i++){let span="";for(let j=i;j<sentences.length;j++){span+=sentences[j];if(span.trim()===excerpt)return true;if(span.trim().length>excerpt.length)break;}}
 return false;
}
// A unique exact substring can be expanded to its whole original sentence(s).
// It can never trim negation, invent wording or join disjoint source spans.
function canonicalExcerpt(body,excerpt){
 if(complete(body,excerpt))return excerpt;
 const start=body.indexOf(excerpt);
 if(excerpt.length<20||start<0||body.indexOf(excerpt,start+1)>=0)return null;
 const end=start+excerpt.length,parts=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(body)];
 const spans=parts.filter(p=>p.index<end&&p.index+p.segment.length>start);
 const original=spans.map(p=>p.segment).join("").trim();
 return original.length<=280&&original.includes(excerpt)?original:null;
}
export function validateHistorySynthesis(value,sources,allowed,diagnostics=[]){
 if(!Array.isArray(value)||value.length>4){diagnostics.push("shape");return null;}
 const out=[];
 for(const theme of value){
  if(!keys(theme,["topic","evidence"])||typeof theme.topic!=="string"||!Array.isArray(theme.evidence)||!theme.evidence.length||theme.evidence.length>3){diagnostics.push("theme_shape");continue;}
  const evidence=[];
  for(const e of theme.evidence){
   const source=sources.find(s=>s.handle===e?.source&&s.kind==="history"&&allowed.includes(s.handle));
   if(!keys(e,["source","excerpt"])||!source||typeof e.excerpt!=="string"||!e.excerpt.trim()||e.excerpt.length>280){diagnostics.push("evidence_shape");continue;}
   const excerpt=canonicalExcerpt(source.body,e.excerpt);
   if(!excerpt){diagnostics.push("excerpt");continue;}
   evidence.push({source:e.source,excerpt,petId:source.petId,pet:source.petName,eventAt:source.eventAt,recordedAt:source.recordedAt});
  }
  if(!evidence.length)continue;
  // A display heading has no authority to invalidate otherwise exact facts.
  // Canonicalize case from the original or use a neutral server heading.
  let topic="Historical observations";
  if(theme.topic.length>=2&&theme.topic.length<=60&&!/[\r\n“”"<>]/.test(theme.topic)){
   const row=evidence.find(e=>e.excerpt.toLocaleLowerCase().includes(theme.topic.toLocaleLowerCase()));
   if(row){const i=row.excerpt.toLocaleLowerCase().indexOf(theme.topic.toLocaleLowerCase());topic=row.excerpt.slice(i,i+theme.topic.length);}
  }
  out.push({topic,evidence});
 }
 return out.length||!value.length?out:null;
}
export function renderHistorySynthesis(themes,citationOrder=[]){
 const lines=[];
 for(const theme of themes){
  // Never merge subjects even when the topic wording is identical.
  const pets=[...new Set(theme.evidence.map(e=>e.petId))];
  for(const petId of pets){
   const rows=theme.evidence.filter(e=>e.petId===petId);
   const unique=[...new Map(rows.map(e=>[e.source,e])).values()];
   const excerpts=[...new Set(unique.map(e=>e.excerpt))];
   const dates=new Set(unique.map(e=>e.eventAt.slice(0,10)));
   const wording=excerpts.map(t=>{const row=unique.find(e=>e.excerpt===t),index=citationOrder.indexOf(row.source);return "“"+t+"”"+(index>=0?" (Source "+(index+1)+")":"");}).join("; ");
   const reports=unique.length===1?"one selected saved report":unique.length+" selected saved reports on "+dates.size+" event date"+(dates.size===1?"":"s");
   lines.push((rows[0].pet??"Pet")+" — “"+theme.topic+"”: "+wording+" ("+reports+".)");
  }
 }
 if(lines.length)lines.push("These are selected historical reports. Repeated mentions alone do not establish separate episodes, persistence or a trend; omitted periods may change the picture.");
 return lines.join("\n\n");
}
