import {bindRemovePlan,resolveRemovePlan} from '../../app/lib/furvise-brain/remove-job.ts';
import {prepareBoundRemoveAction} from '../../app/lib/application-actions/planner.ts';
export async function removeAction({petId='pet',sourceId='source',recordId='11000000-0000-4000-8000-000000000101',requestId='request'}={}) {
 const time='2026-09-22T00:00:00Z',text='Remove the supplied record.';
 const plan=bindRemovePlan({operation:'remove',domain:'care_history',target:{kind:'exact_record',ref:'given'},petName:'Subject',instructionQuote:text},
 {id:sourceId,role:'user',text,createdAt:'2026-09-23T00:00:00Z'},{id:petId,name:'Subject'},
 {ownerId:'owner',references:[{ref:'given',recordId,ownerId:'owner',petId,updatedAt:time,createdAt:time,body:'Original',eventAt:time}]});
 const q={select(){return q},eq(){return q},is(){return q},maybeSingle:async()=>({data:{id:recordId,updated_at:time},error:null})};
 return prepareBoundRemoveAction(await resolveRemovePlan(plan,{from(){return q}},'owner'),requestId);
}
