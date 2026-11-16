/** Whole-original delivery is independent of how its display timestamps are phrased. */
export function requestsWholeOriginal(question){
 return /\b(?:quote|quotation|wording|verbatim|original)\b/iu.test(question)
  &&/\b(?:full|whole|entire|complete|exact|exactly|original|verbatim|every\s+sentence|replace\s+(?:the|that)\s+quotation)\b/iu.test(question);
}
/** Quote one verified original as a whole; model synthesis is not required for
 * verbatim source delivery. Independently bounded clinical guidance is retained. */
export function preserveRequestedOriginal(answer,tasks,sources,question,clinicalActive=false){
 const history=tasks?.filter(t=>t.needsHistory),task=history?.[0];
 if(history?.length!==1||task.kind!=="saved_content"||task.recordMode!=="single"||task.status!=="complete"||!requestsWholeOriginal(question))return answer;
 const selected=sources.filter(s=>s.kind==="history"&&task.sources.includes(s.handle));
 if(selected.length!==1)return answer;
 const source=selected[0];
 const meaning=task.includeSourceDates&&/\b(?:explain|difference|mean(?:s|ing)?)\b/iu.test(question)&&(/\btimestamps?\b/iu.test(question)||/\b(?:event|happened)\b/iu.test(question)&&/\b(?:saved|recorded)\b/iu.test(question))
  ?" Event time refers to the reported care occurrence; recorded time refers to the entry’s creation. Saving the note later does not establish a second care event or verify current health.":"";
 const text=clinicalActive?answer.answer:"Here is the original saved note."+meaning;
 return {...answer,answer:text,validatedParts:clinicalActive?answer.validatedParts:[{index:0,kind:"saved",text}],
  quotes:[{source:source.handle,quote:source.body}],sources:[...new Set([...(answer.sources??[]),source.handle])],
  presentation:{...answer.presentation,sourceDates:task.includeSourceDates?[{kind:source.kind,eventAt:source.eventAt,recordedAt:source.recordedAt,pet:source.petName??null}]:answer.presentation?.sourceDates??[]}};
}
