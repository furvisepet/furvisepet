import type {AskEvidenceContract} from './ask-evidence.ts';
import {explicitHistoryDays} from './explicit-history-dates.ts';
/** Narrow stated-count answer; never counts notes or infers illness episodes. */
export function withinNoteCountAnswer(contract: AskEvidenceContract): string | null {
 const q=contract.interpretation?.referenceQuestion || contract.scope.requestText;
 if(!contract.history || !contract.scope.readOnlyRecall || contract.scope.status!=='resolved'
   || contract.scope.authorizedPetIds.length!==1 || contract.history.corrections==='unavailable'
   || /\b(?:episodes?|ever|lifetime|and|also|why|what|where|which|when|quote|verbatim)\b/i.test(q) || !/\b(?:note|entry|report)\b/i.test(q)) return null;
 const unit=/\b(?:how many accidents|one accident or two|one or two accidents)\b/i.test(q)?'accidents':null;
 if(!unit) return null;
 const days=explicitHistoryDays(q,new Date().getUTCFullYear());if(days.length!==1)return null;
 const petId=contract.scope.authorizedPetIds[0];
 const notes=contract.represented.filter(s=>/\b(?:urinated|accidents?)\b/i.test(s.text) && s.petId===petId && s.sourceType==='care_update' && s.occurredAt?.slice(0,10)===days[0]
   && Date.parse(s.occurredAt)<=Date.now() && s.start===0 && s.end===s.text.length
   && !contract.losses.some(l=>l.sourceId===s.sourceId)
   && contract.sources.some(p=>p.petId===petId && p.status==='loaded' && p.loadedIds.includes(s.sourceId))
   && contract.history?.provenance.some(p=>p.sourceId===s.sourceId && ['effective_linked','unverified_legacy'].includes(p.status)));
 if(notes.length!==1 || /\b(?:correct\w*|retract\w*|mistak\w*)\b/i.test(notes[0].text)
   || contract.history.reasons.includes("unlinked_correction_uncertain"))return null;
 const sentences=notes[0].text.split(/(?<=[.!?])\s+/);
 const sentence=sentences.find(s=>/\burinated on\b[^.!?]{1,80}\bonce yesterday and once today[.!]?$/i.test(s));
 if(!sentence || !contract.petNames?.[petId] || sentence.slice(0,sentence.toLowerCase().indexOf('urinated')).replace(/^Note:\s*/i,'').trim().toLowerCase()!==contract.petNames[petId].toLowerCase()
   || /\b(?:not|never|may|might|maybe|could|if|whether|possibly|correction)\b/i.test(sentence)
   || sentences.some(s=>s!==sentence && /\b(?:urinated|accidents?|again)\b/i.test(s)))return null;
 contract.answerSourceIds=[notes[0].sourceId];
 return `The ${days[0]} note describes two accidents.`;
}
