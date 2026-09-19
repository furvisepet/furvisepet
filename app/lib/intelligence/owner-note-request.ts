import { ownerDeclinesPersistence, unquotedOwnerText } from "../ai/owner-assertion.ts";
import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
import { calendarBoundaryToInstant, resolveAskTimeZone } from "../ask-time-zone.ts";
import { findExplicitCareRecordAuthorization } from "../furvise-brain/mutation-authorization.ts";
import type { FurviseAuthorizationSource } from "../furvise-brain/turn-authority.ts";

export type OwnerNoteRequest = {
  note: string;
  occurredAt: string | null;
  explicitTime: string | null;
  needsAnswer: boolean;
  companionQuestion: string | null;
  authorizationSource: Extract<FurviseAuthorizationSource, "current_turn" | "transport">;
  authorizationEvidence: string;
};

export function resolveOwnerNoteRequest(input: {
  message: string; mode?: "note"; pet: { id: string; name: string | null };
  pets: Array<{ id: string; name: string | null }>; timeZone?: string; sourceRecordedAt?: string;
}): OwnerNoteRequest | null {
  const text = input.message.trim();
  if (!text || ownerDeclinesPersistence(text)) return null;

  let authorizationSource: OwnerNoteRequest["authorizationSource"];
  let authorizationEvidence: string;
  if (input.mode === "note") {
    authorizationSource = "transport";
    authorizationEvidence = "note_mode";
  } else {
    const commandText = unquotedOwnerText(text);
    if (/\b(?:hypothetical|fictional|pretend|suppose|example|translate)\b/i.test(commandText)) return null;
    const sentences = splitSentencesPreservingFacts(commandText);
    const authorization = findExplicitCareRecordAuthorization(text);
    if (!authorization) return null;
    const commands = sentences.filter(sentence => sentence.includes(authorization));
    if (!commands.length) return null;
    const commandIndex = sentences.findIndex(sentence => sentence.includes(authorization));
    const commandHasCondition = commands.some(sentence => /\b(?:if|unless)\b/i.test(sentence));
    const priorClauseConditionsReferencedNote = commandIndex > 0
      && /\b(?:if|unless)\b/i.test(sentences[commandIndex - 1])
      && /\b(?:this|that)\s+note\b|\bit\b/i.test(sentences[commandIndex]);
    // A conditional save is not durable authorization. Scope this guard to the
    // save clause (or the clause it explicitly points back to) so an unrelated
    // follow-up such as "tell me if..." does not suppress a valid note write.
    if (commandHasCondition || priorClauseConditionsReferencedNote) return null;
    if (/\b(?:notes|entries|separate|each|delete|remove|replace|correct|resolve|reopen|mark|profile|subscription|billing)\b/i.test(commands.join(" "))) return null;
    const named = input.pets.filter(pet => pet.name && new RegExp(`(?<![\\p{L}])${escape(pet.name)}(?![\\p{L}])`, "iu").test(commandText));
    if (named.some(pet => pet.id !== input.pet.id)) return null;
    if (!named.length && !/\b(?:my|our)\s+(?:pet|dog|cat)\b/i.test(commandText)) return null;
    authorizationSource = "current_turn";
    authorizationEvidence = authorization;
  }

  const time = explicitNoteTime(text, input.timeZone, input.sourceRecordedAt);
  const split = authorizationSource === "current_turn" ? splitOwnerNoteAndCompanion(text, authorizationEvidence) : { note: text, companionQuestion: null };
  const noteText = split.note || stripStandaloneSaveDirective(text);
  if (!noteText) return null;
  return {
    note: noteText,
    ...time,
    needsAnswer: input.mode !== "note" && Boolean(split.companionQuestion || hasAdditionalNoteTask(text)),
    companionQuestion: input.mode === "note" ? null : split.companionQuestion,
    authorizationSource,
    authorizationEvidence,
  };
}

export function stripStandaloneSaveDirective(text: string) {
  return text.replace(/\s*(?:please\s+)?(?:save|log|record|remember|add)\s+(?:(?:that|this)\s+note|that|this|it)(?:\s+(?:for|as)\s+(?:today|tonight|tomorrow|the\s+note|a\s+note))?[.!?]?\s*$/i, "").trim();
}

export function splitOwnerNoteAndCompanion(text: string, authorizationEvidence: string) {
  const sentences=splitSentencesPreservingFacts(unquotedOwnerText(text));
  const commandIndex=sentences.findIndex(sentence=>sentence.trim()===authorizationEvidence.trim());
  if(commandIndex<0) return {note:stripStandaloneSaveDirective(text),companionQuestion:null};
  const noteParts:string[]=[];
  const companionParts:string[]=[];
  for(let i=0;i<sentences.length;i++){
    const sentence=sentences[i].trim();
    if(!sentence) continue;
    if(i<commandIndex){ noteParts.push(sentence); continue; }
    if(i>commandIndex){
      const refersToSavedNote = /\b(?:this|that|the|new)\s+(?:saved\s+)?note\b/i.test(sentence)
        && /\b(?:weight|include|contain|have|has|had|say|says|said|mention|mentions|mentioned|date|time|category)\b/i.test(sentence);
      if(/[?]$|\b(?:tell me|show me|list|find|check|review|compare|calculate|compute|verify|what|why|how|should|is (?:it|this|that|he|she)|are (?:there|they)|did i|do i|can you|could you|would you)\b/i.test(sentence) || refersToSavedNote) companionParts.push(sentence);
      else noteParts.push(sentence);
      continue;
    }
    const follow=/(?:,?\s*(?:and\s+)?then\s+|[.;]\s+)(?=(?:tell me|show me|list|find|check|review|compare|calculate|compute|verify|what|why|how|should|is|are|did|do|can|could|would)\b)/i.exec(sentence);
    const commandPart=(follow?sentence.slice(0,follow.index):sentence).trim();
    if(follow) companionParts.push(sentence.slice(follow.index+follow[0].length).trim());
    const stripped=commandPart.replace(/^(?:(?:and|but|then)\s+)?(?:please\s+)?(?:save|log|record|remember|add|store)\s+(?:(?:that|this)\s+note|that|this|it)(?:\s+(?:for|as)\s+(?:today|tonight|tomorrow|the\s+note|a\s+note))?(?:\s+(?:on|for)\s+[\p{L}\p{M}'’ -]{1,60})?\s*[:,-]?\s*/iu,"").trim();
    if(stripped && !/^[\s.,;:!?-]*$/.test(stripped) && !/^(?:for|as)\s+(?:today|tonight|tomorrow)\b/i.test(stripped)) noteParts.push(stripped);
  }
  const note=noteParts.join(" ").trim();
  const companionQuestion=companionParts.join(" ").trim()||null;
  return {note,companionQuestion};
}

function escape(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function explicitNoteTime(text: string, timeZone?: string, sourceRecordedAt?: string): { occurredAt: string | null; explicitTime: string | null } {
  const unknown = { occurredAt: null, explicitTime: null };
  const dates = [...text.matchAll(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/gi)];
  if (!dates.length && sourceRecordedAt && Number.isFinite(Date.parse(sourceRecordedAt))) {
    const relative = [...text.matchAll(/\b(yesterday|today|tonight|this morning|this afternoon|this evening)\b/gi)];
    if (relative.length === 1) {
      const zone = resolveAskTimeZone(timeZone);
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(sourceRecordedAt));
      const part = (type: string) => parts.find(item => item.type === type)?.value;
      const day = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`);
      day.setUTCDate(day.getUTCDate() - (relative[0][0].toLowerCase() === 'yesterday' ? 1 : 0));
      const calendarDate = day.toISOString().slice(0, 10);
      return { occurredAt: calendarBoundaryToInstant(calendarDate + "T00:00:00.000Z", zone), explicitTime: calendarDate };
    }
  }
  if (dates.length !== 1) return unknown;
  const literal = dates[0][0];
  const timestamp = Date.parse(literal + " UTC");
  if (!Number.isFinite(timestamp)) return unknown;
  const day = new Date(timestamp).toISOString().slice(0, 10);
  const expectedDay = /^\d{4}-/.test(literal) ? Number(literal.slice(-2)) : Number(/\s(\d{1,2})/.exec(literal)?.[1]);
  if (Number(day.slice(-2)) !== expectedDay) return unknown;
  const clocks = [...text.matchAll(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/gi)];
  if (clocks.length > 1) return unknown;
  const zone = resolveAskTimeZone(timeZone);
  let occurredAt = calendarBoundaryToInstant(day + "T00:00:00.000Z", zone);
  if (clocks.length) {
    const [, h, m, meridiem] = clocks[0];
    const hour = Number(h) % 12 + (meridiem.toUpperCase() === "PM" ? 12 : 0);
    const candidate = new Date(Date.parse(occurredAt) + (hour * 60 + Number(m)) * 60_000);
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(candidate);
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    if ([part("year"), part("month"), part("day")].join("-") !== day || Number(part("hour")) !== hour || Number(part("minute")) !== Number(m)) return unknown;
    occurredAt = candidate.toISOString();
  }
  return { occurredAt, explicitTime: clocks.length ? `${literal} ${clocks[0][0]}` : day };
}

function hasAdditionalNoteTask(text: string): boolean {
  const unquoted = unquotedOwnerText(text);
  if (/\?|\b(?:explain|compare|calculate|compute|convert|list|show|find|retrieve|verify|check|review|search|look (?:back|up)|recommend|advise|tell me|what|why|how|should|is (?:it|this|that|he|she)|summari[sz]e)\b/i.test(unquoted)) return true;
  const sentences = splitSentencesPreservingFacts(unquoted);
  const lastSave = sentences.findLastIndex(sentence => /\b(?:save|log|record|add)\b/i.test(sentence));
  return lastSave >= 0 && sentences.slice(lastSave + 1).some(sentence =>
    !/^(?:(?:please )?keep (?:the |your )?(?:response|answer|reply) (?:brief|short|concise)|thanks|thank you)[.!]?$/i.test(sentence.trim()));
}
