import { validBriefDay } from './appointment-plan.ts';
import type { IntelligenceVetBrief } from '../intelligence/vet-brief.ts';
import { parseVetBriefDocument } from './schema.ts';
import type { VetBriefDocument } from './types.ts';

export const vetBriefContentFields = ['reasonForVisit', 'visitSummary', 'events', 'questionsForVeterinarian', 'missingInformation'] as const;
const text = { type: 'string', maxLength: 1200 };
const strings = (maxItems: number) => ({ type: 'array', maxItems, items: text });
export const vetBriefContentSchema = {
  type: 'object', additionalProperties: false, required: ['content', 'sourceRecordIds', 'confidence'],
  properties: {
    content: { type: 'object', additionalProperties: false, required: [...vetBriefContentFields], properties: {
      reasonForVisit: text, visitSummary: text,
      events: { type: 'array', maxItems: 40, items: { type: 'object', additionalProperties: false, required: ['kind', 'date', 'category', 'text'], properties: {
        kind: { type: 'string', enum: ['medication', 'observation', 'food', 'product', 'history'] }, date: { type: 'string', pattern: '^(\\d{4}-\\d{2}-\\d{2}|Date unknown)$' }, category: { type: 'string', maxLength: 80 }, text,
      } } },
      questionsForVeterinarian: strings(6), missingInformation: strings(16),
    } },
    sourceRecordIds: { type: 'array', maxItems: 300, items: { type: 'string' } },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
};

/** One event list, one server-selected placement per event. The model never
 * copies events into a second parallel document representation. */
export function parseVetBriefContent(value: unknown, baseline: VetBriefDocument, allowedIds: string[]): IntelligenceVetBrief | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { content?: Record<string, unknown>; sourceRecordIds?: unknown; confidence?: unknown };
  const content = raw.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  if (Object.keys(content).some(key => !(vetBriefContentFields as readonly string[]).includes(key)) || vetBriefContentFields.some(key => !(key in content))) return null;
  const ids = raw.sourceRecordIds;
  if (!Array.isArray(ids) || ids.length > 300 || ids.some(id => typeof id !== 'string' || !allowedIds.includes(id)) || !['low', 'medium', 'high'].includes(String(raw.confidence))) return null;
  if (typeof content.reasonForVisit !== 'string' || content.reasonForVisit.length > 1200 || typeof content.visitSummary !== 'string' || content.visitSummary.length > 1200 || !Array.isArray(content.events) || content.events.length > 40) return null;
  for (const [key, limit] of [['questionsForVeterinarian', 6], ['missingInformation', 16]] as const) if (!Array.isArray(content[key]) || content[key].length > limit || content[key].some(item => typeof item !== 'string' || item.length > 1200)) return null;
  const assembled: VetBriefDocument = { ...baseline, reasonForVisit: content.reasonForVisit, visitSummary: content.visitSummary,
    ownerReportedChanges: [], concernTimeline: [], foodChanges: [], productsUsed: [], medicationsSupplements: [], relevantCareHistory: [], reportedPatterns: [],
    questionsForVeterinarian: content.questionsForVeterinarian as string[], missingInformation: content.missingInformation as string[],
  };
  for (const event of content.events) {
    if (!event || typeof event !== 'object' || !['medication', 'observation', 'food', 'product', 'history'].includes(event.kind) || (event.date !== 'Date unknown' && !validBriefDay(event.date)) || typeof event.text !== 'string' || event.text.length > 1200 || typeof event.category !== 'string' || event.category.length > 80) return null;
    const item = { date: event.date, text: event.text };
    if (event.kind === 'medication') assembled.medicationsSupplements.push(item);
    else if (event.kind === 'observation') assembled.concernTimeline.push(item);
    else if (event.kind === 'food') assembled.foodChanges.push(item);
    else if (event.kind === 'product') assembled.productsUsed.push(item);
    else assembled.relevantCareHistory.push({ ...item, category: event.category });
  }
  const document = parseVetBriefDocument(assembled);
  if (!document) return null;
  return { document: { ...document, pet: baseline.pet, dateRange: baseline.dateRange, generatedAt: baseline.generatedAt }, sourceRecordIds: [...new Set(ids)], confidence: raw.confidence as IntelligenceVetBrief['confidence'] };
}
