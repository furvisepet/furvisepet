/** Current owner speech about unavailable information is not a record locator.
 * This conservative boundary grants no acquisition or factual value. */
export function reconcileDeclaredUnavailability(first,plan,context,pets,ownerId,bindPet,bindRead){
 const safety=first?.safety;
 if(!Array.isArray(first?.calls)||first.workflowIntent&&first.workflowIntent!=="none"||plan?.length!==1||!safety
  ||safety.medicationIntent!=="none"||safety.careContext!=="none"||safety.scenario!=="none"
  ||safety.currentEvents?.length||safety.conditionalEvents?.length
  ||!Array.isArray(safety.missingContext)||safety.missingContext.some(k=>!["pet","date"].includes(k)))return null;
 const task=plan[0];
 if(!task||!Array.isArray(task.pets)||!Array.isArray(task.missing)||!["general_guidance","saved_content","clarification"].includes(task.kind)||!["none","single","collection"].includes(task.recordMode)
  ||task.reference||task.needsOwnerFacts||task.pets.length>1
  ||task.missing.some(k=>!["pet","year","date_meaning","which_record"].includes(k)))return null;
 const question=context.question;
 if(typeof question!=="string"||!question.includes("?")
  ||/\b(?:draft|create|write|revise|design|suggest|compose|make|plan|compare|summari[sz]e|overview|all|complete|every|check|search|retrieve|quote)\b|\blook up\b|\bfind (?:in|the|a|my)\b/i.test(question))return null;
 const declarations=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(question)].map(p=>p.segment.trim()).filter(sentence=>{
  if(sentence.length>280||sentence.includes("?")||/\b(?:until|since|before|after|but|except|only|maybe|perhaps|whether|if|unless|should|would|could|nothing)\b/i.test(sentence))return false;
  const text=sentence.normalize("NFKC").replaceAll("’","'");
  return /^I\s+(?:(?:have|had)\s+(?:not|never)|haven't|hadn't|never|did\s+not|didn't)\s+(?:ever\s+)?(?:recorded|entered|saved|logged|described|(?:written|wrote) down)\b/i.test(text)
   ||/^(?:the|this|that)\b[^.!?]{1,180}\b(?:(?:was|were)\s+(?:never|not)|(?:has|have)\s+(?:never|not)\s+been)\s+(?:recorded|entered|saved|logged|described)\b/i.test(text)
    ||pets.some(p=>p.ownerId===ownerId&&typeof p.name==="string"&&p.name.trim()
    &&new RegExp("^"+p.name.replace(/[.*+?^{}$()|[\]\\]/g,"\\$&")+"'s\\s+[^.!?]{1,160}\\b(?:(?:has|have)\\s+(?:never|not)\\s+been|(?:was|were)\\s+(?:never|not))\\s+(?:recorded|entered|saved|logged|described)\\s+by\\s+me[.!]?$","iu").test(text));
 });
 if(declarations.length!==1)return null;
 const escape=name=>name.replace(/[.*+?^{}$()|[\]\\]/g,"\\$&");
 const named=pets.filter(p=>p.ownerId===ownerId&&typeof p.name==="string"&&p.name.trim()
  &&new RegExp("(?<![\\p{L}\\p{N}])"+escape(p.name)+"(?![\\p{L}\\p{N}])","iu").test(question));
 if(named.length!==1)return null;
 const pet=bindPet(named[0].handle);
 if(!pet||pet.ownerId!==ownerId||pet.id!==named[0].id)return null;
 // Suppress speculative acquisition only after validating every proposed locator.
 for(const call of first.calls){
  if(typeof bindRead!=="function"||!call||Object.keys(call).sort().join(",")!=="arguments,id,name"||typeof call.arguments!=="string")return null;
  const request=bindRead(call.name,JSON.parse(call.arguments));
  if(!["search_saved_records","read_pet_profile"].includes(call.name)||request.pet.id!==pet.id||request.pet.ownerId!==ownerId)return null;
 }
 const corrected={...task,kind:"general_guidance",needsHistory:false,recordMode:"none",pets:[pet.handle],missing:[],includeSourceDates:false};
 return {declaration:declarations[0],plan:[corrected],first:{...first,calls:[],historyIntent:first.historyIntent?{...first.historyIntent,requested:false}:first.historyIntent,text:"",safety:{...safety,referent:"clear",missingContext:[]}}};
}
export const DECLARED_UNAVAILABLE_ANSWER="You said that detail wasn’t recorded. I don’t have a verified saved answer for it.";

/** An owner-declared absent pet is an information limit, not a write action.
 * Correct only the specific generic capability notice after zero-read delivery.
 * This does not assert another account's facts or grant a lookup. */
export function renderDeclaredAbsentPet(answer,question,pets,readCount){
 if(readCount!==0||answer.sources?.length||!Array.isArray(answer.taskCompletion)
  ||/\b(?:save|edit|delete|upload|create|remove|change)\b/iu.test(question))return answer;
 const declarations=[...question.matchAll(/\b([\p{Lu}][\p{L}\p{M}'-]{0,39})\s+(?:is\s+not|isn't)\s+(?:an?\s+)?(?:owned|saved)\s+pet\b/gu)];
 if(declarations.length!==1)return answer;
 const name=declarations[0][1];
 if(pets.some(p=>p.name?.toLocaleLowerCase()===name.toLocaleLowerCase()))return answer;
 const escaped=name.replace(/[.*+?^$()|[\]\\{}]/g,"\\$&");
 const detail=question.match(new RegExp("\\b"+escaped+"['’]s\\s+(?:body\\s+)?(weight|age)\\b","iu"))?.[1];
 if(!detail)return answer;
 const unsupported=answer.taskCompletion.filter(t=>t.kind==="general_guidance"&&t.reason==="not_supported"&&t.status==="unresolved"&&t.sourceCount===0);
 const notice="General guidance: This requested action is unavailable through read-only Ask.";
 if(unsupported.length!==1||!answer.answer.includes(notice))return answer;
 const text="You said "+name+" isn't a saved pet in this account. I don't have a verified saved "+detail+" for "+name+".";
 const taskCompletion=answer.taskCompletion.map(t=>t===unsupported[0]?{...t,status:"complete",reason:"none"}:t);
 const limited=taskCompletion.some(t=>t.status!=="complete");
 return {...answer,answer:answer.answer.replace(notice,text),taskCompletion,limited,replyType:limited?"partial":"answer"};
}
