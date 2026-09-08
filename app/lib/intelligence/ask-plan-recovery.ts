import { explicitHistoryDays, normalizeExplicitHistoryDates } from "./explicit-history-dates.ts";
import { requestedHistoryTimelineDays } from "./requested-history-timeline.ts";
import { requestedCalendarInterval } from "./calendar-interval.ts";
import { medicationReferencePet } from "./medication-reference.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { emptyProposedSemanticFrame } from "./semantic-frame/extract-frame.ts";
import { explicitlyNamedOwnedPets } from "./entities/resolve-turn-subject.ts";
import type { FurviseLiveContext } from "./types.ts";
import type { AskInterpretation } from "./interpret-ask.ts";

type Context = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "pet" | "currentMessage" | "conversationTurns">;
const reads = new Set(["overview", "recall", "comparison", "status", "general"]);
/** Repair redundant read metadata, never identities, filters or write evidence.
 * The strict validator must still approve the entire normalized proposal. */
export function normalizeAskReadProposal(value: unknown, context: Context): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const p = { ...value as Record<string, unknown> };
  const initialOperation = p.operation;
  const reference = datedNoteReformulation(context);
  if (reference && p.ordinal === null) {
    const { day, after } = reference;
    if ([null, day].includes(p.from as string | null) && [null, day, after].includes(p.to as string | null)
      && Array.isArray(p.terms) && p.terms.length <= 6 && p.terms.every(term => typeof term === "string" && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term) && term.length <= 32)) {
      Object.assign(p, { operation: "recall", readOperation: "recall", selection: "reference", subject: "conversation",
        petNames: [], topic: "dated note", terms: [], from: day, to: after, ordinal: null, episodeTopic: null, frame: emptyProposedSemanticFrame() });
    }
  }
  // A whole-history change question has no named symptom to narrow to. Do not
  // let a model-invented topic (for example medication) hide other changes.
  const words = context.currentMessage.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const nameWords = new Set(context.eligiblePets.filter(pet => pet.user_id === context.owner.userId)
    .flatMap(pet => (pet.name || "").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
  const changeWords = new Set("in from according to the my pet pets notes history records what which has have had was were is are and but then later recently improved improvement better got get changed change changes came back returned return recur recurred recurrence for of about since that it his her their s health".split(" "));
  if (reads.has(String(p.operation)) && reads.has(String(p.readOperation)) && p.ordinal === null
    && /\b(?:notes|history|records)\b/i.test(context.currentMessage) && /\b(?:what|which)\b/i.test(context.currentMessage)
    && /\b(?:improved|better|changed|changes|returned|recurred|came back)\b/i.test(context.currentMessage)
    && words.every(word => changeWords.has(word) || nameWords.has(word))
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { operation: "overview", readOperation: "overview", selection: "summary", topic: "recorded changes", terms: [] });
  }
  // Asking which sign recurred supplies no specific symptom search term.
  if (reads.has(String(p.operation)) && reads.has(String(p.readOperation)) && p.ordinal === null
    && /\bwhich\b[\s\S]{0,60}\b(?:symptom|sign)\b/i.test(context.currentMessage)
    && /\b(?:recorded|notes|history|report)\b/i.test(context.currentMessage)
    && /\b(?:returning|returned|recurred|recurring|came back)\b/i.test(context.currentMessage)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { operation: "overview", readOperation: "overview", selection: "summary", topic: "recorded recurrence", terms: [] });
  }
  // A broad saved-food question supplies a category, not an ingredient or a
  // prior weight question's lexical filter. Keep invalid metadata invalid.
  if (reads.has(String(p.operation)) && reads.has(String(p.readOperation)) && p.ordinal === null
    && /\b(?:recorded|saved)\s+(?:foods?|diets?)\b|\b(?:foods?|diets?)\b[\s\S]{0,60}\b(?:notes|history|records)\b/i.test(context.currentMessage)
    && !/\b(?:weight|weighs|symptoms?|stools?|medication|allergy|chicken|turkey|salmon|beef|rice)\b/i.test(context.currentMessage)
    && Array.isArray(p.terms) && p.terms.length <= 6 && p.terms.every(term => typeof term === "string"
      && term.length >= 3 && term.length <= 32 && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term))
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { topic: "recorded food", terms: ["food", "diet", "kibble", "eat", "treat"] });
  }
  // Row ordering is not a request to discard all but the first measurement.
  if (reads.has(String(p.operation)) && reads.has(String(p.readOperation)) && p.ordinal === null
    && /\bweights?\b/i.test(context.currentMessage) && /\btable\b/i.test(context.currentMessage)
    && /\b(?:older|oldest)\b[\w\s-]{0,30}\bfirst\b|\bchronological(?:ly)?\b/i.test(context.currentMessage)
    && !/\bonly\b|\bfirst\s+\d+\b|\blast\s+\d+\b/i.test(context.currentMessage)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { operation: "comparison", readOperation: "comparison", selection: "summary" });
  }
  // A complete acknowledgment has no animal referent or saved-data request.
  // The entire message is an acknowledgment, regardless of model operation.
  // Reduce it to zero evidence/write authority; never swallow extra clauses.
  if (/^(?:thanks?(?: you)?(?: a lot| so much)?|thank you(?: so much)?|ty|thx)(?:[,! .]+(?:that helps|that helped|that clears it up|that makes sense|appreciate it|so much))?[.! ]*$/i.test(context.currentMessage.trim())
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { operation: "general", readOperation: "general", subject: "non_pet",
      petNames: [], topic: "acknowledgment", terms: [], from: null, to: null,
      ordinal: null, episodeTopic: null, selection: "summary", frame: emptyProposedSemanticFrame() });
  }
  // Conditional safety guidance must not become a saved-record lookup merely
  // because the hypothetical mentions an old problem returning.
  if (!analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion
    && /\b(?:if|hypothetically|suppose|supposing)\b/i.test(context.currentMessage)
    && (/\b(?:breath\w*|collaps\w*|urin\w*|poison\w*|ibuprofen)\b/i.test(context.currentMessage)
      && /\b(?:urgency|urgent|emergency|safe|wait|what (?:should|would))\b/i.test(context.currentMessage)
      || /\b(?:medication|medicine|dose|dosage)\b/i.test(context.currentMessage)
      && /\b(?:should|can|could) I\b/i.test(context.currentMessage)
      && /\b(?:change|increase|decrease|double|stop)\b/i.test(context.currentMessage))) {
    Object.assign(p, { operation: "general", readOperation: "general", subject: "non_pet", petNames: [],
      selection: "summary", terms: [], from: null, to: null, ordinal: null, episodeTopic: null, frame: emptyProposedSemanticFrame() });
  }
  // A stated quantity within one dated note is not a count of illness episodes.
  // Keep the proposed subject, literal terms and bounds for strict validation.
  const quantityWording = context.currentMessage.replace(/\brather than how many episodes\b/gi, "");
  const datedQuantity = typeof p.from === "string" && typeof p.to === "string"
    && Date.parse(p.to) - Date.parse(p.from) === 86400000
    && /\b(?:stools?|accidents?|tablets?|doses?|courses?)\b/i.test(quantityWording);
  const documentedCourses = /\bmedication courses?\b/i.test(quantityWording)
    && /\b(?:explicitly described|recorded|documented|in (?:the )?(?:notes|records))\b/i.test(quantityWording);
  const withinNoteQuantity = /\b(?:how many\s+(?:stools?|accidents?|tablets?|doses?|courses?)|one accident or two|one or two accidents)\b/i.test(quantityWording)
    && /\b(?:note|entry|report)\b/i.test(quantityWording);
  if (["count", "clarify", "recall"].includes(String(p.operation))
    && (p.readOperation === null || ["count", "clarify", "recall"].includes(String(p.readOperation))) && p.ordinal === null
    && (datedQuantity || documentedCourses || withinNoteQuantity)
    && !/\b(?:episodes?|ever|lifetime|separate|distinct)\b/i.test(quantityWording)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { operation: "recall", readOperation: "recall", selection: datedQuantity ? "reference" : "summary", episodeTopic: null });
    // A note can describe an accident using the observation rather than the label.
    if (withinNoteQuantity && /\baccidents?\b/i.test(quantityWording)
      && Array.isArray(p.terms) && p.terms.length > 0 && p.terms.length < 6
      && p.terms.every(term => typeof term === "string" && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term)
        && term.length >= 3 && term.length <= 32) && !p.terms.includes("urinat")) p.terms = [...p.terms, "urinat"];
  }
  // The requested unit determines the read task. A duration remains a
  // historical read even when its endpoints mention symptoms or episodes.
  // Do not compute from the exclusive retrieval bound or manufacture dates.
  const durationQuantity = /\bhow many\s+(?:hours?|days?|weeks?|months?|years?)\b/i.test(quantityWording);
  const competingCount = /\bhow many\s+(?!(?:hours?|days?|weeks?|months?|years?)\b)\w+|\b(?:count|number|total)\s+(?:of\s+)?(?:[\w-]+\s+){0,3}episodes?\b/i.test(quantityWording);
  if (p.operation === "count" && p.readOperation === "count" && p.ordinal === null
    && durationQuantity && !competingCount
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { operation: "recall", readOperation: "recall", episodeTopic: null });
  }
  const interval = requestedCalendarInterval(context.currentMessage, new Date().getUTCFullYear());
  if (interval && reads.has(String(p.operation)) && reads.has(String(p.readOperation))
    && p.ordinal === null && !competingCount && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion
    && [p.from, p.to].every(bound => bound === null || typeof bound === "string" && /^\d{4}-\d{2}-\d{2}$/.test(bound) && Number.isFinite(Date.parse(bound)) && new Date(bound).toISOString().slice(0,10) === bound)
    && Array.isArray(p.terms) && p.terms.length <= 6
    && p.terms.every(term => typeof term === "string" && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term) && term.length <= 32)) {
    Object.assign(p, { operation: "recall", readOperation: "recall", episodeTopic: null,
      selection: "period", from: interval.from, to: interval.to, terms: [] });
  }
  const sourceDays = explicitHistoryDays(context.currentMessage, new Date().getUTCFullYear());
  if (p.operation === "recall" && p.readOperation === "recall" && p.ordinal === null
    && sourceDays.length === 1 && /\b(?:note|entry|report)\b/i.test(context.currentMessage)
    && !/\b(?:before|after|until|since|between|from|through|onward)\b/i.test(context.currentMessage)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    const day = sourceDays[0]; const after = new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10);
    if ([null, day].includes(p.from as string | null) && [null, day, after].includes(p.to as string | null))
      Object.assign(p, { from: day, to: after, selection: "reference" });
  }
  // A specifically dated source is located by its day. Requiring a lexical
  // synonym as well can hide that very note (e.g. accidents versus urinated).
  // Keep date, ownership and source-version validation unchanged.
  if (p.operation === "recall" && p.readOperation === "recall" && p.selection === "reference"
    && typeof p.from === "string" && typeof p.to === "string"
    && Date.parse(p.to) - Date.parse(p.from) === 86400000 && p.ordinal === null
    && /\b(?:note|entry|report)\b/i.test(context.currentMessage)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion
    && Array.isArray(p.terms) && p.terms.length <= 6
    && p.terms.every(term => typeof term === "string" && term.length >= 3 && term.length <= 32
      && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term))) p.terms = [];
  if (!analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) normalizeExplicitHistoryDates(p, context.currentMessage);
  // Complete only explicitly open-ended ranges. The strict validator still
  // rejects invalid dates, reversed ranges and missing bounds on closed ranges.
  if (p.operation !== "update") {
    if (p.from !== null && p.to === null && /\b(?:since|onward|onwards|from .+ on)\b/i.test(context.currentMessage)) p.to = "2100-01-01";
    if (p.from === null && p.to !== null && /\b(?:before|prior to|until)\b/i.test(context.currentMessage)) p.from = "1900-01-01";
  }
  const owned = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId);
  const named = explicitlyNamedOwnedPets(context.currentMessage, owned);
  const timelineDays = requestedHistoryTimelineDays(context.currentMessage, new Date().getUTCFullYear());
  const validReadMetadata = p.ordinal === null && Array.isArray(p.terms) && p.terms.length <= 6
    && p.terms.every(term => typeof term === "string" && term.length >= 3 && term.length <= 32 && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term))
    && [p.from,p.to].every(day => day === null || typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)
      && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0,10) === day);
  if (timelineDays && named.length === 1 && reads.has(String(p.operation)) && reads.has(String(p.readOperation))
    && validReadMetadata && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p,{operation:"recall",readOperation:"recall",selection:"period",terms:[],topic:"dated timeline",
      from:timelineDays[0],to:new Date(Date.parse(timelineDays.at(-1)!) + 86400000).toISOString().slice(0,10)});
  }
  const causalReference = causalChangeReference(context);
  if (causalReference && validReadMetadata && [...reads,"clarify"].includes(String(p.operation))
    && (p.readOperation === null || [...reads,"clarify"].includes(String(p.readOperation)))) {
    Object.assign(p,{operation:"recall",readOperation:"recall",subject:"explicit",petNames:[causalReference.petName],
      selection:"period",topic:"recorded changes and causal uncertainty",terms:[],from:causalReference.from,to:causalReference.to,
      episodeTopic:null,frame:emptyProposedSemanticFrame()});
  }
  if (owned.length > 0 && owned.length <= 3 && !named.length && p.ordinal === null
    && Array.isArray(p.petNames) && p.petNames.length <= 3 && p.petNames.every(name => owned.some(pet => pet.name === name))
    && /\bwhich (?:of my )?pets?\b/i.test(context.currentMessage)
    && /\b(?:notes?|records?|recorded|history)\b/i.test(context.currentMessage)
    && !/\b(?:friend|sister|brother|neighbor|neighbour|someone else)\b/i.test(context.currentMessage)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion
    && [...reads, "clarify", "update"].includes(String(p.operation))) {
    Object.assign(p, { operation: "comparison", readOperation: "comparison", subject: "explicit",
      petNames: owned.map(pet => pet.name), selection: "summary", episodeTopic: null, frame: emptyProposedSemanticFrame() });
  }
  if (reads.has(String(p.operation)) && reads.has(String(p.readOperation)) && p.ordinal === null
    && /\bweights?\b/i.test(context.currentMessage) && /\bbullet(?:s| points?)?\b/i.test(context.currentMessage)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion)
    Object.assign(p, { operation: "comparison", readOperation: "comparison", selection: "summary" });
  // Which animal a saved correction describes is the fact to retrieve.
  // Search the bounded owned account; quoted external names grant no new owner.
  if (owned.length > 0 && owned.length <= 3
    && (/\b(?:which|whose) (?:pet|dog|cat|animal)\b/i.test(context.currentMessage)
      || named.length === 1 && validReadMetadata && /^What does\b[^?!.]{0,180}\bcorrection say about\b[^?!.]+[?!.]*$/i.test(context.currentMessage.trim()))
    && /\b(?:correction|corrected (?:note|report)|retraction)\b/i.test(context.currentMessage)
    && ["general", "clarify", "recall", "overview", "comparison", "status", "update"].includes(String(p.operation))
    && (p.readOperation === null || ["general", "clarify", "recall", "overview", "comparison", "status"].includes(String(p.readOperation)))
    && p.ordinal === null
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion
    && Array.isArray(p.petNames) && p.petNames.length <= 3 && p.petNames.every(name => typeof name === "string" && name.length <= 100)) {
    Object.assign(p, { operation: "recall", readOperation: "recall", subject: "explicit",
      petNames: (named.length ? named : owned).map(pet => pet.name), selection: "summary", topic: "recorded correction", from: null, to: null,
      terms: ["correct", "retract"], episodeTopic: null, frame: emptyProposedSemanticFrame() });
  }
  if (p.operation !== "update" && Array.isArray(p.petNames) && p.petNames.length > 3 && named.length > 0 && named.length <= 3
    && p.petNames.every(name => owned.some(pet => pet.name === name))) p.petNames = named.map(pet => pet.name);
  if (p.operation === "update" && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    p.operation = reads.has(String(p.readOperation)) ? p.readOperation : "recall";
    p.readOperation = p.operation;
    p.frame = emptyProposedSemanticFrame();
  }
  // General suitability comparisons need no saved history. Do not convert a
  // general read into historical lookup solely from the comparison verb.
  if (p.subject === "non_pet" && Array.isArray(p.petNames) && !p.petNames.length
    && p.readOperation === "general" && p.operation === "comparison"
    && !/\b(?:recorded|saved|history|notes|earliest|latest)\b/i.test(context.currentMessage)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { operation: "general", terms: [], from: null, to: null, episodeTopic: null, ordinal: null });
  }
  if (reads.has(String(p.operation)) && reads.has(String(p.readOperation)) && p.operation !== "general") p.readOperation = p.operation;
  if (reads.has(String(p.operation)) && p.readOperation === "clarify" && named.length === 1 && p.ordinal === null) p.readOperation = p.operation;
  if (p.subject === "non_pet" && !named.length && Array.isArray(p.petNames) && !p.petNames.length
    && ["general", "clarify", "update"].includes(String(initialOperation))) {
    Object.assign(p, { operation: "general", readOperation: "general", selection: "summary", terms: [], from: null, to: null, ordinal: null, episodeTopic: null, frame: emptyProposedSemanticFrame() });
  }
  // User-established reference scope applies to confident read plans too:
  // a generic pet-name answer must not bypass medication evidence retrieval.
  // Never reinterpret a proposed write, count, or displayed episode reference.
  const referenceReads = new Set(["clarify", "general", "recall", "status", "overview"]);
  const original = value as Record<string, unknown>;
  const referenceMetadata = original.from === null && original.to === null
    && original.ordinal === null && original.episodeTopic === null
    && Array.isArray(original.terms) && original.terms.length <= 6
    && original.terms.every(term => typeof term === "string" && term.length >= 3
      && term.length <= 32 && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term));
  const medicationPet = referenceMetadata && referenceReads.has(String(initialOperation))
    && referenceReads.has(String(p.operation)) && referenceReads.has(String(p.readOperation))
    && p.from === null && p.to === null && p.ordinal === null && p.episodeTopic === null
    && Array.isArray(p.terms) && p.terms.length <= 6
    && p.terms.every(term => typeof term === "string" && term.length >= 3 && term.length <= 32 && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term))
    ? medicationReferencePet(context) : null;
  if (medicationPet && Array.isArray(p.petNames) && p.petNames.length <= 1
    && p.petNames.every(name => name === medicationPet.name)
    && ["unclear", "conversation", "selected", "explicit", "non_pet"].includes(String(p.subject))) {
    Object.assign(p, { operation: "recall", readOperation: "recall", subject: "conversation",
      petNames: [medicationPet.name], topic: "medication details", terms: ["medic", "prescri", "course"], selection: "summary" });
  }
  return p;
}

/** Failed planning can still yield conversation, with zero saved-data authority.
 * An empty frame/read-only scope prevents a recovery path from granting writes. */
export function unavailableAskReadPlan(reason: string): AskInterpretation {
  return { version: "ask-interpretation.v1", operation: "general", readOperation: "general", selection: "summary",
    conversationOnly: true, planningRecovery: reason, petIds: [], topic: "general conversation", history: null,
    episodeTopic: null, ordinal: null, readOnly: true, clarification: null, frame: emptyProposedSemanticFrame() };
}

/** Prior user wording is a question reference, never medical or write evidence. */
export function datedNoteReformulation(context: Context): { question: string; day: string; after: string; petId: string } | null {
  if (!/^(?:(?:can|could|would) you |please )?(?:(?:explain|rephrase|shorten|summarize) (?:that|the) (?:last |previous )?(?:answer|response)(?: (?:more briefly|in fewer words|more simply|briefly|again))?|(?:say|explain|put) that (?:more simply|more briefly|in simpler words))[?.!]*$/i.test(context.currentMessage.trim())
    || analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) return null;
  const prior = context.conversationTurns.filter(turn => turn.role === "user" && turn.text.trim() !== context.currentMessage.trim()).at(-1)?.text;
  if (!prior || analyzeOwnerAssertions(prior).hasOwnerAssertion || !/\b(?:note|entry|report)\b/i.test(prior)
    || !/\?|^(?:how|what|which|when|show|quote)\b/i.test(prior)) return null;
  const days = explicitHistoryDays(prior, new Date().getUTCFullYear());
  const named = explicitlyNamedOwnedPets(prior, context.eligiblePets.filter(pet => pet.user_id === context.owner.userId));
  if (days.length !== 1 || named.length !== 1) return null;
  return { question: prior, day: days[0], after: new Date(Date.parse(days[0]) + 86400000).toISOString().slice(0, 10), petId: named[0].id };
}

/** A narrow causal follow-up inherits only the last user's dated change question. */
export function causalChangeReference(context: Context): {petName: string; from: string; to: string} | null {
 if(!/^Does that tell us which change caused the improvement[?.!]*$/i.test(context.currentMessage.trim()))return null;
 const prior=context.conversationTurns.filter(t=>t.role==='user' && t.text.trim()!==context.currentMessage.trim()).at(-1)?.text;
 if(!prior || analyzeOwnerAssertions(prior).hasOwnerAssertion || !/\bchanged?\b/i.test(prior) || !/\brecommend\b/i.test(prior))return null;
 const owned=context.eligiblePets.filter(p=>p.user_id===context.owner.userId);
 const named=explicitlyNamedOwnedPets(prior,owned);
 const days=explicitHistoryDays(prior,new Date().getUTCFullYear()).sort();
 if(named.length!==1 || !days.length)return null;
 const allowed=new Set(("what did s vet recommend and was changed on "+named[0].name.toLowerCase()).split(/\s+/));
 const wording=prior.replace(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?\b/gi,'');
 if((wording.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).some(word=>!allowed.has(word)))return null;
 return {petName:named[0].name,from:days[0],to:new Date(Date.parse(days.at(-1)!)+86400000).toISOString().slice(0,10)};
}
