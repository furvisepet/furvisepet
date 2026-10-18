import { getAiFeaturePolicy } from "../ai/usage-guard/features.ts";
import { estimateInputTokens } from "../ai/usage-guard/cost-estimator.ts";
import { AiAdmissionError } from "../ai/usage-guard/errors.ts";
import { explicitlyNamedOwnedPets } from "./entities/resolve-turn-subject.ts";
import type { FurviseLiveContext, IntelligenceConversationTurn } from "./types.ts";

export type AskSourceWindow = {
  retainedPriorUserTurnIds: string[];
  pinnedSourceIds: string[];
  omittedPriorUserTurns: number;
  disclosure: string | null;
};
type SourceContext = Pick<FurviseLiveContext, "owner" | "pet" | "eligiblePets" | "currentMessage"
  | "currentTurn" | "conversationTurns" | "ownerNoteSpans" | "pinnedUserSourceIds" | "planningSourceWindow">;
export const ASK_MAX_PRIOR_USER_TURNS = 8;
const invalid = (reason: string): never => { throw new Error("ASK_REQUEST_INVALID:" + reason); };

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
    yield { ...context, currentTurn: current,
      conversationTurns: retained,
      planningSourceWindow: window };
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
    sourceWindow: context.planningSourceWindow };
}

export const ASK_USER_SOURCE_INSTRUCTIONS = "USER source contract: userSources contains exact complete USER turns once each, in chronological order. currentSourceId identifies the full current request (the legacy currentMessage/currentTurn), not a prior turn. For evidenceNeeds and readTicket.probes, sourceTurnId null means exact current USER text even when currentSourceId is non-null and the current message is persisted; a non-null sourceTurnId must identify an exact supplied PRIOR USER turn also listed in referenceTurnIds. Never use the current message ID, assistant text or an unknown ID in these grounding fields. This rule does not replace domain-specific catalog/task authorization IDs or supplied attachment, sourceSpan and saved-record references; preserve their typed contracts and server checks. Prior entries replace recentDialogueForReferencesOnly, recentUserMessages, olderUserReferenceCandidates and ownerNoteSources. sourceSpans are UTF-16 start/end offsets into their sourceMessageId; derive quotes from the exact text without normalization. sourceWindow discloses omissions. Only supplied IDs and text exist for this request. Do not infer omitted antecedents or substitute the selected pet. If a needed reference is unavailable, clarify and disclose that earlier text was omitted.";

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
    invalid("omitted_subject_reference");
  if (["named", "conversation"].includes(String(p.scope))) {
    const refs = Array.isArray(p.referenceTurnIds) ? p.referenceTurnIds : [];
    const named = new Set([...currentPets, ...context.conversationTurns
      .filter(turn => turn.id !== context.currentTurn?.id && refs.includes(turn.id))
      .flatMap(turn => explicitlyNamedOwnedPets(turn.text, owned))].map(pet => pet.name));
    if (Array.isArray(p.petNames) && p.petNames.some(name => !named.has(name as string)))
      invalid("omitted_subject_reference");
    if (p.scope === "conversation" && !refs.length && !currentPets.length)
      invalid("omitted_subject_reference");
  }
  if (Array.isArray(outer.subjects) && outer.subjects.some(subject => subject?.basis === "selected"
    && !currentPets.some(pet => pet.name === subject.petName))) invalid("omitted_subject_reference");
}
