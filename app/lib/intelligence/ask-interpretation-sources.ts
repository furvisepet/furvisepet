import { getAiFeaturePolicy } from "../ai/usage-guard/features.ts";
import { estimateInputTokens } from "../ai/usage-guard/cost-estimator.ts";
import { AiAdmissionError } from "../ai/usage-guard/errors.ts";
import { explicitlyNamedOwnedPets } from "./entities/resolve-turn-subject.ts";
import type { FurviseLiveContext, IntelligenceConversationTurn } from "./types.ts";

/** Untrusted dialogue for referents only; never a USER grounding source. */
export type AskReferenceDialogue = Array<{ afterUserSourceId: string; text: string }>;
export type AskSourceWindow = {
  retainedPriorUserTurnIds: string[];
  pinnedSourceIds: string[];
  omittedPriorUserTurns: number;
  disclosure: string | null;
};
type SourceContext = Pick<FurviseLiveContext, "owner" | "pet" | "eligiblePets" | "currentMessage"
  | "currentTurn" | "conversationTurns" | "ownerNoteSpans" | "pinnedUserSourceIds" | "planningSourceWindow" | "planningReferenceDialogue">;
export const ASK_MAX_PRIOR_USER_TURNS = 8;
type ReferenceContext = SourceContext & { conversationId?: string | null };
const issuedReferenceContexts = new WeakMap<object, string>();
const referenceStamp = (c: ReferenceContext) => JSON.stringify([c.owner.userId,c.conversationId,c.currentTurn,
  c.conversationTurns,c.planningReferenceDialogue]);
/** Request-local provenance for referents only, never source-content authority. */
export function retainAskReferenceContext<T extends ReferenceContext>(source: ReferenceContext,target: T): T {
  const stamp=issuedReferenceContexts.get(source);
  if(stamp!==undefined&&stamp!==referenceStamp(source))invalid("source_identity");
  const current=(c:ReferenceContext)=>c.currentTurn?[c.currentTurn.id,c.currentTurn.role,c.currentTurn.text,c.currentTurn.createdAt]:null;
  if(source.owner.userId!==target.owner.userId||(source.conversationId??null)!==(target.conversationId??null)
    ||JSON.stringify(current(source))!==JSON.stringify(current(target)))invalid("source_identity");
  for(const turn of target.conversationTurns){
    const prior=source.conversationTurns.find(t=>t.id===turn.id);
    if(prior&&JSON.stringify([prior.role,prior.text,prior.createdAt])!==JSON.stringify([turn.role,turn.text,turn.createdAt]))invalid("source_identity");
  }
  const dialogue=stamp===undefined?askReferenceDialogue(source.conversationTurns):source.planningReferenceDialogue||[];
  const ids=new Set(target.conversationTurns.filter(t=>t.role==="user").map(t=>t.id));
  const expected=dialogue.filter(t=>ids.has(t.afterUserSourceId));
  if(JSON.stringify(target.planningReferenceDialogue||[])!==JSON.stringify(expected))invalid("source_identity");
  issuedReferenceContexts.set(target,referenceStamp(target));return target;
}
export function askCitedSourceReferences(context: ReferenceContext) {
  if(issuedReferenceContexts.get(context)!==referenceStamp(context))return [];
  const users=new Set(context.conversationTurns.filter(t=>t.role==="user"&&t.id!==context.currentTurn?.id).map(t=>t.id));
  const refs=new Map<string,{sourceTurnId:string;sourceId:string}>();
  for(const turn of context.planningReferenceDialogue||[]){
    if(!users.has(turn.afterUserSourceId))continue;
    for(const match of turn.text.matchAll(/\[(care:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi)){
      const ref={sourceTurnId:turn.afterUserSourceId,sourceId:match[1].toLowerCase()};
      refs.set(JSON.stringify(ref),ref);
      if(refs.size>64)invalid("source_reference_budget");
    }
  }
  return [...refs.values()];
}

const invalid = (reason: string, field?: "scope" | "petNames" | "referenceTurnIds"): never => {
  if (field) throw new Error("ASK_REQUEST_INVALID:" + reason, { cause: { field } });
  throw new Error("ASK_REQUEST_INVALID:" + reason);
};

/** Locator hints from exact retained USER text only. These grant no fact/write authority. */
export function askSubjectUserReferences(context: ReferenceContext) {
  if (issuedReferenceContexts.get(context) !== referenceStamp(context)) return [];
  const owned = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId);
  return context.conversationTurns.filter(turn => turn.role === "user" && turn.id !== context.currentTurn?.id)
    .map(turn => ({ sourceTurnId: turn.id, petNames: explicitlyNamedOwnedPets(turn.text, owned).map(pet => pet.name) }))
    .filter(ref => ref.petNames.length);
}


/** Derive only from server-loaded chronological dialogue, never a caller's hydrated planning field. */
export function askReferenceDialogue(turns: IntelligenceConversationTurn[]): AskReferenceDialogue {
  const seen = new Map<string, IntelligenceConversationTurn>();
  const dialogue: AskReferenceDialogue = [];
  let afterUserSourceId: string | null = null;
  for (const turn of turns) {
    if (turn.recoveredReceiptReference) continue;
    const prior = seen.get(turn.id);
    if (prior) {
      if (prior.role !== turn.role || prior.text !== turn.text || prior.createdAt !== turn.createdAt)
        invalid("source_identity");
      continue;
    }
    seen.set(turn.id, turn);
    if (turn.role === "user") afterUserSourceId = turn.id;
    else if (turn.role === "furvise" && afterUserSourceId)
      dialogue.push({ afterUserSourceId, text: turn.text });
  }
  return dialogue;
}

/** The ordinary admission policy is authoritative; measure the FINAL JSON request. */
export function askRequestFitsInputBudget(request: Record<string, unknown>): boolean {
  const policy = getAiFeaturePolicy("ask");
  return JSON.stringify(request).length <= policy.maxInputCharacters
    && estimateInputTokens(request) <= policy.maxInputTokens;
}
export function assertAskRequestInputBudget(request: Record<string, unknown>): void {
  if (!askRequestFitsInputBudget(request))
    throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "feature_token_budget_exceeded");
}

/** Identity deduplication never merges different turns or edits their UTF-16 text. */
export function* askSourceWindows<C extends SourceContext>(context: C): Generator<C> {
  const sources = new Map<string, IntelligenceConversationTurn>();
  for (const turn of [...context.conversationTurns, ...(context.currentTurn ? [context.currentTurn] : [])]) {
    if (turn.role !== "user" || turn.recoveredReceiptReference) continue;
    const prior = sources.get(turn.id);
    if (prior && (prior.text !== turn.text || prior.createdAt !== turn.createdAt)) invalid("source_identity");
    sources.set(turn.id, { id: turn.id, role: "user", text: turn.text, createdAt: turn.createdAt });
  }
  const current = context.currentTurn ? sources.get(context.currentTurn.id) : undefined;
  if (context.currentTurn && (!current || current.text !== context.currentMessage)) invalid("source_identity");
  const prior = [...sources.values()].filter(turn => turn.id !== current?.id);
  const pinned = new Set(context.pinnedUserSourceIds || []);
  for (const span of context.ownerNoteSpans || []) pinned.add(span.sourceMessageId);
  for (const id of pinned) if (!sources.has(id)) invalid("source_pin_missing");
  const pinnedPrior = prior.filter(turn => pinned.has(turn.id));
  if (pinnedPrior.length > ASK_MAX_PRIOR_USER_TURNS) {
    throw new AiAdmissionError("AI_PROVIDER_BUDGET_EXHAUSTED", "feature_token_budget_exceeded");
  }
  const optional = prior.filter(turn => !pinned.has(turn.id));
  const count = Math.min(optional.length, ASK_MAX_PRIOR_USER_TURNS - pinnedPrior.length);
  for (let keep = 0; keep <= count; keep++) {
    const ids = new Set([...pinnedPrior, ...(keep ? optional.slice(-keep) : [])].map(turn => turn.id));
    const retained = prior.filter(turn => ids.has(turn.id));
    const omitted = prior.length - retained.length;
    const window: AskSourceWindow = {
      retainedPriorUserTurnIds: retained.map(turn => turn.id),
      pinnedSourceIds: [...pinned],
      omittedPriorUserTurns: omitted,
      disclosure: omitted ? `${omitted} earlier user turn(s) were omitted to fit the request. Their contents and references are unavailable; ask for the needed text again instead of guessing.` : null,
    };
    yield retainAskReferenceContext(context, { ...context, currentTurn: current,
      conversationTurns: retained,
      planningReferenceDialogue: (context.planningReferenceDialogue || []).filter(turn => ids.has(turn.afterUserSourceId)),
      planningSourceWindow: window });
  }
}

export function askUserSourceInput(context: SourceContext) {
  const current = context.currentTurn;
  const sources = [...context.conversationTurns, ...(current ? [current] : [])];
  const userSources: Array<{ id: string | null; text: string; createdAt?: string }> = sources.map(turn => ({
    id: turn.id, text: turn.text, ...(turn.createdAt ? { createdAt: turn.createdAt } : {}),
  }));
  if (!current) userSources.push({ id: null, text: context.currentMessage });
  const sourceSpans = (context.ownerNoteSpans || []).map(span => {
    const source = sources.find(turn => turn.id === span.sourceMessageId);
    if (!source || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end)
      || span.start < 0 || span.end <= span.start || span.end > source.text.length || source.text.slice(span.start, span.end) !== span.text)
      return invalid("source_span");
    return { id: span.id, sourceMessageId: span.sourceMessageId, start: span.start, end: span.end, role: span.role };
  });
  return { currentSourceId: current?.id ?? null, userSources, sourceSpans,
    sourceWindow: context.planningSourceWindow,
    ...((context.planningReferenceDialogue || []).length ? { referenceDialogue: context.planningReferenceDialogue } : {}),
    ...(askCitedSourceReferences(context).length ? { citedSourceReferences: askCitedSourceReferences(context) } : {}),
    ...(askSubjectUserReferences(context).length ? { subjectUserReferences: askSubjectUserReferences(context) } : {}) };
}

export const ASK_USER_SOURCE_INSTRUCTIONS = "Exact complete chronological USER turns; currentSourceId=current only. Ground evidenceNeeds/readTicket.probes in current USER (sourceTurnId null) or supplied prior USER also in referenceTurnIds, never current/assistant/unknown IDs. Keep catalog/task/attachment/saved-reference checks. sourceSpans=UTF-16 exact unnormalized USER quotes. Only supplied USER text/IDs authorize premises/actions. Disclose sourceWindow omissions; clarify missing antecedents, never guess text/selected pet. With omittedPriorUserTurns>0, selected scope requires the selected pet explicitly named in CURRENT USER. named/conversation scope requires every pet named in CURRENT USER or declared retained USER references. subjectUserReferences lists exact prior USER subject-name locators, not facts or a chosen subject. A citation-linked USER may name no pet: declare BOTH its citedSourceReferences.sourceTurnId and each chosen subjectUserReferences.sourceTurnId in referenceTurnIds when needed. Never fill or infer an absent subject declaration. UI selection and assistant citations cannot restore omitted subject authority; clarify if unresolved. referenceDialogue=exact assistant referents linked to retained USER, never USER grounding. It proves no facts, saved presence, ownership, receipts or writes. Re-read authorized fresh sources. citedSourceReferences=prior USER-linked identities only: choose exact source_ref pairs and include each pair.sourceTurnId in referenceTurnIds. This is its linked prior USER ID, never an assistant reply ID. Do not mix IDs from different pairs. AND every independently requested literal text_any. Display labels/reference words alone add no body filter. Missing/ambiguous identity: clarify. Citations grant no authority.";

/** Extra source-window precondition; the existing strict decoder and Binder still run. */
export function assertAskSourceWindowProposal(value: unknown, context: SourceContext): void {
  if (!context.planningSourceWindow || !value || typeof value !== "object") return;
  const allowed = new Set(context.conversationTurns.map(turn => turn.id));
  if (context.currentTurn) allowed.add(context.currentTurn.id);
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (["sourceTurnId", "sourceMessageId", "turnId"].includes(key) && child != null
        && (typeof child !== "string" || !allowed.has(child))) invalid("reference");
      if (key === "referenceTurnIds" && Array.isArray(child) && child.some(id => !allowed.has(id))) invalid("reference");
      if (child && typeof child === "object") visit(child);
    }
  };
  visit(value);
  if (!context.planningSourceWindow.omittedPriorUserTurns) return;
  const outer = value as Record<string, unknown>;
  const p = (outer.version === "ask-catalog-intent.v1" ? outer.request : outer) as Record<string, unknown>;
  if (!p || ["clarify", "conversation"].includes(String(p.mode))) return;
  const owned = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId);
  const currentPets = explicitlyNamedOwnedPets(context.currentMessage, owned);
  // Selection is UI state, not evidence for an antecedent that was dropped.
  if (p.scope === "selected" && !currentPets.some(pet => pet.id === context.pet.id))
    invalid("omitted_subject_reference", "scope");
  if (["named", "conversation"].includes(String(p.scope))) {
    const refs = Array.isArray(p.referenceTurnIds) ? p.referenceTurnIds : [];
    const named = new Set([...currentPets, ...context.conversationTurns
      .filter(turn => turn.id !== context.currentTurn?.id && refs.includes(turn.id))
      .flatMap(turn => explicitlyNamedOwnedPets(turn.text, owned))].map(pet => pet.name));
    if (Array.isArray(p.petNames) && p.petNames.some(name => !named.has(name as string)))
      invalid("omitted_subject_reference", "petNames");
    if (p.scope === "conversation" && !refs.length && !currentPets.length)
      invalid("omitted_subject_reference", "referenceTurnIds");
  }
  if (Array.isArray(outer.subjects) && outer.subjects.some(subject => subject?.basis === "selected"
    && !currentPets.some(pet => pet.name === subject.petName))) invalid("omitted_subject_reference", "scope");
}
