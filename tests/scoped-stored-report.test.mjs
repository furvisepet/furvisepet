import test from 'node:test';
import assert from 'node:assert/strict';
import {certifyScopedStoredReport,matchesScopedStoredReport,bindScopedReportSidecar,carryScopedReportSidecar,confirmScopedReportTurn,getScopedReportSidecar} from '../app/lib/intelligence/scoped-stored-report.ts';
const source=()=>({id:'source',user_id:'owner',pet_profile_id:'pet',category:'general',title:null,note:'The evening routine was calm.',severity:null,occurred_at:'2026-09-15T12:00:00Z',created_at:'2026-09-15T14:00:00Z',updated_at:'2026-09-15T14:00:00Z',deleted_at:null});
const ticket=()=>({authority:'stored_report',operation:'read',subjects:{petIds:['pet']},temporal:{from:'2026-09-15T00:00:00Z',to:'2026-09-16T00:00:00Z',anchor:null,calendar:null},predicates:[{kind:'text_any',terms:['routine']}],outputs:{completeness:'sufficient',ordering:'asc',limit:null,strategy:null}});
const page=()=>({sources:[source()],claims:[],relations:[],lineage:[],withheld_claim_ids:[],withheld_source_ids:[],truncated:false});
async function read({candidate=source(),p=page(),t=ticket(),ownedPetIds=['pet'],userId='owner'}={}) {
 let calls=0;
 const db={rpc(name,args){calls++;assert.equal(name,'read_ask_history_correction_page');assert.deepEqual(args.p_care_ids,['source']);assert.deepEqual(args.p_seed_pet_ids,[]);return {abortSignal:async()=>({data:p,error:null})};}};
 return {proof:await certifyScopedStoredReport({db,userId,ownedPetIds,ticket:t,candidate,deadline:Date.now()+10000}),calls};
}
test('bounded stored wording is rechecked and tied to exact ticket and owner',async()=>{
 const t=ticket(),{proof,calls}=await read({t});assert.equal(calls,1);assert.equal(proof.body,source().note);
 assert.equal(proof.kind,'scoped_stored_report.v1');assert.ok(matchesScopedStoredReport(proof,'owner',t));
 assert.equal(matchesScopedStoredReport(structuredClone(proof),'owner',t),false);
 assert.equal(matchesScopedStoredReport(proof,'foreign',t),false);
 const changed=structuredClone(t);changed.predicates[0].terms=['other'];assert.equal(matchesScopedStoredReport(proof,'owner',changed),false);
});
for(const [name,mutate] of [
 ['withheld source',p=>p.withheld_source_ids=['source']],
 ['withheld claim',p=>p.withheld_claim_ids=['claim']],
 ['truncated',p=>p.truncated=true],
 ['missing marker',p=>delete p.withheld_source_ids],
 ['missing source',p=>p.sources=[]],
 ['extra source',p=>p.sources.push(source())],
 ['foreign source',p=>p.sources[0].user_id='foreign'],
 ['deleted source',p=>p.sources[0].deleted_at='2026-09-16T00:00:00Z'],
 ['changed text',p=>p.sources[0].note='Changed'],
 ['changed version',p=>p.sources[0].updated_at='2026-09-16T00:00:00Z'],
 ['linked claim not yet qualified',p=>p.claims=[{id:'claim'}]],
 ['linked edge not yet qualified',p=>p.relations=[{id:'edge'}]],
]) test('reject '+name,async()=>{const p=page();mutate(p);assert.equal((await read({p})).proof,null);});
for(const [name,change] of [
 ['foreign candidate',x=>x.candidate.user_id='foreign'],
 ['unowned pet',x=>x.ownedPetIds=[]],
 ['outside date',x=>x.candidate.occurred_at='2025-09-15T12:00:00Z'],
 ['predicate mismatch',x=>x.t.predicates[0].terms=['medication']],
 ['exhaustive request',x=>x.t.outputs.completeness='exhaustive'],
 ['effective fact',x=>x.t.authority='effective_fact'],
 ['selection',x=>x.t.selection={groupBy:['subject'],union:[]}],
 ['since-event',x=>x.t.operation='read_since_event'],
]) test('reject '+name+' before RPC',async()=>{const x={candidate:source(),t:ticket(),ownedPetIds:['pet']};change(x);const r=await read(x);assert.equal(r.proof,null);assert.equal(r.calls,0);});

test('sidecar requires the exact turn, request, and unmodified server clone',async()=>{
 const t=ticket(), {proof}=await read({t}), request={readTicket:t,question:'question'};
 const original={status:'partial'}, clone=structuredClone(original);
 bindScopedReportSidecar(original,{proof,userId:'owner',ticket:t,request,message:'question',turnId:'turn'});
 carryScopedReportSidecar(original,clone);
 confirmScopedReportTurn(clone,'other');assert.equal(getScopedReportSidecar(clone,request,'question'),null);
 confirmScopedReportTurn(clone,'turn');assert.equal(getScopedReportSidecar(clone,request,'question'),proof);
 assert.equal(getScopedReportSidecar(clone,{...request,question:'different'},'question'),null);
 assert.equal(getScopedReportSidecar(clone,request,'different'),null);
 clone.status='complete';assert.equal(getScopedReportSidecar(clone,request,'question'),null);
 assert.throws(()=>carryScopedReportSidecar(clone,structuredClone(clone)),/ASK_SCOPED_REPORT_CLONE_CHANGED/);
});

test('yearless cross-year request has no scoped report proof without a concrete bound window',async()=>{
 const t=ticket();t.temporal.from=null;t.temporal.to=null;
 const result=await read({t});assert.equal(result.proof,null);assert.equal(result.calls,0);
});
