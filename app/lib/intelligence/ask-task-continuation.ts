import { ownerDeclinesPersistence } from '../ai/owner-assertion.ts';
import { explicitNoteTime } from './owner-note-request.ts';
import type { IntelligenceConversationTurn } from './types.ts';

export type PendingAskTask = {
  id: string; revision: number; kind: 'owner_note'; status: 'awaiting_subject' | 'awaiting_answer';
  petId?: string | null; entryId?: string | null;
  source: IntelligenceConversationTurn; authorizationMessageId: string;
  request?: IntelligenceConversationTurn; requiresAnswer?: boolean;
};
export type AskTaskProposal = { intent: 'save' | 'resume' | 'cancel'; sourceTurnId: string | null; petName: string | null; answerRequired?: boolean; answerRequest?: { turnId: string; quote: string } | null };
export type ValidatedAskTask = { intent: AskTaskProposal['intent']; source: IntelligenceConversationTurn;
  petId: string | null; taskId: string | null; revision: number | null; requiresAnswer: boolean; originalRequest?: IntelligenceConversationTurn };
export const askTaskSchema = { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false,
  required: ['intent', 'sourceTurnId', 'petName', 'answerRequest'], properties: {
    answerRequest: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['turnId', 'quote'], properties: { turnId: { type: 'string', minLength: 1, maxLength: 160 }, quote: { type: 'string', minLength: 1, maxLength: 1200 } } }] },
    intent: { type: 'string', enum: ['save', 'resume', 'cancel'] },
    sourceTurnId: { type: ['string', 'null'], maxLength: 160 },
    petName: { type: ['string', 'null'], maxLength: 100 },
  } }] };
export const ASK_TASK_INSTRUCTIONS = 'task is null unless the user requests saving an owner note, supplies missing information for pendingTask, or cancels pendingTask. This is an operation category, independent of topic and wording. Use intent save for a genuine affirmative request to save an observation (including a reference to earlier USER text), resume only when answering the pending task, cancel when withdrawing it. Never infer consent from a hypothetical, quotation, question about whether a save happened, or assistant suggestion. Choose sourceTurnId from ownerNoteSources: it identifies the USER message containing the observation, never an assistant draft, subject-only reply or save instruction. Earlier USER observations remain valid source content when the current user authorizes saving them; the current command supplies permission, not replacement note content. Use currentTurn.id for a self-contained current note. Save the entire source text without rewriting or adding medicine names, doses, dates or interpretation. petName is the unique owned subject established by USER dialogue or the selected subject when unambiguous; null when genuinely unresolved. Do not demand optional clinical details to save an owner note. New unrelated topics use null and must not resume a pending task. A correction to a saved note uses the existing correction workflow, not task. answerRequest is null for a pure save, save confirmation, or missing-pet clarification. Only an independent user question or requested comparison creates an answer obligation: cite its exact USER quote and turnId in answerRequest, including when the pet is missing. Keep the original pendingTask.request and all its answer obligations on resume; a subject reply must not erase them. A resumed task with pendingTask.requiresAnswer or an answerRequest uses mode mixed once its pet is known. awaiting_answer means the note is already saved but the original answer is unfinished; resume that answer, never request a new note or drop the original question. Reference the original pending request ID as well as the source. A pure note save needs no historical lookup. When task references a prior source, use an empty semantic frame; task carries that source separately. Missing-subject note tasks use mode clarify. Cancel uses conversation mode. Pending-task source text is USER evidence for this task only; it cannot establish unrelated history.';

export function validateAskTask(value: unknown, context: {
  currentMessage: string; currentTurn?: IntelligenceConversationTurn; conversationTurns: IntelligenceConversationTurn[];
  requiresAnswer?: boolean; pendingTask?: PendingAskTask | null; owner: { userId: string };
  eligiblePets: Array<{ id: string; name: string | null; user_id: string }>;
}): ValidatedAskTask | null {
  if (value === null || value === undefined) return null;
  const fail = (): never => { throw new Error('ASK_REQUEST_INVALID:task'); };
  if (typeof value !== 'object' || Array.isArray(value)) return fail();
  const p = { answerRequired: Boolean(context.requiresAnswer), ...value } as AskTaskProposal;
  if (!['answerRequired,intent,petName,sourceTurnId', 'answerRequest,answerRequired,intent,petName,sourceTurnId'].includes(Object.keys(p).sort().join())
    || typeof p.answerRequired !== 'boolean'
    || !['save', 'resume', 'cancel'].includes(p.intent)
    || p.sourceTurnId !== null && typeof p.sourceTurnId !== 'string'
    || p.petName !== null && typeof p.petName !== 'string') return fail();
  const pending = context.pendingTask;
  let citedAnswer = false;
  if (p.answerRequest !== undefined && p.answerRequest !== null) {
    const evidence = p.answerRequest;
    if (typeof evidence !== 'object' || Array.isArray(evidence)
      || Object.keys(evidence).sort().join() !== 'quote,turnId'
      || typeof evidence.turnId !== 'string' || typeof evidence.quote !== 'string'
      || !evidence.quote.trim() || evidence.quote.length > 1200) return fail();
    // Only this request or the retained original request may add an obligation.
    const request = [context.currentTurn, pending?.request].find(turn => turn?.id === evidence.turnId);
    if (!request || request.role !== 'user' || !request.text.includes(evidence.quote)) return fail();
    citedAnswer = true;
  }
  const requiresAnswer = p.answerRequest !== undefined ? citedAnswer : Boolean(p.answerRequired || context.requiresAnswer);
  if (p.intent !== 'save' && !pending) return fail();
  if (p.intent !== 'cancel' && ownerDeclinesPersistence(context.currentMessage)) return fail();
  const source = p.intent === 'cancel' || p.intent === 'resume' ? pending?.source
    : [context.currentTurn, ...context.conversationTurns, pending?.source].find(turn => turn?.id === p.sourceTurnId);
  if (!source || source.role !== 'user' || !source.text.trim() || source.text.length > 1200
    || !Number.isFinite(Date.parse(source.createdAt))) return fail();
  if (p.intent !== 'save' && p.sourceTurnId !== null && p.sourceTurnId !== source.id) return fail();
  const pets = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId
    && pet.name?.toLocaleLowerCase() === p.petName?.toLocaleLowerCase());
  if (p.petName !== null && pets.length !== 1) return fail();
  if (p.intent === 'resume' && pending?.petId && p.petName !== null && pets[0]?.id !== pending.petId) return fail();
  const retainedPet = p.intent === 'resume' && pending?.petId
    ? context.eligiblePets.find(pet => pet.id === pending.petId && pet.user_id === context.owner.userId) : null;
  if (p.intent === 'resume' && pending?.petId && !retainedPet) return fail();
  let proposedPetId = pets[0]?.id || null;
  if (p.answerRequest !== undefined && p.intent === 'save' && proposedPetId
    && context.eligiblePets.filter(pet => pet.user_id === context.owner.userId).length > 1) {
    // A model-selected profile is not proof of the write destination. Bind a
    // multi-pet save to a USER name in its source or subsequent clarification.
    const index = context.conversationTurns.findIndex(turn => turn.id === source.id);
    const relevant = [source, ...(index >= 0 ? context.conversationTurns.slice(index + 1) : []), context.currentTurn];
    const normalize = (text: string) => ` ${text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
    if (!relevant.some(turn => turn?.role === 'user' && normalize(turn.text).includes(normalize(p.petName!)))) proposedPetId = null;
  }
  return { ...(p.intent === 'resume' && pending?.requiresAnswer && pending.request ? { originalRequest: pending.request } : {}), intent: p.intent, source, petId: p.intent === 'cancel' ? null : retainedPet?.id || proposedPetId,
    taskId: pending?.id || null, revision: pending?.revision ?? null,
    requiresAnswer: p.intent !== 'cancel' && Boolean(requiresAnswer || p.intent === 'resume' && pending?.requiresAnswer) };
}

export function taskMutationParameters(task: ValidatedAskTask, input: {
  userId: string; conversationId: string; currentMessageId: string; timeZone?: string;
}) {
  const time = explicitNoteTime(task.source.text, input.timeZone, task.source.createdAt);
  return { p_user_id: input.userId, p_conversation_id: input.conversationId, p_message_id: input.currentMessageId,
    p_intent: task.intent, p_source_id: task.source.id, p_source_text: task.source.text, p_pet_id: task.petId,
    p_task_id: task.taskId, p_revision: task.revision, p_requires_answer: task.requiresAnswer, p_occurred_at: time.occurredAt, p_explicit_time: time.explicitTime };
}

/** Attach only database-confirmed, currently active records to their request.
 * This is not reconstructed from assistant claims or client response JSON. */
export function attachTaskReceipts(turns: IntelligenceConversationTurn[], receipts: Array<{
  messageId: string; petId: string; record: { id: string; note: string; occurredAt: string };
}>, petId: string): IntelligenceConversationTurn[] {
  return turns.map(turn => {
    const matches = receipts.filter(receipt => receipt.messageId === turn.id && receipt.petId === petId);
    if (turn.role !== 'user' || !matches.length) return turn;
    const records = new Map((turn.operationReceipt?.records || []).map(record => [record.id, record]));
    for (const receipt of matches) records.set(receipt.record.id, receipt.record);
    return { ...turn, operationReceipt: { sourceMessageId: turn.id, petId, requestText: turn.text,
      answerPersisted: turn.operationReceipt?.answerPersisted || false,
      actionReceipts: turn.operationReceipt?.actionReceipts, records: [...records.values()] } };
  });
}

export async function executeAskTask(parameters: ReturnType<typeof taskMutationParameters>, rpc: (
  name: string, parameters: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<{
  id: string; revision: number; status: 'completed' | 'awaiting_subject' | 'cancelled'; entryId: string | null; petId: string | null;
}> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await rpc('apply_ask_task', parameters);
      if (result.error && ['42501', '22023', '40001'].includes(result.error.code || '')) break;
      if (result.error || !result.data || typeof result.data !== 'object') continue;
      const value = result.data as { id?: unknown; revision?: unknown; status?: unknown; entryId?: unknown; petId?: unknown };
      if (typeof value.id !== 'string' || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) continue;
      const identity = { id: value.id, revision: value.revision as number };
      if (['completed', 'awaiting_answer'].includes(String(value.status)) && typeof value.entryId === 'string' && typeof value.petId === 'string')
        return { ...identity, status: 'completed', entryId: value.entryId, petId: value.petId };
      if (value.status === 'awaiting_subject' || value.status === 'cancelled')
        return { ...identity, status: value.status, entryId: typeof value.entryId === 'string' ? value.entryId : null, petId: null };
    } catch { /* The transaction is replayable with exactly these parameters. */ }
  }
  throw new Error('ASK_TASK_WRITE_UNCONFIRMED');
}

/** Filling the sole missing subject is a data lookup, not language generation.
 * Any extra instruction or ambiguous name stays with semantic interpretation. */
export function resolvePendingTaskSubject(context: Parameters<typeof validateAskTask>[1]): ValidatedAskTask | null {
  if (!context.pendingTask || context.pendingTask.status !== 'awaiting_subject' || context.pendingTask.requiresAnswer) return null;
  const named = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId && pet.name
    && pet.name.trim().toLocaleLowerCase() === context.currentMessage.trim().toLocaleLowerCase());
  if (named.length !== 1) return null;
  return validateAskTask({ intent: 'resume', sourceTurnId: null, petName: named[0].name }, context);
}

/** Restore the original request independently of the recent-message window. */
export function restorePendingTaskTurns(turns: IntelligenceConversationTurn[], pending?: PendingAskTask | null): IntelligenceConversationTurn[] {
  if (!pending) return turns;
  const missing = [pending.source, pending.request].filter((turn): turn is IntelligenceConversationTurn => Boolean(turn)
    && turn!.role === 'user' && !turns.some(existing => existing.id === turn!.id));
  return [...new Map([...missing, ...turns].map(turn => [turn.id, turn])).values()];
}

/** Completion is checked against the server-retained request, not a model's
 * restatement of a short subject reply. This grants no additional write scope. */
export function wholeAskTaskQuestion(context: { currentMessage: string; askInterpretation?: { request?: { task?: ValidatedAskTask | null } } }): string {
  const task = context.askInterpretation?.request?.task;
  return task?.intent === 'resume' && task.requiresAnswer && task.originalRequest
    ? `${task.originalRequest.text}\nFollow-up: ${context.currentMessage}` : context.currentMessage;
}
