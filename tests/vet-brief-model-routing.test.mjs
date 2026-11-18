import test from 'node:test';
import assert from 'node:assert/strict';
import {getStructuredFeatureModelConfiguration} from '../app/lib/ai/ask-reasoning.ts';
import {estimateProviderCostMicrodollars} from '../app/lib/ai/usage-guard/cost-estimator.ts';

test('vet brief synthesis/review use the approved mini without full-size escalation',()=>{
 const env={OPENAI_ASK_PRIMARY_MODEL:'gpt-5.4-mini',OPENAI_ASK_FALLBACK_MODEL:'gpt-5.4-mini'};
 for(const name of ['vet_brief_content','vet_brief_review']) assert.deepEqual(getStructuredFeatureModelConfiguration(name,env),{primary:'gpt-5.4-mini',fallback:null,primaryUsedDefault:false});
 for(const name of ['vet_brief_evidence_plan','ask_response','unknown']) assert.equal(getStructuredFeatureModelConfiguration(name,env).primary,'gpt-5.4-mini');
 assert.equal(estimateProviderCostMicrodollars('gpt-5.4-mini',{inputTokens:1000,cachedInputTokens:200,outputTokens:500}),2865);
 assert.equal(estimateProviderCostMicrodollars('unpriced',{inputTokens:1000,outputTokens:500}),null);
});
