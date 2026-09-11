// Read-only architecture probes. These document current behavior, not desired
// behavior; they are not regression tests and make no provider/database calls.
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export default {}' };
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const url = new URL(specifier, context.parentURL);
    for (const suffix of ['.ts', '/index.ts']) if (existsSync(fileURLToPath(url.href + suffix))) return next(url.href + suffix, context);
  }
  return next(specifier, context);
} });
globalThis.fetch = async () => { throw new Error('No network allowed in architecture probe'); };
const { validateAskRequest, ASK_REQUEST_VERSION } = await import('../../app/lib/intelligence/ask-request-contract.ts');
const { historicalReadSchema, canonicalHistoricalRead } = await import('../../app/lib/intelligence/historical-read-response.ts');
const source = readFileSync(new URL('../../app/lib/intelligence/review-history-narrative.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('review.ts', source, ts.ScriptTarget.Latest, true);
const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'usableSources');
if (!node) throw new Error('Source function moved; inspect the new owner');
const usableSources = vm.runInNewContext(ts.transpileModule(node.getText(ast) + '\nusableSources;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
const pet = { id: 'pet-a', user_id: 'owner-a', name: 'Aster' };
const context = { owner: { userId: 'owner-a' }, pet, eligiblePets: [pet], conversationTurns: [] };
const base = { version: ASK_REQUEST_VERSION, mode: 'read', question: 'Read the requested saved evidence.', requirements: [], referenceTurnIds: [], scope: 'named', petNames: ['Aster'], operation: 'episode', selection: 'reference', quantity: 'episodes', topic: 'vomiting', terms: ['vomiting'], from: null, to: null, episodeTopic: 'vomiting', ordinal: 'second', frame: null };
const results = [];
for (const quantity of ['episodes', 'records', 'duration']) {
  try {
    const result = validateAskRequest({ ...base, quantity }, { ...context, currentMessage: 'Show the saved evidence for Aster’s second vomiting episode.' });
    results.push({ probe: 'episode_reference_projection', quantity, accepted: true, operation: result.readOperation ?? result.operation, ordinal: result.ordinal });
  } catch (error) { results.push({ probe: 'episode_reference_projection', quantity, accepted: false, error: error.message }); }
}
const represented = ['species', 'sex', 'pronouns', 'age', 'breed', 'weight'].map(field => ({ sourceId: 'profile:pet-a:' + field, sourceType: 'profile', petId: 'pet-a', text: field, start: 0, end: field.length }));
results.push({ probe: 'reviewer_profile_field_selection', supplied: represented.map(s => s.sourceId), retained: usableSources({ represented, scope: { authorizedPetIds: ['pet-a'] }, interpretation: { request: {} }, losses: [], sources: [{ source: 'profile', petId: 'pet-a', loadedIds: ['pet-a'], status: 'loaded' }] }).map(s => s.sourceId) });
const schema = historicalReadSchema({}, 'csv');
results.push({ probe: 'csv_contract', maxRows: schema.properties.table.properties.rows.maxItems, minRows: schema.properties.table.properties.rows.minItems, limitation: schema.properties.limitation });
const row = { cells: ['Aster', 'Observed resting.'], sourceIds: ['care:a'], calculations: [] };
for (const rows of [0, 4, 11]) {
  try {
    canonicalHistoricalRead({ readVersion: 'history-answer.v1', layout: 'csv', historyNarrative: null, limitation: null, table: { headers: ['Pet', 'Note'], rows: Array.from({ length: rows }, () => row) }, json: null, navigationActions: [], safetyLevel: 'normal', responseMode: 'practical_guidance', userIntent: 'history', relevantContextIds: ['care:a'] });
    results.push({ probe: 'csv_row_count', rows, accepted: true });
  } catch (error) { results.push({ probe: 'csv_row_count', rows, accepted: false, error: error.message }); }
}
for (const [from, to] of [[null, '2025-01-01'], ['2024-01-01', null]]) {
  try {
    const result = validateAskRequest({ ...base, operation: 'count', selection: 'summary', ordinal: null, from, to }, { ...context, currentMessage: 'Count Aster’s recorded vomiting episodes.' });
    results.push({ probe: 'open_episode_window', from, to, accepted: true, history: result.history });
  } catch (error) { results.push({ probe: 'open_episode_window', from, to, accepted: false, error: error.message }); }
}
console.log(JSON.stringify({ purpose: 'Current architecture behavior; not a live model test', results }, null, 2));
