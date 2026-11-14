import test from "node:test";
import assert from "node:assert/strict";
import {componentSelectionSchema,validateTaskPlan,decodeComponentSelection} from "../app/lib/ask-read-only/task-components.mjs";
import {decodeClinicalSelection} from "../app/lib/ask-read-only/clinical-policy.mjs";
import {runReadOnlyAsk} from "../app/lib/ask-read-only/core.mjs";
import {APP_CAPABILITIES,WORKFLOW_INSTRUCTIONS} from "../app/lib/ask-read-only/app-capabilities.mjs";
const context={pets:[{handle:"p1"}],references:[]};
const schema=componentSelectionSchema({properties:{},required:[]},context).properties.taskPlan.items;
const accepts=t=>schema.anyOf.some(v=>Object.entries(v.properties).every(([key,s])=>!s.enum||s.enum.includes(t[key])));
const task=extra=>({id:"t1",kind:"general_guidance",combineHistory:false,needsHistory:false,needsOwnerFacts:false,includeSourceDates:false,recordMode:"none",workflow:"none",pets:[],reference:null,missing:[],...extra});
const kinds=["saved_content","saved_continuation","owner_observations","calculation","vet_brief","clarification","general_guidance","clinical_guidance","workflow"];
const workflows=["none","create_care_note","find_care_note","care_photo_attachment","other"];
for(const needsHistory of [false,true])test("provider schema matches decoder workflow relation with history="+needsHistory,()=>{
 for(const kind of kinds)for(const workflow of workflows){
  const t=task({kind,workflow,needsHistory,recordMode:needsHistory?"collection":"none"});
  const valid=(kind==="workflow")===(workflow!=="none");
  assert.equal(accepts(t),valid,JSON.stringify(t));
  if(valid)assert.doesNotThrow(()=>validateTaskPlan([t],context));
  else assert.throws(()=>validateTaskPlan([t],context),/COMPONENT_CONTRACT/);
 }
});
test("read-only mutation capabilities are explicit and instructions agree on task kind",()=>{
 assert.equal(APP_CAPABILITIES.ask.canSave,false);assert.equal(APP_CAPABILITIES.ask.canEdit,false);assert.equal(APP_CAPABILITIES.ask.canDelete,false);
 assert.match(WORKFLOW_INSTRUCTIONS,/general_guidance task with workflow=none/);
});
for(const verb of ["delete","edit","save","upload"])test("two-call capability refusal for "+verb+" needs no record IO or app navigation",async()=>{
 const pet={id:"private-pet-123456789",ownerId:"owner",name:"Willow",species:"cat"};
 const safety={medicationIntent:"none",referent:"clear",missingContext:[],careContext:"none",eventAssessments:[]};
 let calls=0;let reads=0;
 const result=await runReadOnlyAsk({ownerId:"owner",selectedPetId:pet.id,pets:[pet],dialogue:[],question:"Please "+verb+" Willow's care notes for me.",now:"2026-11-14T12:00:00Z",timeZone:"UTC"},{
  provider:async(req,phase)=>{
   calls++;
   if(phase==="read_selection"){
    assert.match(req.instructions,/A request for Ask to save, edit, delete or upload is a capability question/);
    assert.equal(req.context.appCapabilities.ask.canDelete,false);
    return decodeComponentSelection({safety,reads:[],draft:"",historyIntent:{requested:false,timeBasis:"event",pet:null},workflowIntent:"none",taskPlan:[task({pets:["p1"]})]},req.tools,req.context,decodeClinicalSelection);
   }
   return {components:[{kind:"general",text:"Ask is read-only and cannot change saved records. No records were changed.",sources:[]}],quotes:[],sources:[],calculations:[],replyType:"refusal",presentation:{sourceDates:[],contextRequired:false},clinicalReview:{assessment:safety,ownerStatementRefs:[],observationFields:[]},appHelp:{intent:"none",pet:null},completion:[{task:"t1",status:"complete",reason:"none",componentIndexes:[0],sources:[],ownerFacts:[],historyFacts:[]}]};
  },read:async()=>{reads++;throw new Error("Unexpected private read");}
 });
 assert.equal(calls,2);assert.equal(reads,0);assert.match(result.answer.answer,/read-only/);assert.doesNotMatch(result.answer.answer,/Which screen|To add a text note|Open Today/);
 assert.equal(result.answer.replyType,"refusal");
});

test("source-free native task variants cannot emit a single-record prerequisite",()=>{
 for(const variant of schema.anyOf)if(variant.properties.needsHistory.enum?.includes(false))
  assert.ok(!variant.properties.missing.items.enum.includes("which_record"));
 for(const kind of ["general_guidance","saved_content","clarification"]){
  const plan=validateTaskPlan([task({kind,missing:["which_record","pet","year"]})],context);
  assert.deepEqual(plan[0].missing,["pet","year"]);
 }
 const actual=validateTaskPlan([task({kind:"saved_content",needsHistory:true,recordMode:"single",missing:["which_record"]})],context);
 assert.deepEqual(actual[0].missing,["which_record"]);
});
