import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
const {buildAskContext}=await import('../app/lib/ai/ask-reasoning.ts');
const {eligibleAnswerSources,evidenceSource}=await import('../app/lib/intelligence/ask-evidence.ts');
const {derivePublicationAuthority}=await import('../app/lib/intelligence/publication-authority.ts');
const pet={id:'pet-a',user_id:'owner',name:'Milo',species:'dog',breed:'Stored breed',sex:'male',weight_value:4.71,weight_unit:'kg',age_value:4,age_unit:'years',updated_at:'2026-09-01T00:00:00Z'};
function context({profile=pet,fields=['weight'],question='Saved weight',format='prose'}={}){
 const evidence={version:'ask-evidence.v1',scope:{authorizedPetIds:['pet-a'],requestText:question,readOnlyRecall:true,status:'resolved',requestKind:'ordinary'},sources:[evidenceSource('pet-a','profile',['pet-a'])],losses:[],represented:[],representation:'complete',verifiedFacts:[],completeness:{retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown'},interpretation:{operation:'recall',request:{mode:'read',evidenceBasis:'saved_profile',profileFields:fields,referenceTurnIds:[],readTicket:null,outputFormat:format}}};
 return buildAskContext({profiles:[profile],question,careEntries:[],recentUpdates:[],memories:[],conversationTurns:[],productFeedback:[],evidenceContract:evidence},false);
}
test('profile context retains raw stored decimal and row timestamp, not measurement time',()=>{
 const r=context().records.find(r=>r.kind==='weight');
 assert.equal(r.value,'4.71 kg');assert.equal(r.createdAt,pet.updated_at);assert.equal(r.occurredAt,null);
});
test('unmigrated mixed-field context retains its legacy unit default',()=>{
 assert.equal(context({fields:['weight','age'],profile:{...pet,weight_unit:null}}).records.find(r=>r.kind==='weight').value,'4.71 lb');
});
test('loaded null produces scoped not-recorded evidence; omitted property produces no value',()=>{
 assert.match(context({profile:{...pet,weight_value:null}}).records.find(r=>r.kind==='weight').value,/Not recorded in the saved profile/);
 const absent={...pet};delete absent.weight_value;
 assert.equal(context({profile:absent}).records.some(r=>r.kind==='weight'),false);
});
test('unmigrated mixed-field context retains existing-policy authority',()=>{
 const c=context({fields:['weight','age']});assert.equal(derivePublicationAuthority(c.promptContext.evidenceContract),null);
 assert.ok(eligibleAnswerSources(c.promptContext.evidenceContract).some(s=>s.sourceId==='profile:pet-a:weight'));
});
test('unmigrated mixed-field wording still uses existing compatibility expansion',()=>{
 const plain=context({fields:['species','age'],question:'Saved species'});
 const extra=context({fields:['species','age'],question:'Saved species and breed'});
 assert.equal(plain.records.some(r=>r.kind==='breed'),false);
 assert.equal(extra.records.some(r=>r.kind==='breed'),true);
});
test('typed nonnumeric profile sources retain explicit field identities',()=>{
 const rows=context({fields:['species','sex','breed'],question:'Saved details'}).records;
 assert.deepEqual(rows.map(r=>[r.kind,r.value]).sort(),[['breed','Stored breed'],['sex','male'],['species','dog']]);
});
test('profile context values do not depend on output format at this construction boundary',()=>{
 const a=context({format:'prose'}).records,b=context({format:'table'}).records;
 assert.deepEqual(a,b);
});
test('source eligibility rejects represented profile belonging to another subject',()=>{
 const c=context(),e=c.promptContext.evidenceContract;
 e.represented.push({sourceId:'profile:pet-b:weight',petId:'pet-b',sourceType:'profile',field:'value',start:0,end:4,text:'9 kg'});
 e.sources.push(evidenceSource('pet-b','profile',['pet-b']));
 assert.equal(eligibleAnswerSources(e).some(s=>s.petId==='pet-b'),false);
});
