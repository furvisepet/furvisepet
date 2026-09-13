import type { VetBriefDocument } from './types.ts';
import { vetBriefReport } from './report.ts';
import { parseVetBriefReview, vetBriefReviewSchema, vetBriefRepairSections } from './review.ts';
const section = { type: 'string', enum: ['timeline', 'changes', 'food', 'products', 'medications', 'history'] };
const issueKinds = ['date_or_time', 'medication_status', 'measurement', 'diagnosis_or_causation', 'source_scope', 'profile', 'other'];
const issueSections = ['reason', 'overview', 'timeline', 'medications', 'history', 'questions', 'gaps'];
export const vetBriefPublicationReviewSchema = {
  ...vetBriefReviewSchema,
  required: [...vetBriefReviewSchema.required, 'duplicatePairs', 'factualIssues', 'repairSections'],
  properties: { ...vetBriefReviewSchema.properties, repairSections: { type: 'array', maxItems: 11, items: { type: 'string', enum: [...vetBriefRepairSections] } }, factualIssues: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['kind', 'section'], properties: { kind: { type: 'string', enum: issueKinds }, section: { type: 'string', enum: issueSections } } } }, duplicatePairs: { type: 'array', maxItems: 8, items: {
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
  const repairSections = (value as { repairSections?: unknown }).repairSections;
  if (!Array.isArray(repairSections) || repairSections.length > 11 || repairSections.some(id => !vetBriefRepairSections.includes(id))) return null;
  if (Object.entries(review).some(([key, value]) => key !== 'repairInstructions' && value === false) && !repairSections.length) return null;
  const sections = vetBriefReport(document);
  const valid = pairs.some(pair => {
    if (!pair || typeof pair !== 'object' || !section.enum.includes(pair.firstSection) || !section.enum.includes(pair.secondSection) || pair.firstSection === pair.secondSection || !Number.isInteger(pair.firstItem) || !Number.isInteger(pair.secondItem)) return false;
    const first = sections.find(s => s.id === pair.firstSection)?.items[pair.firstItem];
    const second = sections.find(s => s.id === pair.secondSection)?.items[pair.secondItem];
    return Boolean(first && second && first.date && first.date === second.date);
  });
  const issues = (value as { factualIssues?: unknown }).factualIssues ?? [];
  if (!Array.isArray(issues) || issues.length > 8 || issues.some(issue => !issue || typeof issue !== 'object' || !issueKinds.includes(issue.kind) || !issueSections.includes(issue.section))) return null;
  if (review.factsSupported && issues.length) return null;
  return { ...review, repairSections, noDuplication: !valid, factualIssueCodes: issues.map(issue => `${issue.kind}:${issue.section}`) };
}
export const vetBriefDuplicationReviewInstructions = `Return repairSections identifying EVERY section requiring a change for ANY failed criterion, including destination sections when moving a wrongly categorized event and sections missing important evidence. Only these sections will be replaced during repair; unaffected sections are preserved by the server. Identify all dependent sections if a premise is repeated. Use an empty array only when all checks pass. Never ask to repair immutable metadata. For every factsSupported failure, populate factualIssues with the affected published section and allowlisted fact kind; never place clinical text, values or source IDs in these diagnostic fields. In repairInstructions quote the exact offending assertion and state the specific evidence-supported correction for each factual issue. Explain the actual difference in scope or date; do not reject a translation merely for using different words. Identify every repeated instance of the same premise in questions, gaps and summaries. Keep these clinical quotations private in repairInstructions, never in diagnostic fields. Use an empty factualIssues array when factsSupported passes. For noDuplication, return duplicatePairs locating each duplicated detailed dated event by exact published section id and zero-based item index in two DIFFERENT supporting detail sections. Each pair must point to the same dated event. Overview, reason, profile, questions, gaps and urgent guidance are not supporting detail sections and cannot be cited as duplicates. If no such pair exists, noDuplication must be true and duplicatePairs empty. Never fabricate a pair to justify a verdict. A current owner report conflicting with a saved medication plan is not duplication: preserve both and explain the discrepancy. Identical topic words do not make distinct facts duplicates.`;
