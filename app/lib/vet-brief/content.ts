import { intelligenceVetBriefJsonSchema, type IntelligenceVetBrief } from '../intelligence/vet-brief.ts';
import { parseVetBriefDocument } from './schema.ts';
import type { VetBriefDocument } from './types.ts';

// The model owns clinical prose, never profile identity, dates, document versions,
// owner edits, or publication settings. Assemble those on the server.
export const vetBriefContentFields = ['reasonForVisit', 'visitSummary', 'ownerReportedChanges', 'concernTimeline', 'foodChanges', 'productsUsed', 'medicationsSupplements', 'relevantCareHistory', 'reportedPatterns', 'questionsForVeterinarian', 'missingInformation'] as const;
const properties = intelligenceVetBriefJsonSchema.properties.document.properties;
export const vetBriefContentSchema = {
  type: 'object', additionalProperties: false,
  required: ['content', 'sourceRecordIds', 'confidence'],
  properties: {
    content: { type: 'object', additionalProperties: false, required: [...vetBriefContentFields],
      properties: Object.fromEntries(vetBriefContentFields.map(key => [key, properties[key]])) },
    sourceRecordIds: intelligenceVetBriefJsonSchema.properties.sourceRecordIds,
    confidence: intelligenceVetBriefJsonSchema.properties.confidence,
  },
};

export function parseVetBriefContent(value: unknown, baseline: VetBriefDocument, allowedIds: string[]): IntelligenceVetBrief | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { content?: Record<string, unknown>; sourceRecordIds?: unknown; confidence?: unknown };
  if (!raw.content || typeof raw.content !== 'object' || Array.isArray(raw.content)) return null;
  if (Object.keys(raw.content).some(key => !(vetBriefContentFields as readonly string[]).includes(key)) || vetBriefContentFields.some(key => !(key in raw.content!))) return null;
  const ids = raw.sourceRecordIds;
  if (!Array.isArray(ids) || ids.length > 300 || ids.some(id => typeof id !== 'string' || !allowedIds.includes(id)) || !['low', 'medium', 'high'].includes(String(raw.confidence))) return null;
  const document = parseVetBriefDocument({ ...baseline, ...raw.content });
  if (!document) return null;
  // Preserve the authoritative representation even when the generic legacy parser
  // normalizes punctuation in profile fields.
  return { document: { ...document, pet: baseline.pet, dateRange: baseline.dateRange, generatedAt: baseline.generatedAt }, sourceRecordIds: [...new Set(ids)], confidence: raw.confidence as IntelligenceVetBrief['confidence'] };
}
