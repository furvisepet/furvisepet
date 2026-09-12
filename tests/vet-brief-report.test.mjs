import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVetBriefDraft } from '../app/lib/vet-brief/builder.ts';
import { vetBriefReport, vetBriefText } from '../app/lib/vet-brief/report.ts';
import { addVetBriefCoverage, parseVetBriefReview, vetBriefReviewPassed } from '../app/lib/vet-brief/review.ts';

const profile = { name: 'Sable', species: 'dog', breed: 'Labrador', age_value: 4, age_unit: 'years', weight_value: 20, weight_unit: 'kg', current_food: 'Usual food' };
const entry = (id, category, date, note) => ({ id, category, occurred_at: `${date}T12:00:00Z`, title: '', note });
const draft = (entries = []) => buildVetBriefDraft({ profile, careEntries: entries, memories: [], reasonForVisit: 'Routine wellness review', from: '2026-09-01', to: '2026-09-12' }).document;

test('a routine breakfast appears once and is not a change or a pattern', () => {
  const document = draft([entry('meal', 'food', '2026-09-10', 'Sable ate 83 g of her usual food at breakfast.')]);
  assert.deepEqual(document.foodChanges, []);
  assert.deepEqual(document.ownerReportedChanges, []);
  assert.deepEqual(document.reportedPatterns, []);
  assert.equal(document.relevantCareHistory.length, 1);
  assert.equal(vetBriefText(document).match(/83 g/g).length, 1);
});

test('legacy duplication collapses but separate dates and contradictory observations survive', () => {
  const document = draft();
  document.concernTimeline = [{ date: '2026-09-10', text: 'Owner reported: Did not vomit.' }, { date: '2026-09-11', text: 'Owner reported: Did not vomit.' }];
  document.ownerReportedChanges = [{ date: '2026-09-10', text: 'Owner reported: Did not vomit.' }, { date: '2026-09-10', text: 'Owner reported: Vomited once.' }];
  document.relevantCareHistory = [{ date: '2026-09-10', category: 'Symptom', text: 'Saved care history shows: Did not vomit.' }];
  const output = vetBriefText(document);
  assert.equal(output.match(/Did not vomit/g).length, 2);
  assert.equal(output.match(/Vomited once/g).length, 1);
});

test('excluding a primary section does not suppress an included historical copy', () => {
  const document = draft();
  document.concernTimeline = [{ date: '2026-09-10', text: 'Owner reported: Vomited once.' }];
  document.relevantCareHistory = [{ date: '2026-09-10', category: 'Symptom', text: 'Saved care history shows: Vomited once.' }];
  document.excludedSections = ['timeline'];
  assert.match(vetBriefText(document), /Vomited once/);
});

test('sharing includes medication and food details, while empty sections are omitted', () => {
  const document = draft([entry('med', 'medication', '2026-09-09', 'Owner gave prescribed medicine 2 mg.'), entry('food', 'food', '2026-09-10', 'Switched from chicken to fish recipe.')]);
  const text = vetBriefText(document);
  assert.match(text, /2 mg/);
  assert.match(text, /Switched from chicken/);
  assert.equal(vetBriefReport(document).some(section => section.id === 'notes'), false);
});

test('every independent review criterion must pass; malformed or partial verdicts fail', () => {
  const keys = ['factsSupported', 'importantHistoryPreserved', 'categoriesAccurate', 'uncertaintyPreserved', 'noDuplication', 'questionsUseful'];
  const valid = Object.fromEntries(keys.map(key => [key, true]));
  assert.equal(vetBriefReviewPassed(parseVetBriefReview(valid)), true);
  for (const key of keys) assert.equal(vetBriefReviewPassed(parseVetBriefReview({ ...valid, [key]: false })), false);
  assert.equal(vetBriefReviewPassed(parseVetBriefReview({ factsSupported: true })), false);
});

test('capped and unavailable history remains visible in the published report', () => {
  const document = addVetBriefCoverage(draft(), [{ source: 'care_entries', status: 'capped' }]);
  assert.match(vetBriefText(document), /Earlier records may be missing/);
  assert.match(vetBriefText(addVetBriefCoverage(draft(), [{ source: 'care_entries', status: 'unavailable' }])), /could not be loaded/);
});

test('visit overview precedes the timeline and respects the reason-section exclusion', () => {
  const document = draft();
  document.visitSummary = 'The owner reports intermittent scratching; the cause is not established.';
  document.concernTimeline = [{ date: '2026-09-10', text: 'Owner noticed scratching.' }];
  const sections = vetBriefReport(document);
  assert.ok(sections.findIndex(s => s.id === 'overview') < sections.findIndex(s => s.id === 'timeline'));
  document.excludedSections = ['visit-reason'];
  assert.doesNotMatch(vetBriefText(document), /intermittent/);
});

test('PDF embeds readable fonts and preserves accented names and units', async () => {
  const { generateVetBriefPdf, UnsupportedBriefPdfTextError } = await import('../app/lib/vet-brief/pdf.ts');
  const { PDFDocument } = await import('pdf-lib');
  const document = draft();
  document.pet.name = 'Zoë';
  document.ownerNotes = 'Recorded amount 25 µg; température 38.5 °C.';
  const pdf = await PDFDocument.load(await generateVetBriefPdf(document));
  assert.equal(pdf.getPageCount(), 1);
  document.ownerNotes = '漢字';
  await assert.rejects(generateVetBriefPdf(document), UnsupportedBriefPdfTextError);
});
