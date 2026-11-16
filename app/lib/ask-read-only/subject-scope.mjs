export function positiveOwnedPets(question,pets){
 const mentions=[];
 for(const pet of pets){
  if(typeof pet.name!=="string"||!pet.name)return [];
  const escaped=pet.name.replace(/[.*+?^$()|[\]\\{}]/g,"\\$&");
  for(const m of question.matchAll(new RegExp("(?<![\\p{L}\\p{N}])"+escaped+"(?![\\p{L}\\p{N}])","giu"))){
   const prefix=question.slice(Math.max(0,m.index-45),m.index);
   mentions.push({pet,start:m.index,end:m.index+m[0].length,negative:/\b(?:not|instead of|rather than|excluding|except)\s*$/iu.test(prefix)});
  }
 }
 if(mentions.some((m,i)=>mentions.some((n,j)=>i!==j&&m.start<n.end&&n.start<m.end&&m.pet.handle!==n.pet.handle)))return [];
 return [...new Map(mentions.filter(m=>!m.negative).map(m=>[m.pet.handle,m.pet])).values()];
}

const escape=name=>name.replace(/[.*+?^$()|[\]\\{}]/g,"\\$&");
export function namedOwnedPets(text,pets){
 if(typeof text!=="string")return [];
 return pets.filter(p=>typeof p.name==="string"&&p.name.trim()&&new RegExp("(?<![\\p{L}\\p{N}])"+escape(p.name)+"(?![\\p{L}\\p{N}])","iu").test(text));
}
/** Identity only: UI state and assistant prose never establish an antecedent. */
export function ownerSubjectScope(question,dialogue,pets){
 const explicit=positiveOwnedPets(question,pets);
 const unique=rows=>rows.length>0&&rows.every(p=>pets.filter(other=>other.name.toLocaleLowerCase()===p.name.toLocaleLowerCase()).length===1);
 if(explicit.length)return unique(explicit)?{method:"explicit_owner",pets:explicit.map(p=>p.handle)}:null;
 if(!/\b(?:that|those|same|now|it|its|he|his|she|her|they|their|them)\b/iu.test(question))return null;
 const prior=[...(dialogue??[])].reverse().find(t=>t.role==="user");
 const named=positiveOwnedPets(prior?.text??"",pets);
 return unique(named)&&named.length===1?{method:"prior_owner",pets:[named[0].handle]}:null;
}
/** Generated prose has no authority to introduce another owned subject.
 * Original source bodies and owner quotations are validated separately. */
export function assertGeneratedSubject(value,scope,pets){
 if(!scope?.pets?.length)return;
 for(const component of value?.components??[]){
  if(typeof component?.text!=="string")continue;
  if(positiveOwnedPets(component.text,pets).some(p=>!scope.pets.includes(p.handle))){
   const error=new Error("ASK_READ_SUBJECT_SCOPE");error.code="ASK_READ_SUBJECT_SCOPE";
   error.answerDiagnostic={category:"subject_scope",field:"generated_subject"};throw error;
  }
 }
}
export const SUBJECT_INSTRUCTIONS="ownerSubjectScope binds the owner-established subject of this request. An explicit pet in the question overrides the UI selection. For a follow-up, only the immediately preceding owner turn can establish its subject; assistant prose and UI selection do not. Preserve that subject in every generated sentence. Do not introduce another pet from the household. Identity does not authorize extra reads or medical decisions.";

export const DIALOGUE_TASK_INSTRUCTIONS="An in-chat draft, routine or agreed restriction visible in dialogue is conversational content, even after reload; recalling it does not require a saved care record. Distinguish conversation recall from saved-record lookup. Preserve all visible agreed restrictions when reminding the owner of a routine. If essential earlier text is actually missing, say so. A question about whether one read note proves no other records exist asks for an evidence-limit explanation: directly explain that a single note does not establish absence of other records, and separate that from anything actually searched. Owner instructions and requests are not observations for a vet brief; select only actual reported observations as ownerFacts.";
