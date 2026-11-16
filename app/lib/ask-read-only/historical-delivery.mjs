/** Render the already reviewed historical urgency answer without inventing
 * a saved-record dependency for a question that asked for no saved evidence. */
export function reconcileHistoricalDelivery(tasks,policy,question,readCount,sourceCount,ownerScope=null){
 if(!Array.isArray(tasks)||!policy?.historicalOnly||!policy.active||readCount||sourceCount||policy.decision||policy.current.length||policy.conditional.length)return tasks;
 if(/\b(?:saved|record(?:ed|s|ing)?|logged|notes?|entr(?:y|ies)|quote|quotation|find|retrieve)\b|\blook up\b/iu.test(question))return tasks;
 const sourceFree=t=>!t.needsHistory&&!t.needsOwnerFacts&&!t.reference&&t.recordMode==="none"&&!t.missing.length&&!t.sources.length&&!t.historyFacts.length;
 if(tasks.some(t=>!sourceFree(t)))return tasks;
 const direct=tasks.filter(t=>["general_guidance","clinical_guidance"].includes(t.kind));
 const phantom=tasks.filter(t=>t.kind==="saved_content");
 if(!direct.length||direct.length+phantom.length!==tasks.length)return tasks;
 // One explicit urgency question can be redundantly split into general and
 // clinical delivery tasks. The already reviewed server answer covers it once.
 if(direct.length>1&&((String(question).match(/\?/g)??[]).length!==1||!/\b(?:urgent|emergency)\b/iu.test(question)||/\band\s+(?:why|how|what|which|can|could|would|should)\b/iu.test(question)
  ||new Set(direct.map(t=>JSON.stringify([...t.pets].sort()))).size!==1&&!(ownerScope?.method==="explicit_owner"&&ownerScope.pets.length===1)))return tasks;
 const chosen=direct.find(t=>t.kind==="clinical_guidance")??direct[0];
 return [{...chosen,...(ownerScope?.method==="explicit_owner"&&ownerScope.pets.length===1?{pets:[...ownerScope.pets]}:{}),kind:"clinical_guidance",status:"complete",reason:"none"}];
}
