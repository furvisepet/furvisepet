/** Render the already reviewed historical urgency answer without inventing
 * a saved-record dependency for a question that asked for no saved evidence. */
export function reconcileHistoricalDelivery(tasks,policy,question,readCount,sourceCount){
 if(!Array.isArray(tasks)||!policy?.historicalOnly||!policy.active||readCount||sourceCount||policy.decision||policy.current.length||policy.conditional.length)return tasks;
 if(/\b(?:saved|record(?:ed|s|ing)?|logged|notes?|entr(?:y|ies)|quote|quotation|find|retrieve)\b|\blook up\b/iu.test(question))return tasks;
 const sourceFree=t=>!t.needsHistory&&!t.needsOwnerFacts&&!t.reference&&t.recordMode==="none"&&!t.missing.length&&!t.sources.length&&!t.ownerFacts.length&&!t.historyFacts.length;
 if(tasks.some(t=>!sourceFree(t)))return tasks;
 const direct=tasks.filter(t=>["general_guidance","clinical_guidance"].includes(t.kind));
 const phantom=tasks.filter(t=>t.kind==="saved_content");
 if(direct.length!==1||direct.length+phantom.length!==tasks.length)return tasks;
 return [{...direct[0],kind:"clinical_guidance",status:"complete",reason:"none"}];
}
