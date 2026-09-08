/** Narrow extraction from an explicitly named pet's note; no clinical inference. */
export function recordedWeightGrams(note: string, petName: string): number | null {
 const escaped=petName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const direct=new RegExp(`^(?:Note: )?${escaped} weighed ([0-9]{1,6})(?:\\.([0-9]{1,3}))? kg(?: today)?\\.(?:\\s|$)`,'i').exec(note);
 let match=direct, remaining=direct?note.slice(direct[0].length):note;
 if(!match && new RegExp(`^(?:Note: )?${escaped}\\b`).test(note)) {
   const pronoun=/(?:^|\.\s+|\s+and\s+)(?:(?:His|Her|Their) weight today was|(?:[Hh]e|[Ss]he|[Tt]hey) weighs?) ([0-9]{1,6})(?:\.([0-9]{1,3}))? kg(?: today)?\.(?:\s|$)/.exec(note);
   if(pronoun) {
     const prefix=note.slice(0,pronoun.index);
     const names=prefix.match(/\b[A-Z][a-z]+\b/g)||[];
     // Another named subject or relationship makes the pronoun ambiguous.
     if(names.every(name=>[petName,'Note','His','Her','Their','He','She','They'].includes(name))
       && !/\b(?:other|another|dog|cat|pet|friend|sister|brother|owner|mother|father|if|may|might|maybe|could|would|whether|guess|estimate|assume)\b/i.test(prefix)) {
       match=pronoun;remaining=note.slice(0,pronoun.index)+note.slice(pronoun.index+pronoun[0].length);
     }
   }
 }
 if(!match||/\b(?:weigh\w*|kg|lb|correct\w*|retract\w*|uncertain|estimated)\b/i.test(remaining)) return null;
 const grams=Number(match[1])*1000+Number((match[2]||'').padEnd(3,'0'));
 return Number.isSafeInteger(grams)&&grams>0?grams:null;
}
