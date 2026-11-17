import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(specifier==='server-only') return {shortCircuit:true,url:'data:text/javascript,export default {}'};
  return next(specifier,context);
}});
const {requireApprovedAiModel}=await import('../../app/lib/ai/model-policy.ts');
const {getModelPrice,estimateProviderCostMicrodollars}=await import('../../app/lib/ai/usage-guard/cost-estimator.ts');
const {executeAdmittedProviderCall,executeAdmittedResponsesRequest}=await import('../../app/lib/ai/usage-guard/provider-call-budget.ts');
const {getAskModelConfiguration,getStructuredFeatureModelConfiguration}=await import('../../app/lib/ai/ask-reasoning.ts');

test('no prohibited or unknown model reaches provider, including test-context bypass', async t=>{
  const old=process.env.NODE_TEST_CONTEXT;process.env.NODE_TEST_CONTEXT='1';
  t.after(()=>{if(old===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=old});
  let dispatched=0;
  const forbidden=['gpt-5.4','gpt-5.4-mini','gpt-5.4-nano','gpt-5.4-2026-04-01','GPT-5.4','gpt-5.4-mini-latest','gpt-5.4_pro','gpt-5.4/alias','unreviewed-model','gpt-6-luna-latest',''];
  for(const model of forbidden){
    assert.throws(()=>requireApprovedAiModel(model),e=>e.code==='AI_TEMPORARILY_UNAVAILABLE'&&e.reason==='unapproved_provider_model');
    await assert.rejects(executeAdmittedProviderCall({model,maxOutputTokens:64,providerInput:{},invoke:async()=>{dispatched++;return {}}}),e=>e.reason==='unapproved_provider_model');
    await assert.rejects(executeAdmittedResponsesRequest({model,maxOutputTokens:64,request:{model,max_output_tokens:64},invoke:async()=>{dispatched++;return {}}}),e=>e.reason==='unapproved_provider_model');
  }
  assert.equal(dispatched,0);
});

test('configured primary and fallback cannot secretly select prohibited family',()=>{
  assert.equal(getAskModelConfiguration({}).primary,'gpt-6-luna');
  assert.equal(getStructuredFeatureModelConfiguration('vet_brief_content',{}).primary,'gpt-6.1-terra');
  assert.equal(getStructuredFeatureModelConfiguration('vet_brief_review',{}).primary,'gpt-6.1-terra');
  assert.throws(()=>getAskModelConfiguration({OPENAI_ASK_PRIMARY_MODEL:'gpt-5.4-mini'}),e=>e.reason==='unapproved_provider_model');
  assert.throws(()=>getAskModelConfiguration({OPENAI_ASK_FALLBACK_MODEL:'gpt-5.4'}),e=>e.reason==='unapproved_provider_model');
  assert.throws(()=>getAskModelConfiguration({OPENAI_ASK_RESPONSE_MODEL:'gpt-5.4-nano'}),e=>e.reason==='unapproved_provider_model');
});

test('approved non-5.4 models have verified, bounded standard prices',()=>{
  for(const model of ['gpt-6-luna','gpt-6.1-terra'])requireApprovedAiModel(model);
  assert.equal(getModelPrice('gpt-6-luna').inputMicrodollarsPerMillionTokens,100_000);
  assert.equal(getModelPrice('gpt-6-luna').outputMicrodollarsPerMillionTokens,500_000);
  assert.equal(getModelPrice('gpt-6.1-terra').inputMicrodollarsPerMillionTokens,1_000_000);
  assert.equal(getModelPrice('gpt-6.1-terra').outputMicrodollarsPerMillionTokens,5_000_000);
  assert.equal(getModelPrice('gpt-5.4'),null);
  assert.equal(getModelPrice('gpt-5.4-mini'),null);
  assert.equal(estimateProviderCostMicrodollars('gpt-6-luna',{inputTokens:1000,cachedInputTokens:0,outputTokens:200}),200);
  assert.equal(estimateProviderCostMicrodollars('gpt-6.1-terra',{inputTokens:1000,cachedInputTokens:0,outputTokens:200}),2000);
});
