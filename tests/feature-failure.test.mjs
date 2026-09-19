import assert from 'node:assert/strict';
import test from 'node:test';
import {featureFailureDetails} from '../app/lib/intelligence/feature-failure.ts';
test('feature errors expose only bounded classifications',()=>{
 const result=featureFailureDetails({stage:'primary_provider_failed',message:'private note',diagnostics:{
  providerStatus:400,providerErrorCode:'unsupported_parameter',validationDetails:'private input',model:'secret'}});
 assert.deepEqual(result,{failureStage:'primary_provider_failed',failureKind:'unsupported_parameter',providerStatus:400});
 assert.deepEqual(featureFailureDetails({stage:'private input',diagnostics:{providerStatus:Infinity,providerErrorCode:'private input'}}),
  {failureStage:'unknown',failureKind:'unknown',providerStatus:null});
});
test('incomplete output is distinguishable from provider access and limits',()=>{
 for(const [diagnostics,kind] of [[{providerErrorCode:'ASK_OUTPUT_INCOMPLETE'},'incomplete_output'],[{providerStatus:401},'provider_access'],[{providerStatus:429},'provider_limit'],[{timedOut:true},'timeout']])
  assert.equal(featureFailureDetails({diagnostics}).failureKind,kind);
});
