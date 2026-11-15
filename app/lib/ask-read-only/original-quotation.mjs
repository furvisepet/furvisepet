/** One independently selected original is quoted by the server, never rebuilt
 * from reordered model excerpts. Mixed or unresolved requests keep their pipeline. */
export function preserveRequestedOriginal(answer,tasks,sources,question,clinicalActive=false){
 if(clinicalActive||tasks?.length!==1||tasks[0].kind!=="saved_content"||tasks[0].recordMode!=="single"||tasks[0].status!=="complete"||!/\b(?:verbatim|full original|exact (?:quote|quotation|wording)|replace the quotation)\b/iu.test(question))return answer;
 const selected=sources.filter(s=>s.kind==="history"&&tasks[0].sources.includes(s.handle));
 if(selected.length!==1)return answer;
 const source=selected[0];
 return {...answer,answer:"Here is the original saved note.",validatedParts:[{index:0,kind:"saved",text:"Here is the original saved note."}],
  quotes:[{source:source.handle,quote:source.body}],sources:[source.handle],
  presentation:{...answer.presentation,sourceDates:tasks[0].includeSourceDates?[{kind:source.kind,eventAt:source.eventAt,recordedAt:source.recordedAt,pet:source.petName??null}]:answer.presentation?.sourceDates??[]}};
}
