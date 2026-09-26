import assert from "node:assert/strict";
import test from "node:test";
import { canonicalWriteOperation, confirmFurviseWriteReceipt } from "../app/lib/furvise-brain/write-contract.ts";

const mutationKinds = {
  "care_history.add":"append",
  "care_history.edit":"replace",
  "care_history.remove":"remove",
  "care_state.resolve":"state_transition",
  "care_state.reopen":"state_transition",
  "pet.update_profile":"profile",
  "memory.set_preference":"preference",
  "memory.forget_preference":"preference",
  "pet.mark_deceased":"lifecycle",
  "pet.mark_active":"lifecycle",
  "pet.archive":"lifecycle",
  "pet.delete_permanently":"remove",
};

test("every executable V1 mutation kind requires a canonical Heart receipt", () => {
  for (const [kind,operation] of Object.entries(mutationKinds))
    assert.equal(canonicalWriteOperation(kind),operation,kind);
});

test("receipt confirmation binds the entire immutable authorized action", () => {
  const authorized = {
    id:"source-action",kind:"pet.update_profile",petId:"pet",sourceMessageId:"source",
    safetyClass:"LOW_RISK_REVERSIBLE",mutationClass:"mutation",confirmationPolicy:"explicit_intent",
    authorizationScope:"owned_pet",explicitIntent:true,status:"proposed",
    input:{field:"weight",value:"29.4 kg",title:null,detail:null,category:null,target:"selected"},
    evidence:"29.4 kg",label:"Update profile",description:"Update weight",href:null,resultMessage:null,errorMessage:null,
    fieldMutationJob:{operation:"set_field",domain:"pet_profile",field:"weight",petId:"pet",sourceMessageId:"source",
      instruction:{start:0,end:12,text:"29.4 kg"},valueSource:{start:0,end:7,text:"29.4 kg"},value:{kind:"weight",value:29.4,unit:"kg"}},
  };
  const receipt = {...authorized,id:"capability",status:"succeeded",resultMessage:"The pet profile was updated."};
  assert.deepEqual(confirmFurviseWriteReceipt({
    operationId:"capability",authorized,returned:receipt,persistedStatus:"succeeded",persistedReceipt:receipt,
  }),{operation:"profile",operationId:"capability",petId:"pet",sourceMessageId:"source",status:"succeeded"});

  const widened = {...receipt,fieldMutationJob:{...receipt.fieldMutationJob,field:"name"}};
  assert.throws(()=>confirmFurviseWriteReceipt({
    operationId:"capability",authorized,returned:widened,persistedStatus:"succeeded",persistedReceipt:widened,
  }),/FURVISE_WRITE_RECEIPT_UNCONFIRMED/);
});
