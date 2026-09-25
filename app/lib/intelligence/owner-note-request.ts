import { unquotedOwnerText } from "../ai/owner-assertion.ts";
import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
import { calendarBoundaryToInstant, resolveAskTimeZone } from "../ask-time-zone.ts";
import { findExplicitCareRecordAuthorization } from "../furvise-brain/mutation-authorization.ts";
import type { UserSourceSpan } from "../furvise-brain/append-job.ts";

/** Source suggestions only. Brain assigns jobs; these spans grant no authority. */
export function ownerNoteSourceSpans(text: string, sourceMessageId: string): ReadonlyArray<UserSourceSpan & { role: "source" | "note" | "companion" }> {
  const authorization = findExplicitCareRecordAuthorization(text);
  const split = authorization ? splitOwnerNoteAndCompanion(text, authorization) : null;
  const candidates = split ? [{ role: "note" as const, text: split.note }, ...(split.companionQuestion ? [{ role: "companion" as const, text: split.companionQuestion }] : [])] : [];
  const spans = candidates.flatMap(candidate => {
    const start = text.indexOf(candidate.text);
    if (!candidate.text || start < 0 || text.indexOf(candidate.text, start + 1) >= 0) return [];
    return [Object.freeze({ ...candidate, sourceMessageId, id: `${sourceMessageId}:${start}:${start + candidate.text.length}`, start, end: start + candidate.text.length })];
  });
  return Object.freeze(spans.length ? spans : [Object.freeze({ id: `${sourceMessageId}:0:${text.length}`, sourceMessageId, start: 0, end: text.length, text, role: "source" as const })]);
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
