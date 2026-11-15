import { mapAskProse } from "../furvise-output.ts";
import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
import { preserveAttributedReportQuotes, preserveFictionalDialogueQuotes } from "../application-actions/state-claims.ts";
import { APP_CAPABILITIES } from "./app-capabilities.mjs";

export const IMAGE_CAPABILITY_BOUNDARY="Ask is text-only; I can’t receive or inspect photos here. You can type the relevant text for me to explain.";
/** Capability speech only. Source quotations are opaque data; neither a
 * refusal nor ordinary advice about the owner's own photos grants image input. */
export function enforceImageCapability(value:string,protectedFacts:string[]=[]){
 if(APP_CAPABILITIES.ask.canReadImages)return {text:value,changed:false};
 let marker="FURVISEIMAGEFACT";while(value.includes(marker))marker+="X";
 const facts:string[]=[];
 let masked=value;
 for(const fact of [...protectedFacts].filter(Boolean).sort((a,b)=>b.length-a.length)){
  if(masked.includes(fact)){const token=marker+facts.length+"END";facts.push(fact);masked=masked.replaceAll(fact,token);}
 }
 let rejected=false;
 const checked=mapAskProse(masked,prose=>preserveFictionalDialogueQuotes(prose,text=>preserveAttributedReportQuotes(text,unquoted=>{
  let removedMedia=false;
  return splitSentencesPreservingFacts(unquoted).filter(sentence=>{
   const media=/\b(?:photo(?:graph)?s?|pictures?|images?|screenshots?|scans?)\b/i.test(sentence);
   const inspect=/\b(?:(?:I|we|Ask|Furvise)\s+(?:can|could|will|would|am able to|are able to)|(?:I|we)['’]ll)(?:\s+(?:also|help|you|to))*\s+(?:read|inspect|analy[sz]e|interpret|examine|view|see|look at|identify|describe|transcribe|extract)\b/i.test(sentence);
   const request=/\b(?:send|upload|attach|share|show)\s+(?:(?:me|us)\s+)?(?:[^.!?]{0,60})\b(?:photos?|pictures?|images?|screenshots?|scans?)\b/i.test(sentence)
    &&!/\b(?:can(?:not|['’]t)|do not|don['’]t|unable|no)\b/i.test(sentence)
    &&!/\b(?:vet|veterinarian|clinic|your own|personal files)\b/i.test(sentence);
   // Explaining a typed transcription is supported, even if its origin was a photo.
   const textOnly=/\b(?:type|typed|transcrib(?:e|ed)|paste|pasted)\b[^.!?]{0,90}\b(?:text|words|description|contents)\b/i.test(sentence)
    &&/\b(?:explain|discuss|summariz[e]|interpret)\b/i.test(sentence);
   const unsupported=!textOnly&&(media&&(inspect||request)||removedMedia&&inspect&&/\b(?:it|them|that)\b/i.test(sentence));
   if(unsupported)rejected=true;
   removedMedia=unsupported&&media||removedMedia;
   return !unsupported;
  }).join(" ");
 })));
 let text=checked;facts.forEach((fact,index)=>{text=text.replaceAll(marker+index+"END",fact);});
 return {text:rejected?text:value,changed:rejected};
}
