import test from 'node:test';
import assert from 'node:assert/strict';
import { answerIntegrityFailure } from '../app/lib/answer-integrity.ts';
import { OperationDeadline } from '../app/lib/ai/execution-deadline.ts';
import { readAskProfiles } from '../app/lib/ask-profile-read.ts';
import { detectImmediateAskEmergency } from '../app/lib/ask-safety-context.ts';
import { episodeAnswer } from '../app/lib/intelligence/episode-contract.ts';
import { rememberReviewedTaskPresentation, reviewedTaskPresentationFailure } from '../app/lib/intelligence/ask-evidence-presentation.ts';
import { compactHistorySourceCoverage } from '../app/lib/ai/history-source-transport.ts';
import { petObservationSpans, isPetObservationEvidence } from '../app/lib/ai/recovery-subject.ts';
import { decideWhetherAiGenerationIsNeeded } from '../app/lib/ai/response-planner.ts';
import { readAskDraft, persistAskDraft, removeAskDraft } from '../app/lib/ask-draft.ts';
import { scopeConversationContext } from '../app/lib/intelligence/conversation-scope.ts';
import { conversationReadAnchor } from '../app/lib/intelligence/conversation-read-anchor.ts';
import { correctionReportAnswer } from '../app/lib/intelligence/correction-report.ts';
import { episodeMembershipSources } from '../app/lib/intelligence/episode-membership.ts';
import { parseEpisodeFollowUp } from '../app/lib/intelligence/episode-reference-language.ts';
import { hasUndatedHistoricalCareState } from '../app/lib/intelligence/historical-care-state.ts';
import { createAnswerAssessment, assessmentMatches } from '../app/lib/intelligence/answer-assessment.ts';

for (const [before, after] of [['Value < 5.', 'Value > 5.'], ['Value ≤ 5.', 'Value ≥ 5.'],
  ['Value −5.', 'Value 5.'], ['2 × 3 = 6', '2 ÷ 3 = 6'], ['Range 2–3.', 'Range 23.'],
  ['(2 + 3) * 4', '2 + 3 * 4'], ['2 - 3', '2 + 3'], ['2 ^ 3', '2 * 3']]) {
  test(`reviewed arithmetic punctuation survives: ${before}`, () => {
    assert.ok(answerIntegrityFailure({ summary: before }, { summary: after }));
  });
}
test('ordinary bold markup remains a presentation-only change', () => {
  assert.equal(answerIntegrityFailure({ summary: '**Weight** 5 kg.' }, { summary: 'Weight 5 kg.' }), null);
});
test('stage allocation never violates its minimum', () => {
  const deadline = new OperationDeadline(100, () => 0);
  assert.throws(() => deadline.allocate('verification', 5, 0, 10), /INVALID_STAGE_BUDGET/);
  assert.equal(deadline.allocate('verification', 50, 60, 10), 40);
});
test('an abort-ignoring profile read settles locally and rejects late data', async () => {
  let finish, signal;
  const pending = readAskProfiles(s => { signal = s; return new Promise(resolve => { finish = resolve; }); },
    { budgetMs: 20, attemptMs: 20, backoffMs: 0 });
  let timer;
  const result = await Promise.race([pending, new Promise(resolve => { timer = setTimeout(() => resolve('hung'), 250); })]);
  clearTimeout(timer);
  finish({ data: ['late'], error: null, status: 200 });
  assert.notEqual(result, 'hung');
  assert.equal(signal.aborted, true);
  assert.equal(result.data, null);
  assert.equal(result.diagnostic.failureClass, 'timeout');
});
test('caller abort bounds a profile query that ignores cancellation', async () => {
  const controller = new AbortController();
  const pending = readAskProfiles(() => new Promise(() => {}), { signal: controller.signal });
  controller.abort(new Error('cancelled by caller'));
  let timer;
  const result = await Promise.race([pending, new Promise(resolve => { timer = setTimeout(() => resolve('hung'), 250); })]);
  clearTimeout(timer);
  assert.notEqual(result, 'hung');
  assert.equal(result.diagnostic.failureClass, 'cancelled');
});
for (const message of ['Luna cannot breathe. Pixel is breathing normally.',
  'Luna is breathing normally but now she cannot breathe.',
  'I cannot breathe and Luna is having a seizure.',
  'Luna is having a seizure. Pixel stopped seizing.',
  'Luna cannot breathe. Pixel vomited. She is breathing normally now.',
  'Luna cannot breathe. She might be breathing normally now.',
  'Luna is not breathing normally and cannot breathe.']) {
  test(`emergency remains scoped to its current report: ${message}`, () => assert.ok(detectImmediateAskEmergency(message)));
}
for (const message of ['I cannot breathe after my run.', 'My pet stopped seizing and is back to normal.',
  'Luna cannot breathe. Luna is breathing normally now.', 'Luna was gasping but she is breathing normally now.',
  'Luna was gasping but she is no longer gasping.',
  'If my dog cannot breathe, what should I do?', 'In 2020 Luna was gasping.']) {
  test(`resolved or non-current report is not a current emergency: ${message}`, () => assert.equal(detectImmediateAskEmergency(message), null));
}
test('recorded episode counts support independently open date boundaries', () => {
  const result = { version: 'ask-episodes.v1', topic: 'vomiting', reasons: [], items: [], supportedCount: 0,
    exactTotal: 0, referenceStatus: 'list', coverage: 'recorded_complete', recordedInventory: { snapshot: '2026-09-11' } };
  assert.match(episodeAnswer({ ...result, from: '2025-01-01', to: null }).summary, /from 2025-01-01/);
  assert.match(episodeAnswer({ ...result, from: null, to: '2026-01-01' }).summary, /before 2026-01-01/);
});
test('review receipt rejects added and duplicate actions as well as removals', () => {
  const evidence = {}, answer = { summary: 'Open the profile.', sections: [], safetyNote: null };
  const action = { kind: 'navigation.open_pet_profile', petId: 'pet', input: {}, explicitIntent: true, href: '/pets/pet' };
  rememberReviewedTaskPresentation(evidence, answer, [action]);
  assert.equal(reviewedTaskPresentationFailure(evidence, answer, [{ ...action, status: 'succeeded' }]), null);
  assert.ok(reviewedTaskPresentationFailure(evidence, answer, []));
  assert.ok(reviewedTaskPresentationFailure(evidence, answer, [action, action]));
  assert.ok(reviewedTaskPresentationFailure(evidence, answer, [action, { ...action, petId: 'other' }]));
});

test('source transport preserves limits without leaking unrepresented IDs or mutating server evidence', () => {
  const shared = { petId: 'pet', status: 'capped', reasons: ['load_cap_reached'], completeness: { retrieval: 'partial' } };
  const sources = [{ ...shared, source: 'care', loadedIds: ['visible', 'hidden'], loadedCount: 30, cap: 30 },
    { ...shared, source: 'memory', loadedIds: ['private-memory'], loadedCount: 10, cap: 10 }];
  const saved = structuredClone(sources);
  const compact = compactHistorySourceCoverage(sources, new Set(['visible']));
  assert.deepEqual(compact.sources[0].loadedIds, ['visible']);
  assert.equal(compact.sources[0].loadedCount, 30);
  assert.deepEqual(compact.unrepresentedSourceGroups[0].members, [{ source: 'memory', loadedCount: 10, cap: 10 }]);
  assert.deepEqual(compact.unrepresentedSourceGroups[0].reasons, ['load_cap_reached']);
  assert.deepEqual(sources, saved);
});
test('recovery evidence retains human/other-pet pronoun scope and uncertainty', () => {
  assert.equal(isPetObservationEvidence('Luna is breathing normally.', 'Luna is breathing normally.', 'Luna'), true);
  assert.equal(isPetObservationEvidence('Pixel is breathing normally. She is better.', 'She is better.', 'Luna'), false);
  assert.equal(isPetObservationEvidence('Maybe Luna is breathing normally.', 'Luna is breathing normally.', 'Luna'), false);
  assert.equal(petObservationSpans('My sister is better. She is breathing normally.', 'Luna').length, 0);
});
test('acknowledgment cannot clear an active urgent concern; ordinary questions still generate', () => {
  const turn = { isLowValueAcknowledgement: true, concernState: 'unrelated', immediateEmergency: false };
  const concern = { severity: 'urgent', status: 'active', title: 'Breathing difficulty' };
  assert.equal(decideWhetherAiGenerationIsNeeded({ concern, petName: 'Luna', turn }).safetyLevel, 'urgent');
  assert.equal(decideWhetherAiGenerationIsNeeded({ concern: null, petName: 'Luna', turn }).answer, 'Got it.');
  assert.equal(decideWhetherAiGenerationIsNeeded({ concern, petName: 'Luna', turn: { ...turn, isLowValueAcknowledgement: false } }), null);
});
test('drafts stay isolated by conversation/pet and browser storage failure stays nonfatal', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  persistAskDraft(storage, null, 'luna', 'draft one'); persistAskDraft(storage, 'chat', 'luna', 'draft two');
  assert.equal(readAskDraft(storage, null, 'pixel'), '');
  removeAskDraft(storage, null, 'luna');
  assert.equal(readAskDraft(storage, 'chat', 'luna'), 'draft two');
  const broken = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  assert.equal(readAskDraft(broken, null, 'luna'), '');
  persistAskDraft(broken, null, 'luna', 'draft'); removeAskDraft(broken, null, 'luna');
});
test('conversation-only context removes saved facts but retains original safety message and user premises', () => {
  const context = { askInterpretation: { conversationOnly: true }, owner: { userId: 'owner', profile: { private: true } },
    pet: { id: 'container' }, currentMessage: 'Fictional example', eligiblePets: ['pet'], careEntries: ['saved'], memories: ['memory'],
    conversationTurns: [{ role: 'user', text: 'Premise' }, { role: 'assistant', text: 'Unverified answer' }] };
  const scoped = scopeConversationContext(context);
  assert.deepEqual(scoped.careEntries, []); assert.deepEqual(scoped.memories, []); assert.deepEqual(scoped.eligiblePets, []);
  assert.equal(scoped.owner.profile, null); assert.equal(scoped.currentMessage, context.currentMessage);
  assert.deepEqual(scoped.conversationTurns, [context.conversationTurns[0]]);
  assert.deepEqual(context.careEntries, ['saved']);
});
test('read anchors come from user dates and retain both pets across a plural follow-up', () => {
  const pets = [{ id: 'luna', name: 'Luna', user_id: 'owner' }, { id: 'pixel', name: 'Pixel', user_id: 'owner' }];
  const context = { owner: { userId: 'owner' }, eligiblePets: pets, pet: pets[0], currentMessage: 'Compare those two pets.',
    conversationTurns: [{ id: 'user-date', role: 'user', text: 'Compare Luna and Pixel on 2024-01-01.' }] };
  const anchor = conversationReadAnchor(context);
  assert.deepEqual(anchor?.petNames, ['Luna', 'Pixel']); assert.equal(anchor.from, '2024-01-01'); assert.equal(anchor.to, '2024-01-02');
  assert.equal(conversationReadAnchor({ ...context, conversationTurns: [{ ...context.conversationTurns[0], role: 'assistant' }] }), null);
  for (const text of ['Compare Luna and Pixel on 2024-02-30.', 'Compare Luna and Pixel on 2024-01-01 and January 2, 2024.'])
    assert.equal(conversationReadAnchor({ ...context, conversationTurns: [{ ...context.conversationTurns[0], text }] }), null);
});
test('correction wording cannot bypass the shared reviewed request path', () => {
  assert.equal(correctionReportAnswer({ interpretation: { request: { version: 'ask-request.v2' } } }), null);
});
test('membership fails closed on foreign ownership and marks missing source groups incomplete', () => {
  const episode = { id: 'episode', user_id: 'owner', pet_profile_id: 'pet' };
  const data = { membership_contract: 'ask-episode-membership.v1', memberships: [], claims: [] };
  assert.equal(episodeMembershipSources(data, [episode], [], 'owner', 'pet').invalid.has('episode'), true);
  assert.throws(() => episodeMembershipSources({ ...data, memberships: [{ id: 'm', episode_id: 'episode', user_id: 'foreign', pet_profile_id: 'pet' }] }, [episode], [], 'owner', 'pet'), /scope_mismatch/);
});
test('episode ordinals are unambiguous locators, not factual or ownership authority', () => {
  assert.deepEqual(parseEpisodeFollowUp('Show the second episode.'), { ordinal: 'second', ambiguous: false });
  assert.equal(parseEpisodeFollowUp('Compare first and second episodes.').ambiguous, true);
  assert.equal(parseEpisodeFollowUp('Show the recorded weight.'), null);
});
test('historical state requires attribution and assessments remain bound to the exact body', () => {
  assert.equal(hasUndatedHistoricalCareState('Luna eats rabbit food.', [{ occurredAt: '2024-01-01' }]), true);
  assert.equal(hasUndatedHistoricalCareState('The notes say Luna eats rabbit food.', [{ occurredAt: '2024-01-01' }]), false);
  const checks = { structuralValidity: 'passed', evidenceSupport: 'passed', subjectDateCorrectness: 'passed', calculationCorrectness: 'passed', taskCompletion: 'passed' };
  const assessment = createAnswerAssessment({ checks, body: '7 kg', evidence: ['record'] });
  assert.equal(assessment.outcome, 'complete'); assert.equal(assessmentMatches(assessment, '8 kg', ['record']), false);
  assert.equal(createAnswerAssessment({ checks: { ...checks, calculationCorrectness: 'not_evaluated' }, body: '7 kg', evidence: [] }).outcome, 'limited');
});
