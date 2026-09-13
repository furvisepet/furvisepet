import type { FurviseLiveContext } from '../intelligence/types.ts';
import type { VetBriefAppointmentPlan } from './appointment-plan.ts';

/** Generation and review share exactly this bounded, correction-aware bundle.
 * Do not append raw originals: that can resurrect deleted or superseded facts. */
export function vetBriefEvidence(context: FurviseLiveContext, plan: VetBriefAppointmentPlan) {
  const history = context.askHistory;
  const records = history?.entries || [];
  const coverage = history?.coverage;
  const warnings: string[] = [];
  if (!history || coverage?.retrieval === 'unavailable' || coverage?.corrections === 'unavailable') warnings.push('Some requested historical evidence could not be verified. Bring the original records; this brief may omit relevant information.');
  if (coverage?.continuation.length || coverage?.reasons.some(reason => /budget|timeout|unavailable|changed|unsupported|unknown_effective/.test(reason))) warnings.push('Only part of the requested history could be reviewed. This brief cannot establish complete trends or that an unmentioned event never happened.');
  // A lexical search is never a completeness certificate, even if exhausted.
  warnings.push('Relevant saved records were searched; the available history may be incomplete.');
  const memories = [...context.memories.map(m => ({ id: m.id, kind: m.category, text: typeof m.fact_value === 'string' ? m.fact_value : JSON.stringify(m.fact_value), confirmedAt: m.last_confirmed_at })),
    ...context.legacyPetMemories.map(m => ({ id: m.id, kind: m.type, text: m.text, confirmedAt: m.created_at }))];
  const selectedMemories: typeof memories = []; let memoryChars = 0;
  for (const memory of memories) {
    const size = JSON.stringify(memory).length;
    if (selectedMemories.length >= 24 || memoryChars + size > 10000) { if (!warnings.includes('Some saved background notes could not fit in this brief.')) warnings.push('Some saved background notes could not fit in this brief.'); continue; }
    selectedMemories.push(memory); memoryChars += size;
  }
  const evidence = {
    asOf: context.currentTimestamp,
    appointment: { focus: plan.focus, requestedFrom: plan.from, requestedTo: plan.to },
    // Search stems and private retrieval questions are not clinical assertions
    // or a ready-made list of questions to hand back to the veterinarian.
    evidenceChecks: plan.questionsToResolve,
    currentOwnerReport: context.currentMessage,
    profile: context.pet,
    records: records.map(r => ({ id: r.id, date: r.occurred_at, category: r.category, title: r.title, text: r.note })),
    backgroundNotes: selectedMemories,
    activeConcerns: context.activeConcerns,
    recentlyResolvedConcerns: context.recentlyResolvedConcerns,
    ownerStatements: context.conversationTurns.filter(t => t.role === 'user').map(t => t.text),
    coverageWarnings: warnings,
  };
  const allowedIds = [...new Set([...records.map(r => r.id), ...selectedMemories.map(m => m.id), ...context.activeConcerns.map(c => c.id), ...context.recentlyResolvedConcerns.map(c => c.id)])];
  return { evidence, warnings, allowedIds };
}
