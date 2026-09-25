import { ownerDeclinesPersistence } from '../ai/owner-assertion.ts';
import { findExplicitCareRecordAuthorization, findExplicitPendingTaskCancellation, type FurviseMutationAuthorizationEvidence } from '../furvise-brain/mutation-authorization.ts';
import type { IntelligenceConversationTurn } from './types.ts';
import { resolveDeterministicTurnSubject } from './entities/resolve-turn-subject.ts';
import type { DogProfileRow } from '../supabase.ts';

export type PendingAskTask = {
  id: string; revision: number; kind: 'owner_note'; status: 'awaiting_subject' | 'awaiting_answer';
  petId?: string | null; entryId?: string | null;
  source: IntelligenceConversationTurn; authorizationMessageId: string;
  request?: IntelligenceConversationTurn; requiresAnswer?: boolean;
};
export type AskTaskProposal = { intent: 'save' | 'resume' | 'cancel'; sourceTurnId: string | null; petName: string | null; answerRequired?: boolean; answerRequest?: { turnId: string; quote: string } | null };
export type ValidatedAskTask = { intent: AskTaskProposal['intent']; source: IntelligenceConversationTurn;
  petId: string | null; taskId: string | null; revision: number | null; requiresAnswer: boolean; originalRequest?: IntelligenceConversationTurn;
  authorization: FurviseMutationAuthorizationEvidence; authorizationTurnId: string | null };
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
  eligiblePets: Array<{ id: string; name: string | null; user_id: string; species?: DogProfileRow['species']; sex?: DogProfileRow['sex'] }>;
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
  const currentAuthorization = p.intent === 'save' ? findExplicitCareRecordAuthorization(context.currentMessage)
    : p.intent === 'cancel' ? findExplicitPendingTaskCancellation(context.currentMessage) : null;
  const durableAuthorization = p.intent === 'resume' && pending?.request
    && pending.request.role === 'user' && pending.request.id === pending.authorizationMessageId
    ? findExplicitCareRecordAuthorization(pending.request.text) : null;
  if (p.intent === 'save' && !currentAuthorization) return fail();
  if (p.intent === 'cancel' && !currentAuthorization) return fail();
  if (p.intent === 'resume' && !durableAuthorization) return fail();
  let citedAnswer = false;
  if (p.answerRequest !== undefined && p.answerRequest !== null) {
    const evidence = p.answerRequest;
    if (typeof evidence !== 'object' || Array.isArray(evidence)
      || Object.keys(evidence).sort().join() !== 'quote,turnId'
      || typeof evidence.turnId !== 'string' || typeof evidence.quote !== 'string'
      || !evidence.quote.trim() || evidence.quote.length > 1200) return fail();
    const request = [context.currentTurn, pending?.request].find(turn => turn?.id === evidence.turnId);
    if (!request || request.role !== 'user' || !request.text.includes(evidence.quote)) return fail();
    citedAnswer = true;
  }
  const requiresAnswer = p.answerRequest !== undefined ? citedAnswer : Boolean(p.answerRequired || context.requiresAnswer);
  if (p.intent !== 'save' && !pending) return fail();
  if (p.intent !== 'cancel' && ownerDeclinesPersistence(context.currentMessage)) return fail();
  const source = p.intent === 'cancel' || p.intent === 'resume' ? pending?.source
    : [context.currentTurn, ...context.conversationTurns, pending?.source].find(turn => turn?.id === p.sourceTurnId);
  if (!source || source.recoveredReceiptReference || source.role !== 'user' || !source.text.trim() || source.text.length > 1200
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
    const index = context.conversationTurns.findIndex(turn => turn.id === source.id);
    const relevant = [source, ...(index >= 0 ? context.conversationTurns.slice(index + 1) : []), context.currentTurn];
    const normalize = (text: string) => ` ${text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
    if (!relevant.some(turn => turn?.role === 'user' && normalize(turn.text).includes(normalize(p.petName!)))) {
      const prior = index >= 0 ? context.conversationTurns.slice(0, index) : context.conversationTurns;
      const lastUser = prior.filter(turn => turn.role === 'user').at(-1);
      const receipt = lastUser?.operationReceipt;
      const owned = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId);
      const resolution = resolveDeterministicTurnSubject({ message: source.text,
        pets: owned.map(pet => ({ ...pet, name: pet.name || '', species: pet.species || null, age_value: null, age_unit: null })),
        recentConversation: prior, selectedPetId: proposedPetId });
      if (!receipt?.records.length || receipt.petId !== proposedPetId
        || !/\b(?:she|her|he|him|his|they|them|their|it|its)\b/i.test(source.text)
        || resolution?.petId !== proposedPetId || resolution?.requiresClarification
        || resolution.discourseFocus && resolution.discourseFocus.kind !== 'pet') proposedPetId = null;
    }
  }
  const authorization: FurviseMutationAuthorizationEvidence = p.intent === 'resume'
    ? { kind: 'record_care', source: 'durable_capability', evidence: durableAuthorization! }
    : p.intent === 'cancel'
      ? { kind: 'cancel_pending', source: 'current_turn', evidence: currentAuthorization! }
      : { kind: 'record_care', source: 'current_turn', evidence: currentAuthorization! };
  return { ...(p.intent === 'resume' && pending?.requiresAnswer && pending.request ? { originalRequest: pending.request } : {}), intent: p.intent, source, petId: p.intent === 'cancel' ? null : retainedPet?.id || proposedPetId,
    taskId: pending?.id || null, revision: pending?.revision ?? null, authorization,
    authorizationTurnId: p.intent === 'resume' ? pending?.authorizationMessageId || null : null,
    requiresAnswer: p.intent !== 'cancel' && Boolean(requiresAnswer || p.intent === 'resume' && pending?.requiresAnswer) };
}

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
      requestedItems: turn.operationReceipt?.requestedItems,
      actionReceipts: turn.operationReceipt?.actionReceipts, records: [...records.values()] } };
  });
}

export function restorePendingTaskTurns(turns: IntelligenceConversationTurn[], pending?: PendingAskTask | null): IntelligenceConversationTurn[] {
  if (!pending) return turns;
  const missing = [pending.source, pending.request].filter((turn): turn is IntelligenceConversationTurn => Boolean(turn)
    && turn!.role === 'user' && !turns.some(existing => existing.id === turn!.id));
  return [...new Map([...missing, ...turns].map(turn => [turn.id, turn])).values()];
}

export function wholeAskTaskQuestion(context: { currentMessage: string; askInterpretation?: { request?: { task?: ValidatedAskTask | null } } }): string {
  const task = context.askInterpretation?.request?.task;
  return task?.intent === 'resume' && task.requiresAnswer && task.originalRequest
    ? `${task.originalRequest.text}\nFollow-up: ${context.currentMessage}` : context.currentMessage;
}
