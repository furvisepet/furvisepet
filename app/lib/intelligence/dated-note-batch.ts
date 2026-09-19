import { isExplicitCareHistorySaveRequest } from './care-history-policy.ts';

export type DatedCareNote = { note: string; dateText: string; occurredAt: string };
/** Explicitly delimited dated notes are records, not inferred clinical state.
 * Preserve the verbatim span and require every date; never collapse a batch. */
export function parseDatedNoteBatch(message: string): DatedCareNote[] {
  if (!isExplicitCareHistorySaveRequest(message) || /\b(?:fictional|hypothetical|pretend|do not|don't|don’t|never save)\b/i.test(message)) return [];
  const pattern = /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}):\s*/gi;
  const matches = [...message.matchAll(pattern)];
  if (matches.length < 2 || matches.length > 8) return [];
  const notes = matches.map((match, index) => {
    const note = message.slice(match.index!, matches[index + 1]?.index ?? message.length).trim();
    const time = Date.parse(match[1] + ' UTC');
    return { note, dateText: match[1], occurredAt: Number.isFinite(time) ? new Date(time).toISOString() : '' };
  });
  return notes.every(item => item.occurredAt && item.note.length <= 1000 && item.note.length > item.dateText.length + 2) ? notes : [];
}
export function noteBatchReviewActions(notes: readonly DatedCareNote[]) {
  return notes.map(item => ({ action: 'create_entry' as const, category: 'general' as const,
    title: 'Dated care note', details: item.note, severity: 'routine' as const, confidence: 1, relatedRecordId: null }));
}
