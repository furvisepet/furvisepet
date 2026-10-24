// Existing required full-schema DB gate runs these exact production CAS/role checks.
// No provider, network backend or application credentials. Only disposable SQL storage.
import assert from "node:assert/strict";
export async function verifyCareEntryEditContract(db) {
 const id=n=>"92000000-0000-4000-8000-"+String(n).padStart(12,"0");
 let checks=0;const ok=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
 const owner=id(1),foreign=id(2),pet=id(10),otherPet=id(11),foreignPet=id(12),entry=id(20),untouched=id(21);
 await db.exec("reset role");
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[owner]);
 await db.query("insert into auth.users(id) values($1),($2)",[owner,foreign]);
 await db.query("insert into public.dog_profiles(id,user_id,name) values($1,$2,'Synthetic edit subject')",[pet,owner]);
 await assert.rejects(()=>db.query("insert into public.dog_profiles(id,user_id,name) values($1,$2,'Over free limit')",[otherPet,owner]),/PET_LIMIT_REACHED/);checks++;
 // Existing account_entitlements_verification.sql fixture, isolated DB only:
 // use a valid synthetic internal-QA grant, never disable the real limit trigger.
 await db.query("insert into public.account_access_grants(user_id,access_role,enabled,reason,granted_by) values($1,'internal_qa',true,'Disposable saved-note contract qualification',$2)",[owner,foreign]);
 await db.query("insert into public.dog_profiles(id,user_id,name) values($1,$2,'Other owned subject')",[otherPet,owner]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[foreign]);
 await db.query("insert into public.dog_profiles(id,user_id,name) values($1,$2,'Foreign synthetic subject')",[foreignPet,foreign]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await db.query("insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,occurred_at,care_event_metadata) values($1,$2,$3,'general','Synthetic QA','Original synthetic note','2026-01-01T12:00:00Z',$4::jsonb),($5,$2,$3,'general','Unrelated QA','Preserve this entry','2026-01-01T12:00:00Z',$4::jsonb)",[entry,owner,pet,JSON.stringify({syntheticContract:"GQ"}),untouched]);
 const read=async (target=entry)=>(await db.query("select to_jsonb(e) as entry from public.pet_care_entries e where id=$1",[target])).rows[0]?.entry;
 const before=await read(),otherBefore=await read(untouched);
 const apply=async({target=entry,subject=pet,version=before.updated_at,note="Revised synthetic note"}={})=>(await db.query("select to_jsonb(e) as entry from public.update_my_care_entry($1::uuid,$2::uuid,$3::timestamptz,$4::text,$5::text,$6::text,$7::text,$8::timestamptz) e",[target,subject,version,before.category,before.title,note,before.severity,before.occurred_at])).rows[0]?.entry;
 const deny=async(fn,code)=>{await assert.rejects(fn,e=>e.code===code);checks++;};
 ok(await read(),before,"read/proposal alone has no mutation");
 await db.exec("set role authenticated");
 const saved=await apply();ok(saved.id,entry);ok(saved.user_id,owner);ok(saved.pet_profile_id,pet);ok(saved.note,"Revised synthetic note");assert.notEqual(saved.updated_at,before.updated_at);checks++;
 const stable=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!["note","updated_at"].includes(k)));
 ok(stable(saved),stable(before),"normal edit preserves all unrelated original row fields");ok(await read(untouched),otherBefore,"unrelated entry exact");
 await deny(()=>apply({note:"Stale must never overwrite"}),"40001");ok(await read(),saved);
 await deny(()=>apply({subject:otherPet,version:saved.updated_at}),"P0002");
 await deny(()=>apply({target:id(99),version:saved.updated_at}),"P0002");
 await deny(()=>apply({version:null}),"22023");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[foreign]);
 await deny(()=>apply({subject:pet,version:saved.updated_at}),"P0002");
 await db.query("select set_config('request.jwt.claim.sub','',false)");
 await deny(()=>apply({version:saved.updated_at}),"42501");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await db.exec("set role anon");
 await deny(()=>apply({version:saved.updated_at}),"42501");
 await db.exec("reset role");await db.exec("set role authenticated");
 // Competing requests in the single embedded engine serialize at the real RPC;
 // this verifies CAS outcomes, not native multi-session lock contention.
 const contenders=await Promise.allSettled(["First synthetic contender","Second synthetic contender"].map(note=>apply({version:saved.updated_at,note})));
 ok(contenders.filter(r=>r.status==="fulfilled").length,1);
 ok(contenders.filter(r=>r.status==="rejected").map(r=>r.reason.code),["40001"]);
 const winner=contenders.find(r=>r.status==="fulfilled").value;
 ok(await read(),winner);ok(await read(untouched),otherBefore);
 // An exact stale replay/new HTTP key still cannot perform a second write.
 await deny(()=>apply({version:saved.updated_at,note:"Duplicate confirmation"}),"40001");ok(await read(),winner);
 await db.exec("reset role");
 await db.query("update public.pet_care_entries set deleted_at=clock_timestamp(),deletion_reason='Synthetic contract tombstone' where id=$1",[entry]);
 await db.exec("set role authenticated");await deny(()=>apply({version:winner.updated_at}),"P0002");
 await db.exec("reset role");
 for(const role of["anon","service_role"])ok((await db.query("select has_function_privilege($1,'public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz)','execute') as allowed",[role])).rows[0].allowed,false);
 ok((await db.query("select has_function_privilege('authenticated','public.update_my_care_entry(uuid,uuid,timestamptz,text,text,text,text,timestamptz)','execute') as allowed")).rows[0].allowed,true);
 ok((await db.query("select has_table_privilege('authenticated','public.pet_care_entries','UPDATE') as allowed")).rows[0].allowed,false);
 await db.query("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
 console.log(checks+" PostgreSQL saved-note edit/CAS assertions passed");
 return checks;
}
