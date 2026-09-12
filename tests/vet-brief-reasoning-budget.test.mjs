import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/lib/ai/ask-reasoning.ts', import.meta.url), 'utf8');
const functionSource = source.slice(source.indexOf('export async function generateStructuredFeatureResponse'), source.indexOf('type ParsedUnifiedResponse')).replace('export async function', 'async function');
const compiled = ts.transpileModule(functionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test('feature reasoning and time budgets reach provider transport without changing default callers', async () => {
  const calls = [];
  const context = vm.createContext({
    createClient: () => ({}),
    getAskModelConfiguration: () => ({ primary: 'gpt-5.4-mini', fallback: null }),
    getAskProviderCooldown: () => ({ active: false }),
    runProviderRequest: async call => { calls.push(call); return call.parseOutput('{"okay":true}'); },
  });
  vm.runInContext(compiled, context);
  const base = { apiKey: 'test-only', input: { pet: 'synthetic' }, instructions: 'test', parse: value => value, schema: { type: 'object' }, schemaName: 'test' };
  await context.generateStructuredFeatureResponse(base);
  assert.equal(calls[0].timeoutMs, 25000);
  assert.equal(calls[0].request.reasoning, undefined);
  await context.generateStructuredFeatureResponse({ ...base, reasoningEffort: 'medium', timeoutMs: 35000, maxOutputTokens: 4096 });
  assert.equal(calls[1].timeoutMs, 35000);
  assert.equal(calls[1].request.reasoning.effort, 'medium');
  assert.equal(calls[1].request.max_output_tokens, 4096);
  assert.equal(JSON.parse(calls[1].request.input).pet, 'synthetic');
  await context.generateStructuredFeatureResponse({ ...base, timeoutMs: 90000 });
  assert.equal(calls[2].timeoutMs, 35000);
});

test('fallback keeps its existing deadline unless a reasoning budget is explicitly selected', async () => {
  const calls = [];
  class PipelineError extends Error {}
  const context = vm.createContext({
    createClient: () => ({}),
    getAskModelConfiguration: () => ({ primary: 'primary', fallback: 'fallback' }),
    getAskProviderCooldown: () => ({ active: false }),
    AskPipelineError: PipelineError,
    isRetryableProviderLimit: () => true,
    isRequestRateLimit: () => false,
    runProviderRequest: async call => { calls.push(call); if (call.stage === 'primary') throw new PipelineError(); return call.parseOutput('{"okay":true}'); },
  });
  vm.runInContext(compiled, context);
  const base = { apiKey: 'test-only', input: {}, instructions: 'test', parse: value => value, schema: {}, schemaName: 'test' };
  await context.generateStructuredFeatureResponse(base);
  assert.equal(calls[1].timeoutMs, 20000);
  await context.generateStructuredFeatureResponse({ ...base, reasoningEffort: 'medium', timeoutMs: 35000 });
  assert.equal(calls[3].timeoutMs, 35000);
});
