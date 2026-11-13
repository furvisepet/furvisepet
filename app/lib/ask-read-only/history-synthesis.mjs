/** Historical synthesis has no free-prose frequency authority. Source selection
 * is already owner/pet/date bound; these claims retain complete original
 * sentences and quantify reports, never inferred episodes or persistence. */
export const HISTORY_SYNTHESIS_INSTRUCTIONS = [
 "Every completion entry must include historySynthesis. For saved_content or saved_continuation, group salient admitted evidence into up to four useful themes. Each theme has a topic that is an exact short phrase present in its evidence, and one to three source/excerpt pairs of COMPLETE contiguous original sentences. Include meaningful exceptions, not just routine boilerplate. The server renders the historical synthesis from these themes; component prose cannot establish historical facts, recurrence or trends.",
 "Several saved notes can mention the SAME episode. Different recorded dates do not establish different event dates, and different event dates do not prove separate episodes. Never infer recurring, persistent, worsening, improving, always, never, frequency, causation or absence from a count of mentions. Source-reported patterns must remain attributed exact quotations; numeric change requires server calculation over verified measurements. Negative, conditional and hypothetical evidence must retain its complete wording. A partial source selection cannot establish whole-history absence. Vet briefs use exact historyFacts and attributed ownerFacts; historySynthesis is empty for other tasks."
].join("\n");
const object=properties=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
export function historySynthesisSchema(handles){
 return {type:"array",maxItems:handles.length?4:0,items:object({
  topic:{type:"string",minLength:2,maxLength:60},
  evidence:{type:"array",minItems:1,maxItems:3,items:object({source:{type:"string",enum:handles.length?handles:["unavailable"]},excerpt:{type:"string",minLength:1,maxLength:280}})}
 })};
}
const keys=(o,k)=>o&&typeof o==="object"&&!Array.isArray(o)&&Object.keys(o).length===k.length&&k.every(x=>Object.hasOwn(o,x));
function complete(body,excerpt){
 const sentences=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(body)].map(s=>s.segment);
 for(let i=0;i<sentences.length;i++){let span="";for(let j=i;j<sentences.length;j++){span+=sentences[j];if(span.trim()===excerpt)return true;if(span.trim().length>excerpt.length)break;}}
 return false;
}
export function validateHistorySynthesis(value,sources,allowed){
 if(!Array.isArray(value)||value.length>4)return null;
 const out=[];
 for(const theme of value){
  if(!keys(theme,["topic","evidence"])||typeof theme.topic!=="string"||theme.topic.length<2||theme.topic.length>60||/[\r\n“”"<>]/.test(theme.topic)||!Array.isArray(theme.evidence)||!theme.evidence.length||theme.evidence.length>3)return null;
  const evidence=[];
  for(const e of theme.evidence){
   const source=sources.find(s=>s.handle===e?.source&&s.kind==="history"&&allowed.includes(s.handle));
   if(!keys(e,["source","excerpt"])||!source||typeof e.excerpt!=="string"||!e.excerpt.trim()||e.excerpt.length>280||!complete(source.body,e.excerpt))return null;
   evidence.push({...e,petId:source.petId,pet:source.petName,eventAt:source.eventAt,recordedAt:source.recordedAt});
  }
  // Topic is displayed as an attributed source phrase, never as a new assertion.
  if(!evidence.some(e=>e.excerpt.includes(theme.topic)))return null;
  out.push({topic:theme.topic,evidence});
 }
 return out;
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
   lines.push((rows[0].pet??"Pet")+" — source phrase “"+theme.topic+"”: "+wording+" ("+reports+".)");
  }
 }
 if(lines.length)lines.push("These are selected historical reports. Repeated mentions alone do not establish separate episodes, persistence or a trend; omitted periods may change the picture.");
 return lines.join("\n\n");
}
