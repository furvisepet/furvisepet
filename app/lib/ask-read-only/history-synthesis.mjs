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
function scopedHeading(excerpt,phrase){
 const base=phrase.replace(/^(?:no|not|never|without)\s+/i,""),i=excerpt.toLocaleLowerCase().indexOf(base.toLocaleLowerCase());
 if(i<0)return "Historical observations";
 const part=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(excerpt)].find(p=>p.index<=i&&p.index+p.segment.length>i);
 const start=i-part.index,before=part.segment.slice(0,start),after=part.segment.slice(start+base.length);
 const conditional=/\b(?:if|whether|hypothetical|possibly|possible|may|might|could)\b/i;
 if(conditional.test(before)||conditional.test(after))return "Historical observations";
 const clauseBefore=before.split(/[,;:]|\b(?:but|whereas|however)\b/i).at(-1);
 const clauseAfter=after.split(/[,;:]|\b(?:but|whereas|however)\b/i)[0];
 const negative=/\b(?:no|not|never|without|denied|denies|cannot|can't|didn't|wasn't|isn't|hasn't)\b/gi;
 if([...clauseAfter.matchAll(negative)].length){
  const whole=part.segment.trim().replace(/[.!?]$/,"");return whole.length<=60?whole:"Historical observations";
 }
 const neg=[...clauseBefore.matchAll(negative)][0];
 if(neg){const heading=clauseBefore.slice(neg.index)+excerpt.slice(i,i+base.length);return heading.length<=60?heading:"Historical observations";}
 return excerpt.slice(i,i+base.length);
}
function coalescedThemes(themes){
 const groups=new Map();
 for(const theme of themes)for(const e of theme.evidence){
  const key=JSON.stringify([e.petId,theme.topic.toLocaleLowerCase()]);
  if(!groups.has(key))groups.set(key,{topic:theme.topic,evidence:[]});
  groups.get(key).evidence.push(e);
 }
 return [...groups.values()];
}
function representativeRows(theme){
 const shown=[];
 for(const e of theme.evidence)if(!shown.some(s=>s.excerpt===e.excerpt)&&shown.length<2)shown.push(e);
 return shown;
}
export function visibleHistoryEvidence(themes){
 return coalescedThemes(themes).flatMap(representativeRows);
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
   if(row){
    const base=theme.topic.replace(/^(?:no|not|never|without)\s+/i,"");
    const headings=evidence.filter(e=>e.excerpt.toLocaleLowerCase().includes(base.toLocaleLowerCase())).map(e=>scopedHeading(e.excerpt,theme.topic));
    topic=new Set(headings.map(t=>t.toLocaleLowerCase())).size===1?headings[0]:"Historical observations";
   }
  }
  out.push({topic,evidence});
 }
 return out.length||!value.length?out:null;
}
export function renderHistorySynthesis(themes,citationOrder=[]){
 const lines=[];
 for(const theme of coalescedThemes(themes)){
  const unique=[...new Map(theme.evidence.map(e=>[e.source,e])).values()],shown=representativeRows(theme);
  const timestamps=new Set(unique.map(e=>Date.parse(e.eventAt)));
  const wording=shown.map(row=>{const index=citationOrder.indexOf(row.source);return "“"+row.excerpt+"”"+(index>=0?" (Source "+(index+1)+")":"");}).join("; ");
  const reports=unique.length===1?"one selected saved report":unique.length+" selected saved reports with "+timestamps.size+" distinct event timestamp"+(timestamps.size===1?"":"s");
  lines.push((unique[0].pet??"Pet")+" — “"+theme.topic+"”: "+wording+" ("+reports+".)");
 }
 if(lines.length)lines.push("These are selected historical reports. Repeated mentions alone do not establish separate episodes, persistence or a trend; omitted periods may change the picture.");
 return lines.join("\n\n");
}
