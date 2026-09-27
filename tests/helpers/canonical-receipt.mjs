import {fixtureSourceSemantics} from '../../scripts/audits/helpers/source-semantics-fixture.mjs';
import {id} from './canonical-replace.mjs';
const {validateAppendJob}=await import('../../app/lib/furvise-brain/append-job.ts');
const {getFurviseActionPolicy}=await import('../../app/lib/application-actions/policy.ts');
const {buildFurvisePlanningContext}=await import('../../app/lib/intelligence/planning-context.ts');
const {bindStoredRead}=await import('../../app/lib/furvise-brain/stored-read.ts');
const {executeStoredRead}=await import('../../app/lib/furvise-brain/stored-read-organ.ts');
export {id};
export function receiptFixture({status='succeeded',deleted=false,future=false}={}){
 const owner=id(1),pet={id:id(2),user_id:owner,name:'Quartz',species:'dog',lifecycle_status:'active'};
 const source={id:id(3),role:'user',text:'Keep these entries: First exact observation. Second \u03b1 observation.',createdAt:'2026-08-01T12:00:00Z'};
 const appendJob=validateAppendJob({operation:'append',petName:pet.name,companionQuote:null,items:[
  {bodyQuote:'First exact observation.',dateQuote:null,occurredAt:null},
  {bodyQuote:'Second \u03b1 observation.',dateQuote:null,occurredAt:null},
 ]},source,[pet],owner);
 const action={id:'source-action',kind:'care_history.add',petId:pet.id,sourceMessageId:source.id,
  ...getFurviseActionPolicy('care_history.add'),label:'Save',description:'Save requested entries',
  evidence:source.text,href:null,explicitIntent:false,appendJob,status:'proposed',resultMessage:null,errorMessage:null,
  input:{field:null,value:null,title:'Owner note',detail:null,category:'general',target:'specified'}};
 const cap={id:id(5),user_id:owner,pet_profile_id:pet.id,source_message_id:source.id,assistant_message_id:id(6),
  action_payload:action,status,receipt:status==='pending'?null:{...action,id:id(5),status,resultMessage:status==='succeeded'?'Saved.':null,errorMessage:null},
  created_at:source.createdAt,expires_at:'2026-08-02T00:00:00Z'};
 const care=appendJob.items.map((item,i)=>({id:id(20+i),user_id:owner,pet_profile_id:pet.id,category:'general',title:'Owner note',
  note:item.body.text,occurred_at:future?'2026-10-01T00:00:00Z':source.createdAt,created_at:source.createdAt,updated_at:source.createdAt,
  deleted_at:deleted?'2026-09-01T00:00:00Z':null,intelligence_source_message_id:source.id,
  care_event_metadata:{sourceSpanId:item.body.id},canonical_ask_isolated:true}));
 const messages=Array.from({length:45},(_,i)=>({id:id(100+i),user_id:owner,conversation_id:id(7),role:'user',
  user_text:i===44?'Show the operation outcome.':'Unrelated dialogue '+i,sequence_number:i+2,created_at:'2026-09-17T12:00:00Z'}));
 messages.unshift({id:source.id,user_id:owner,conversation_id:id(7),role:'user',user_text:source.text,sequence_number:1,created_at:source.createdAt});
 const current=messages.at(-1);
 const tables={dog_profiles:[pet],ask_conversations:[{id:id(7),user_id:owner,pet_profile_id:pet.id}],
  ask_conversation_messages:messages,ask_action_capabilities:[cap],pet_care_entries:care};
 const queries=[],fail=new Set();
 const imported=care.map(r=>fixtureSourceSemantics(r));
 const db={from(table){
  const filters=[],orders=[];let limit=Infinity,offset=0;const q={
   select(){return q},or(){if((tables[table]||[]).length)throw Error('Unexpected nonempty OR fixture');return q},returns(){return q},abortSignal(){return q},
   eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},
   in(k,vs){filters.push(r=>vs.includes(r[k]));return q},not(k,op,v){filters.push(r=>r[k]!==v);return q},
   gte(k,v){filters.push(r=>r[k]>=v);return q},lt(k,v){filters.push(r=>r[k]<v);return q},lte(k,v){filters.push(r=>r[k]<=v);return q},
   range(a,b){offset=a;limit=b-a+1;return q},order(k,{ascending}){orders.push([k,ascending]);return q},limit(n){limit=n;return q},
   then(resolve,reject){queries.push(table);let rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));
    rows=[...rows].sort((a,b)=>{for(const [k,asc]of orders){const n=typeof a[k]==='number'?a[k]-b[k]:String(a[k]).localeCompare(String(b[k]));if(n)return asc?n:-n;}return 0;});
    return Promise.resolve(fail.has(table)?{data:null,error:{code:'UNAVAILABLE'}}:{data:rows.slice(offset,offset+limit),count:rows.length,error:null}).then(resolve,reject);
   },async maybeSingle(){const r=await q;return {...r,data:r.data?.length===1?r.data[0]:null};}
  };return q;
 },rpc(name,args){if(name==='read_ask_source_semantics')return {abortSignal:async()=>({error:null,data:{
  complete:true,limit:76,claims:imported.filter(c=>args.p_source_ids.includes(c.source_message_lineage_id)),
  sources:care.filter(r=>args.p_source_ids.includes(r.id)&&!r.deleted_at)}})};
 if(name==='read_ask_history_correction_page')return {abortSignal(){return this},then(resolve,reject){return Promise.resolve({data:{claims:[],relations:[],lineage:[],sources:care.filter(r=>r.user_id===owner&&args.p_care_ids.includes(r.id)),truncated:false},error:null}).then(resolve,reject)}};
 return Promise.resolve({data:[],error:null});}};
 async function context(){
  globalThis.__fidelityDB=db;
  return buildFurvisePlanningContext({supabase:db,userId:owner,petId:pet.id,conversationId:id(7),currentMessage:current.user_text,
   sourceMessageId:current.id,locale:'en',timeZone:'UTC'});
 }
 function request(ctx,scope='owner'){
  return bindStoredRead({operation:'read',domain:'operation_receipt',scope,reference:ctx.storedReadReferences[0]?.ref??null,projection:'records'},
   {ownerId:owner,subjectIds:scope==='owner'?[]:[pet.id],references:ctx.storedReadReferences});
 }
 async function execute(p){return executeStoredRead(p,{ownerId:owner,ownedPetIds:tables.dog_profiles.map(p=>p.id),db,capabilityDb:db,now:new Date('2026-09-17T12:00:00Z')});}
 return {owner,pet,source,cap,care,messages,tables,db,fail,queries,context,request,execute};
}
