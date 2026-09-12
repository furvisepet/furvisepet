import type { VetBriefDocument } from './types.ts';
import { vetBriefReport } from './report.ts';
import { parseVetBriefReview, vetBriefReviewSchema } from './review.ts';
const section = { type: 'string', enum: ['timeline', 'changes', 'food', 'products', 'medications', 'history'] };
export const vetBriefPublicationReviewSchema = {
  ...vetBriefReviewSchema,
  required: [...vetBriefReviewSchema.required, 'duplicatePairs'],
  properties: { ...vetBriefReviewSchema.properties, duplicatePairs: { type: 'array', maxItems: 8, items: {
    type: 'object', additionalProperties: false, required: ['firstSection', 'firstItem', 'secondSection', 'secondItem'], properties: {
      firstSection: section, firstItem: { type: 'integer', minimum: 0 }, secondSection: section, secondItem: { type: 'integer', minimum: 0 },
    },
  } } },
};
/** A reviewer must locate the alleged duplicate in the actual publication.
 * Overview/profile/question repetition cannot reject a factual clinical brief.
 * All other independent checks remain untouched. No clinical text is deleted. */
export function parseVetBriefPublicationReview(value: unknown, document: VetBriefDocument) {
  const review = parseVetBriefReview(value);
  if (!review || !value || typeof value !== 'object') return null;
  const pairs = (value as { duplicatePairs?: unknown }).duplicatePairs;
  if (!Array.isArray(pairs) || pairs.length > 8) return null;
  const sections = vetBriefReport(document);
  const valid = pairs.some(pair => {
    if (!pair || typeof pair !== 'object' || !section.enum.includes(pair.firstSection) || !section.enum.includes(pair.secondSection) || pair.firstSection === pair.secondSection || !Number.isInteger(pair.firstItem) || !Number.isInteger(pair.secondItem)) return false;
    const first = sections.find(s => s.id === pair.firstSection)?.items[pair.firstItem];
    const second = sections.find(s => s.id === pair.secondSection)?.items[pair.secondItem];
    return Boolean(first && second && first.date && first.date === second.date);
  });
  return { ...review, noDuplication: !valid };
}
export const vetBriefDuplicationReviewInstructions = `For noDuplication, return duplicatePairs locating each duplicated detailed dated event by exact published section id and zero-based item index in two DIFFERENT supporting detail sections. Each pair must point to the same dated event. Overview, reason, profile, questions, gaps and urgent guidance are not supporting detail sections and cannot be cited as duplicates. If no such pair exists, noDuplication must be true and duplicatePairs empty. Never fabricate a pair to justify a verdict. A current owner report conflicting with a saved medication plan is not duplication: preserve both and explain the discrepancy. Identical topic words do not make distinct facts duplicates.`;
