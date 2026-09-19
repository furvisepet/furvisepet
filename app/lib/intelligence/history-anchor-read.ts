import { historyQueryTerms } from "./history-query-relevance.ts";

export type SinceAnchorRead = { anchorTerms: string[]; topicTerms: string[]; anchorLabel: string };

export function parseSinceAnchorRead(message: string, petNames: string[] = []): SinceAnchorRead | null {
  const match=/\bsince\s+([^,?.!]{2,80})(?:[,?.!]|$)/i.exec(message);
  if(!match) return null;
  let anchor=match[1].trim();
  for(const name of petNames.filter(Boolean)){
    const escaped=name.replace(/[.*+?^$\\{}()|[\]\\]/g,"\\$&");
    anchor=anchor.replace(new RegExp("^"+escaped+"(?:['’]s)?\\s+","i"),"");
  }
  anchor=anchor.replace(/^(?:the|that|this|last|previous)\s+/i,"").trim();
  const anchorTerms=historyQueryTerms([anchor],petNames);
  if(!anchorTerms.length) return null;
  const lower=message.toLowerCase();
  let rawTopic:string[]=[];
  if(/\b(?:food|diet|eat(?:ing)?|ate|appetite|feeding|meal)\b/i.test(message)) rawTopic=["food","diet","appetite","eating"];
  else if(/\b(?:weight|weigh(?:ed|s|ing)?|body mass)\b/i.test(message)) rawTopic=["weight","weighed"];
  else if(/\b(?:stool|diarrh|digestive|stomach)\b/i.test(message)) rawTopic=["stool","diarrhea","digestive"];
  else if(/\b(?:medication|medicine|drug|dose)\b/i.test(message)) rawTopic=["medication","dose"];
  else if(/\b(?:activity|walk|energy|exercise)\b/i.test(message)) rawTopic=["activity","walk","energy"];
  if(!rawTopic.length || !/\b(?:what|show|tell|list|find|write|log|record|note)\b/i.test(lower)) return null;
  const topicTerms=historyQueryTerms(rawTopic,petNames);
  return topicTerms.length ? {anchorTerms,topicTerms,anchorLabel:anchor} : null;
}
