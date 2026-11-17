import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
  if (specifier==='server-only') return {shortCircuit:true,url:'data:text/javascript,export default {}'};
  return next(specifier,context);
}});
const {FURVISE_APPROVED_AI_MODELS,requireApprovedAiModel}=await import('../../app/lib/ai/model-policy.ts');
const {OPENAI_ANALYSIS_MODEL}=await import('../../app/lib/ai/config.ts');
const {getModelPrice,estimateProviderCostMicrodollars}=await import('../../app/lib/ai/usage-guard/cost-estimator.ts');
const {executeAdmittedProviderCall,executeAdmittedResponsesRequest}=await import('../../app/lib/ai/usage-guard/provider-call-budget.ts');
const {getAskModelConfiguration,getStructuredFeatureModelConfiguration}=await import('../../app/lib/ai/ask-reasoning.ts');

test('mini is the sole approved, priced ordinary and vet model',()=>{
  assert.deepEqual([...FURVISE_APPROVED_AI_MODELS],['gpt-5.4-mini']);
  assert.equal(OPENAI_ANALYSIS_MODEL,'gpt-5.4-mini');
  assert.doesNotThrow(()=>requireApprovedAiModel('gpt-5.4-mini'));
  assert.equal(getAskModelConfiguration({}).primary,'gpt-5.4-mini');
  assert.equal(getAskModelConfiguration({}).fallback,null);
  for(const feature of ['ask_response','vet_brief_content','vet_brief_review','vet_brief_evidence_plan']){
    const config=getStructuredFeatureModelConfiguration(feature,{});
    assert.equal(config.primary,'gpt-5.4-mini',feature);
    assert.equal(config.fallback,null,feature);
  }
});

test('full 5.4, Terra, unpriced aliases and unknown expensive models fail closed even in test context',async t=>{
  const old=process.env.NODE_TEST_CONTEXT;process.env.NODE_TEST_CONTEXT='1';
  t.after(()=>{if(old===undefined)delete process.env.NODE_TEST_CONTEXT;else process.env.NODE_TEST_CONTEXT=old});
  let actualCalls=0;
  const forbidden=['gpt-5.4','gpt-5.4-2026-03-05','gpt-5.4-pro','gpt-5.4_pro','gpt-5.4-nano','gpt-5.4-mini-latest','gpt-5.4-mini-2026-03-17','gpt-6.1-terra','gpt-6-luna','gpt-6-astra','unreviewed-model','',null];
  for(const model of forbidden){
    assert.throws(()=>requireApprovedAiModel(model),e=>e.code==='AI_TEMPORARILY_UNAVAILABLE'&&e.reason==='unapproved_provider_model',String(model));
    await assert.rejects(executeAdmittedProviderCall({model,maxOutputTokens:64,providerInput:{},invoke:async()=>{actualCalls++;return {}}}),e=>e.reason==='unapproved_provider_model',String(model));
    await assert.rejects(executeAdmittedResponsesRequest({model,maxOutputTokens:64,request:{model,max_output_tokens:64},invoke:async()=>{actualCalls++;return {}}}),e=>e.reason==='unapproved_provider_model',String(model));
  }
  assert.equal(actualCalls,0);
});

test('environment primary and fallback can select only mini, not expensive repair/review paths',()=>{
  assert.equal(getAskModelConfiguration({OPENAI_ASK_PRIMARY_MODEL:'gpt-5.4-mini'}).primary,'gpt-5.4-mini');
  assert.equal(getAskModelConfiguration({OPENAI_ASK_PRIMARY_MODEL:'gpt-5.4-mini',OPENAI_ASK_FALLBACK_MODEL:'gpt-5.4-mini'}).fallback,'gpt-5.4-mini');
  for(const key of ['OPENAI_ASK_MODEL','OPENAI_ASK_PRIMARY_MODEL','OPENAI_ASK_FALLBACK_MODEL']){
    for(const model of ['gpt-5.4','gpt-6.1-terra','gpt-6-astra']){
      assert.throws(()=>getAskModelConfiguration({[key]:model}),e=>e.reason==='unapproved_provider_model',key+':'+model);
    }
  }
  for(const feature of ['vet_brief_content','vet_brief_review']){
    assert.equal(getStructuredFeatureModelConfiguration(feature,{OPENAI_ASK_PRIMARY_MODEL:'gpt-6.1-terra'}).primary,'gpt-5.4-mini');
  }
});

test('mini pricing is official and all forbidden full models have no cost entry',()=>{
  const p=getModelPrice('gpt-5.4-mini');
  assert.equal(p.inputMicrodollarsPerMillionTokens,750_000);
  assert.equal(p.cachedInputMicrodollarsPerMillionTokens,75_000);
  assert.equal(p.outputMicrodollarsPerMillionTokens,4_500_000);
  assert.equal(estimateProviderCostMicrodollars('gpt-5.4-mini',{inputTokens:1000,cachedInputTokens:0,outputTokens:200}),1650);
  for(const model of ['gpt-5.4','gpt-6.1-terra','gpt-6-luna','unreviewed-model']){
    assert.equal(getModelPrice(model),null);
    assert.equal(estimateProviderCostMicrodollars(model,{inputTokens:1000,outputTokens:1000}),null);
  }
});
