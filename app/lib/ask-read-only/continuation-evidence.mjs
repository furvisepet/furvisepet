import {validateHistorySynthesis} from "./history-synthesis.mjs";

/** Composition only: all handles/bodies have already passed owned acquisition.
 * A source-review label cannot erase newly read remainder findings. Reuse exact
 * whole wording for identical reports; recover only complete bounded originals.
 * Never infer episodes, clinical facts, trends or authority for another task. */
export function completeFreshHistory(tasks,sources,coverage){
 if(!tasks)return tasks;
 return tasks.map(task=>{
  if(!["saved_continuation","saved_content"].includes(task.kind)||task.kind==="saved_content"&&!task.combineHistory||task.recordMode!=="collection"||!task.needsHistory
   ||typeof task.reference!=="string"||!task.reference||task.status==="unresolved"||task.missing.length||!Array.isArray(task.historySynthesis))return task;
  const catalog=new Map(sources.filter(s=>s.kind==="history").map(s=>[s.handle,s]));
  const fresh=new Map();
  for(const group of coverage){
   if(group.scope.kind!=="history"||!["fresh_remainder","fresh_scoped"].includes(group.scope.evidenceRole)
    ||group.scope.reference!==task.reference||!task.pets.includes(group.scope.petHandle))continue;
   for(const row of group.sources){
    const s=catalog.get(row.source);
    if(!s||row.kind!=="history"||row.pet!==s.petName||group.scope.pet!==s.petName||row.body!==s.body
     ||Date.parse(row.eventAt)!==Date.parse(s.eventAt)||Date.parse(row.recordedAt)!==Date.parse(s.recordedAt))continue;
    fresh.set(s.handle,s);
   }
  }
  if(!fresh.size)return task;
  const next={...task,sources:[...task.sources],historyFacts:task.historyFacts.map(f=>({...f})),
   historySynthesis:task.historySynthesis.map(t=>({...t,evidence:t.evidence.map(e=>({...e}))})),
   freshSourceHandles:[...fresh.keys()]};
  const represented=new Set([...next.historyFacts.map(f=>f.source),...next.historySynthesis.flatMap(t=>t.evidence.map(e=>e.source))]);
  let recoveredFacts=0,matchedRoutineSupports=0;
  for(const s of fresh.values()){
   if(represented.has(s.handle))continue;
   let matched=false;
   for(const theme of next.historySynthesis){
    for(const e of [...theme.evidence]){
     const original=catalog.get(e.source);
     if(!original||original.petId!==s.petId||e.petId!==s.petId)continue;
     const checked=validateHistorySynthesis([{topic:theme.topic,evidence:[{source:s.handle,excerpt:e.excerpt}]}],sources,[s.handle],[]);
     const exact=checked?.[0]?.evidence?.[0];
     if(exact?.excerpt!==e.excerpt)continue; // No lost qualifier/negation.
     theme.evidence.push(exact);represented.add(s.handle);matchedRoutineSupports++;matched=true;break;
    }
    if(matched)break;
   }
   if(matched)continue;
   const body=s.body.trim();
   if(body&&body.length<=280&&next.historyFacts.length<6){
    next.historyFacts.push({source:s.handle,excerpt:body});represented.add(s.handle);recoveredFacts++;
   }
  }
  next.freshRepresentedHandles=[...fresh.keys()].filter(h=>represented.has(h));
  next.sources=[...new Set([...next.sources,...next.freshRepresentedHandles])];
  const unrepresentedFreshSources=[...fresh.keys()].filter(h=>!represented.has(h)).length;
  if(unrepresentedFreshSources)Object.assign(next,{status:"partial",reason:"not_answered",freshEvidenceMissing:true});
  next.continuationEvidenceReview={freshSourceCount:fresh.size,representedFreshSources:fresh.size-unrepresentedFreshSources,
   matchedRoutineSupports,recoveredFacts,unrepresentedFreshSources};
  return next;
 });
}
