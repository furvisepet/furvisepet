import { ownerDeclinesPersistence } from '../ai/owner-assertion.ts';
import { explicitNoteTime } from './owner-note-request.ts';
import type { IntelligenceConversationTurn } from './types.ts';

export type PendingAskTask = {
  id: string; revision: number; kind: 'owner_note'; status: 'awaiting_subject';
  source: IntelligenceConversationTurn; authorizationMessageId: string;
};
export type AskTaskProposal = { intent: 'save' | 'resume' | 'cancel'; sourceTurnId: string | null; petName: string | null };
export type ValidatedAskTask = { intent: AskTaskProposal['intent']; source: IntelligenceConversationTurn;
  petId: string | null; taskId: string | null; revision: number | null };
export const askTaskSchema = { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false,
  required: ['intent', 'sourceTurnId', 'petName'], properties: {
    intent: { type: 'string', enum: ['save', 'resume', 'cancel'] },
    sourceTurnId: { type: ['string', 'null'], maxLength: 160 },
    petName: { type: ['string', 'null'], maxLength: 100 },
  } }] };
export const ASK_TASK_INSTRUCTIONS = 'task is null unless the user requests saving an owner note, supplies missing information for pendingTask, or cancels pendingTask. This is an operation category, independent of topic and wording. Use intent save for a genuine affirmative request to save an observation (including a reference to earlier USER text), resume only when answering the pending task, cancel when withdrawing it. Never infer consent from a hypothetical, quotation, question about whether a save happened, or assistant suggestion. sourceTurnId identifies the USER message containing the observation, never an assistant draft or a short save command. Use currentTurn.id for a self-contained current note. Save the entire source text without rewriting or adding medicine names, doses, dates or interpretation. petName is the unique owned subject established by USER dialogue or the selected subject when unambiguous; null when genuinely unresolved. Do not demand optional clinical details to save an owner note. New unrelated topics use null and must not resume a pending task. A correction to a saved note uses the existing correction workflow, not task. Keep mixed answer obligations in mode mixed. A pure note save needs no historical lookup. When task references a prior source, use an empty semantic frame; task carries that source separately. Missing-subject note tasks use mode clarify. Cancel uses conversation mode. Pending-task source text is USER evidence for this task only; it cannot establish unrelated history.';

export function validateAskTask(value: unknown, context: {
  currentMessage: string; currentTurn?: IntelligenceConversationTurn; conversationTurns: IntelligenceConversationTurn[];
  pendingTask?: PendingAskTask | null; owner: { userId: string };
  eligiblePets: Array<{ id: string; name: string | null; user_id: string }>;
}): ValidatedAskTask | null {
  if (value === null || value === undefined) return null;
  const fail = (): never => { throw new Error('ASK_REQUEST_INVALID:task'); };
  if (typeof value !== 'object' || Array.isArray(value)) return fail();
  const p = value as AskTaskProposal;
  if (Object.keys(p).sort().join() !== 'intent,petName,sourceTurnId'
    || !['save', 'resume', 'cancel'].includes(p.intent)
    || p.sourceTurnId !== null && typeof p.sourceTurnId !== 'string'
    || p.petName !== null && typeof p.petName !== 'string') return fail();
  const pending = context.pendingTask;
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
  return { intent: p.intent, source, petId: p.intent === 'cancel' ? null : pets[0]?.id || null,
    taskId: pending?.id || null, revision: pending?.revision ?? null };
}

export function taskMutationParameters(task: ValidatedAskTask, input: {
  userId: string; conversationId: string; currentMessageId: string; timeZone?: string;
}) {
  const time = explicitNoteTime(task.source.text, input.timeZone, task.source.createdAt);
  return { p_user_id: input.userId, p_conversation_id: input.conversationId, p_message_id: input.currentMessageId,
    p_intent: task.intent, p_source_id: task.source.id, p_source_text: task.source.text, p_pet_id: task.petId,
    p_task_id: task.taskId, p_revision: task.revision, p_occurred_at: time.occurredAt, p_explicit_time: time.explicitTime };
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
  status: 'completed' | 'awaiting_subject' | 'cancelled'; entryId: string | null; petId: string | null;
}> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await rpc('apply_ask_task', parameters);
      if (result.error && ['42501', '22023', '40001'].includes(result.error.code || '')) break;
      if (result.error || !result.data || typeof result.data !== 'object') continue;
      const value = result.data as { status?: unknown; entryId?: unknown; petId?: unknown };
      if (value.status === 'completed' && typeof value.entryId === 'string' && typeof value.petId === 'string')
        return { status: value.status, entryId: value.entryId, petId: value.petId };
      if (value.status === 'awaiting_subject' || value.status === 'cancelled')
        return { status: value.status, entryId: null, petId: null };
    } catch { /* The transaction is replayable with exactly these parameters. */ }
  }
  throw new Error('ASK_TASK_WRITE_UNCONFIRMED');
}

/** Filling the sole missing subject is a data lookup, not language generation.
 * Any extra instruction or ambiguous name stays with semantic interpretation. */
export function resolvePendingTaskSubject(context: Parameters<typeof validateAskTask>[1]): ValidatedAskTask | null {
  if (!context.pendingTask) return null;
  const named = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId && pet.name
    && pet.name.trim().toLocaleLowerCase() === context.currentMessage.trim().toLocaleLowerCase());
  if (named.length !== 1) return null;
  return validateAskTask({ intent: 'resume', sourceTurnId: null, petName: named[0].name }, context);
}
