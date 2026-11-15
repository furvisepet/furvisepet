const esc=s=>s.replace(/[.*+?^$()|[\]\\{}]/g,"\\$&");
/** UI selection is not an owner-established antecedent for a fresh pronoun.
 * Resolve no facts and grant no read: require a pet before private history IO. */
export function requirePronounPet(first,plan,context,dialogue,bind){
 if(!Array.isArray(plan)||!Array.isArray(context?.pets)||context.pets.length<2||!Array.isArray(context.references)||context.references.length||typeof context.question!=="string"||typeof bind!=="function")return null;
 if(!/\b(?:she|he|her|his|they|their|them)\b/iu.test(context.question)||!plan.some(t=>t.needsHistory&&!t.reference)||plan.some(t=>!["saved_content","calculation","clarification","general_guidance"].includes(t.kind)))return null;
 const named=text=>context.pets.some(p=>typeof p.name==="string"&&p.name.trim()&&new RegExp("(?<![\\p{L}\\p{N}])"+esc(p.name)+"(?![\\p{L}\\p{N}])","iu").test(text));
 if(named(context.question)||(dialogue??[]).some(m=>m.role==="user"&&typeof m.text==="string"&&named(m.text)))return null;
 const s=first.safety;
 if(!s||s.medicationIntent!=="none"||!["none","clinical_history"].includes(s.careContext)||![undefined,"none","historical"].includes(s.scenario)||s.currentEvents?.length||s.conditionalEvents?.length||s.currentConcern===true||!Array.isArray(s.missingContext)||s.missingContext.some(k=>!["pet","date"].includes(k))||!Array.isArray(first.calls))return null;
 // Reject malformed/foreign original reads through the SAME binder rather than
 // silently laundering a forged locator when suppressing an unscoped read.
 for(const c of first.calls){
  if(!c||Object.keys(c).sort().join(",")!=="arguments,id,name"||typeof c.id!=="string"||!c.id||typeof c.arguments!=="string"||c.arguments.length>5000)return null;
  let args;try{args=JSON.parse(c.arguments);}catch{return null;}
  bind(c.name,args);
 }
 const tasks=plan.map(t=>t.needsHistory?{...t,pets:[],reference:null,missing:[...new Set(["pet",...t.missing])]}:t);
 return {first:{...first,text:"",calls:[],historyIntent:first.historyIntent?{...first.historyIntent,pet:null}:first.historyIntent,safety:{...s,referent:"essential_unknown",missingContext:[...new Set(["pet",...s.missingContext])]}},plan:tasks,diagnostic:{method:"unestablished_history_pronoun",taskCount:tasks.filter(t=>t.needsHistory).length,suppressedReads:first.calls.length,grantsRead:false}};
}
