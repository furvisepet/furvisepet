/** Owner-scoped bounded acquisition. Raw rows and DB attempts stay capped even
 * when candidates overlap; reused evidence is accounted separately. */
export const EVIDENCE_GOALS=Object.freeze(["exact_quote","relevant_records","boundary","comparison","complete_set"]);
export const HISTORY_PAGE_BUDGET=8;
export const HISTORY_PAGE_SIZE=16;
export const HISTORY_CANDIDATE_BUDGET=64;
const identity=row=>row.kind+":"+row.id;
const same=(a,b)=>["kind","ownerId","petId","body","eventAt","recordedAt"].every(key=>a[key]===b[key]);
const scopeKey=request=>JSON.stringify([request.pet?.ownerId,request.pet?.id,request.from??null,request.to??null,request.recordedFrom??null,request.recordedTo??null,request.referenceTimeZone??null,request.sourceIds?[...request.sourceIds].sort():null]);
const compare=request=>(a,b)=>{
 const field=request.orderBy==="recorded"?"recordedAt":"eventAt";
 return (Date.parse(a[field])-Date.parse(b[field]))*(request.order==="asc"?1:-1)||a.id.localeCompare(b.id);
};
function createState(request){
 const terms=[...new Set(request.terms??[])].sort();
 const lane=(mode,terms,excludeTerms=[])=>({mode,terms,excludeTerms,offset:request.offset??0,total:null,inspected:0,pages:0,attempts:0,reusedPages:0,rawRows:0,duplicateRows:0,sharedCandidates:0,exhausted:false,seen:new Map(),sources:[]});
 return {request,lanes:terms.length?[lane("lexical",terms),lane("complementary",[],terms)]:[lane("scoped",[])],cursor:0,seen:new Map(),unavailable:false};
}
function resultOf(state,batchAcquisition){
 const {request,lanes}=state,groups=lanes.map(lane=>lane.sources),sources=[];
 for(let i=0;i<Math.max(0,...groups.map(rows=>rows.length));i++)for(const rows of groups)if(rows[i])sources.push(rows[i]);
 if(["complete_set","boundary","comparison"].includes(request.goal))sources.sort(compare(request));
 const lexical=lanes.find(lane=>lane.mode==="lexical");
 return {sources,total:lanes.every(lane=>Number.isSafeInteger(lane.total))?lanes.reduce((sum,lane)=>sum+lane.total,0):null,
  matchedTotal:lexical?.total??null,hasMore:lanes.some(lane=>!lane.exhausted),searchRelaxed:lexical?.total===0,
  discovery:lanes.map(({mode,offset,total,inspected,pages,attempts,reusedPages,rawRows,duplicateRows,sharedCandidates,exhausted})=>({mode,offset,total,inspected,pages,attempts,reusedPages,rawRows,duplicateRows,sharedCandidates,exhausted})),
  inspected:state.seen.size,scopeExhausted:lanes.every(lane=>lane.exhausted)&&!(request.offset>0)&&!state.unavailable,
  unavailable:state.unavailable,semanticRecallVerified:false,batchAcquisition};
}
/** Fair round-robin pages. Identical goal scopes coalesce, and a fully read
 * lane can be reused under another ordering without charging another DB read.
 * Complementary pages are the stable SQL complement of lexical matches:
 * changing an exclusion-ID list would invalidate offset pagination. */
export async function discoverHistoryBatch(requests,fetchPage,limits={}){
 if(requests.length>4)throw new Error("ASK_READ_TOOL_INVALID");
 const maxPages=Math.max(1,Math.min(HISTORY_PAGE_BUDGET,limits.pages??HISTORY_PAGE_BUDGET));
 const maxRows=Math.max(1,Math.min(HISTORY_CANDIDATE_BUDGET,limits.rows??HISTORY_CANDIDATE_BUDGET));
 const states=[],indices=[],coalesced=new Map(),completeLanes=new Map(),globalSeen=new Map();
 for(const request of requests){
  const key=scopeKey(request)+JSON.stringify([[...new Set(request.terms??[])].sort(),request.offset??0,request.orderBy??"event",request.order??"desc"]);
  let index=coalesced.get(key);
  if(index===undefined){index=states.length;coalesced.set(key,index);states.push(createState(request));}
  indices.push(index);
 }
 let attempts=0,pages=0,rawRows=0,reusedPages=0;
 for(let round=0;round<64;round++){
  let progressed=false;
  for(const state of states){
   if(state.unavailable)continue;
   let lane;
   for(let i=0;i<state.lanes.length;i++){
    const position=(state.cursor+i)%state.lanes.length;
    if(!state.lanes[position].exhausted){lane=state.lanes[position];state.cursor=(position+1)%state.lanes.length;break;}
   }
   if(!lane)continue;
   const key=scopeKey(state.request)+JSON.stringify([lane.terms,lane.excludeTerms]);
   const cached=completeLanes.get(key);
   const waiting=states.filter(other=>!other.unavailable&&other.lanes.some(l=>!l.exhausted)).length;
   const limit=cached?HISTORY_PAGE_SIZE:Math.min(HISTORY_PAGE_SIZE,(maxRows>rawRows?Math.max(1,Math.floor((maxRows-rawRows)/Math.max(1,waiting))):0));
   if(!cached&&(attempts>=maxPages||limit<1))continue;
   let result;
   try{
    if(cached){
     const ordered=[...cached].sort(compare(state.request));
     result={sources:ordered.slice(lane.offset,lane.offset+limit),total:ordered.length,hasMore:lane.offset+limit<ordered.length};
     lane.reusedPages++;reusedPages++;
    }else{
     // Attempts include failures; there are no uncounted look-ahead rows.
     attempts++;lane.attempts++;
     result=await fetchPage(state.request,{terms:lane.terms,excludeTerms:lane.excludeTerms,offset:lane.offset,limit});
     if(!result||!Array.isArray(result.sources)||result.sources.length>limit)throw new Error("ASK_READ_DATABASE_INVALID");
     pages++;lane.pages++;rawRows+=result.sources.length;lane.rawRows+=result.sources.length;
    }
    if(!result||!Array.isArray(result.sources)||result.sources.length>limit)throw new Error("ASK_READ_DATABASE_INVALID");
    for(const source of result.sources){
     const id=identity(source),old=globalSeen.get(id);
     if(old&&!same(old,source))throw new Error("ASK_READ_SOURCE_CHANGED");
     if(old&&!state.seen.has(id))lane.sharedCandidates++;
     if(!old)globalSeen.set(id,source);
     if(lane.seen.has(id))lane.duplicateRows++;
     else lane.seen.set(id,source);
     if(!state.seen.has(id)){state.seen.set(id,source);lane.sources.push(source);}
    }
    lane.inspected=lane.seen.size;lane.total=Number.isSafeInteger(result.total)&&result.total>=0?result.total:null;
    lane.exhausted=!result.hasMore;lane.offset+=result.sources.length;
    if(!result.sources.length&&result.hasMore){state.unavailable=true;lane.exhausted=false;}
    if(lane.exhausted&&!(state.request.offset>0)&&lane.total===lane.seen.size)completeLanes.set(key,[...lane.seen.values()]);
    progressed=true;
   }catch(error){
    if(error?.message!=="ASK_READ_HISTORY_UNAVAILABLE")throw error;
    state.unavailable=true;progressed=true;
   }
  }
  if(!progressed)break;
 }
 const acquisition={attempts,pages,rawRows,distinctCandidates:globalSeen.size,reusedPages,coalescedGoals:requests.length-states.length,pageLimit:maxPages,rowLimit:maxRows};
 return indices.map((index,i)=>{
  const result=resultOf({...states[index],request:requests[i]},acquisition);
  result.sharedAcquisition=indices.indexOf(index)!==i;
  if(result.sharedAcquisition)result.discovery=result.discovery.map(lane=>({...lane,attempts:0,pages:0,rawRows:0,reusedPages:lane.pages+lane.reusedPages,sharedCandidates:lane.inspected}));
  return result;
 });
}
export async function discoverHistory(request,fetchPage){
 const [result]=await discoverHistoryBatch([request],(_request,page)=>fetchPage(page),{pages:request.pageBudget??2,rows:request.candidateBudget??HISTORY_CANDIDATE_BUDGET});
 return result;
}

/** Allocate whole sources across goals before redistributing unused capacity.
 * Do not shorten attributed note bodies to make a source fit. */
function allocateDistinctEvidence(groups, limits) {
 const selected = [], known = new Map(), visible = groups.map(() => []);
 const deferred = groups.map(() => []);
 let characters = 0;
 const slots = Math.floor(limits.records / Math.max(1, groups.length));
 const share = Math.floor(limits.sourceCharacters / Math.max(1, groups.length));
 const add = (row, index, quota) => {
  const key = row.kind + ":" + row.id;
  let source = known.get(key);
  if (!source) {
   if (selected.length >= limits.records || row.body.length > 12000 || characters + row.body.length > limits.sourceCharacters || row.body.length > quota) return false;
   source = { ...row, handle: "s" + (selected.length + 1) };
   selected.push(source); known.set(key, source); characters += row.body.length;
  }
  if (!visible[index].includes(source)) visible[index].push(source);
  return true;
 };
 // Round-robin within equal reservations, rather than filling the first goal.
 const spent = groups.map(() => 0);
 const longest = Math.max(0, ...groups.map(group => group.length));
 for (let row = 0; row < longest; row++) for (let index = 0; index < groups.length; index++) {
  const source = groups[index][row];
  if (!source) continue;
  if (visible[index].length >= slots || !add(source, index, share - spent[index])) deferred[index].push(source);
  else spent[index] += source.body.length;
 }
 for (let row = 0; row < longest; row++) for (let index = 0; index < groups.length; index++) {
  const source = deferred[index][row];
  if (source) add(source, index, limits.sourceCharacters - characters);
 }
 return { sources: selected, visible, omitted: groups.map((group, index) => group.filter(row => !visible[index].some(source => source.kind === row.kind && source.id === row.id)).length) };
}

/** Identical source groups share one reservation, rather than diluting the
 * reservation for a genuinely distinct pet/period/goal. */
export function allocateEvidence(groups,limits){
 const unique=[],indices=[],keys=new Map();
 for(const group of groups){
  const key=JSON.stringify(group.map(identity));
  let index=keys.get(key);
  if(index===undefined){index=unique.length;keys.set(key,index);unique.push(group);}
  indices.push(index);
 }
 const result=allocateDistinctEvidence(unique,limits);
 return {...result,visible:indices.map(index=>result.visible[index]),omitted:indices.map(index=>result.omitted[index])};
}
