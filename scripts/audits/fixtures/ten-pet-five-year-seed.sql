-- Synthetic fixture only. Requires an empty, explicitly authorized test account.
-- Set furvise.test_account_id to the authorized account UUID in this SQL session before running.
-- The script aborts if pets already exist or the account entitlement allows fewer than ten pets.
-- No API calls. Never run against a real care-history account.
begin;
do $seed$
declare
 u uuid := current_setting('furvise.test_account_id')::uuid;
 ds constant text := 'furvise-ten-pets-five-years-20260909-v1';
 cfg jsonb; i integer:=0; p uuid; m integer; k integer; y integer; r integer;
 d date; switch_month integer; w numeric; n text; label text; cat text; oldfood text; newfood text; owner_name text;
 expected bigint:=0; actual bigint;
begin
 if not exists(select 1 from auth.users where id=u) then raise exception 'Unknown test account'; end if;
 if exists(select 1 from public.dog_profiles where user_id=u) then raise exception 'Expected reset account; refusing to overwrite pets'; end if;
 if (select max_pets from private.resolve_account_entitlements(u)) < 10 then raise exception 'Account does not support ten pets'; end if;
 for cfg in select value from jsonb_array_elements($config$[{"name":"Juniper","species":"dog","breed":"Border Collie mix","sex":"female","age":7,"weight":18.6,"food1":"chicken-and-rice adult dry food","food2":"lamb-and-oat adult dry food","activity":"walk","minutes":38},{"name":"Pixel","species":"cat","breed":"Domestic shorthair","sex":"male","age":6,"weight":4.9,"food1":"turkey complete adult wet food","food2":"chicken complete adult wet food","activity":"wand-toy play","minutes":14},{"name":"Atlas","species":"dog","breed":"Golden Retriever","sex":"male","age":9,"weight":31.2,"food1":"salmon-and-rice adult dry food","food2":"turkey senior dry food","activity":"park walk","minutes":32},{"name":"Mochi","species":"cat","breed":"Calico domestic shorthair","sex":"female","age":8,"weight":3.8,"food1":"chicken complete adult wet food","food2":"rabbit complete adult wet food","activity":"puzzle-feeder play","minutes":11},{"name":"Clover","species":"other","breed":"Rabbit — Mini Lop","sex":"female","age":6,"weight":2.1,"food1":"timothy hay with measured plain pellets and leafy greens","food2":"orchard hay with measured plain pellets and leafy greens","activity":"supervised indoor exploration","minutes":42},{"name":"Ziggy","species":"dog","breed":"Terrier mix","sex":"male","age":7,"weight":9.4,"food1":"beef-and-barley adult dry food","food2":"whitefish-and-potato adult dry food","activity":"sniff walk","minutes":26},{"name":"Nori","species":"cat","breed":"Siamese mix","sex":"female","age":10,"weight":4.2,"food1":"whitefish complete adult wet food","food2":"turkey complete adult wet food","activity":"feather-toy play","minutes":9},{"name":"Pebble","species":"other","breed":"Rabbit — Rex mix","sex":"male","age":7,"weight":2.8,"food1":"meadow hay with measured plain pellets and leafy greens","food2":"timothy hay with measured plain pellets and leafy greens","activity":"supervised pen exploration","minutes":35},{"name":"Maple","species":"dog","breed":"Beagle","sex":"female","age":8,"weight":12.7,"food1":"turkey-and-oat adult dry food","food2":"lamb-and-rice adult dry food","activity":"neighborhood walk","minutes":29},{"name":"Cosmo","species":"cat","breed":"Maine Coon mix","sex":"male","age":6,"weight":6.6,"food1":"beef complete adult wet food","food2":"salmon complete adult wet food","activity":"climbing-and-toy play","minutes":17}]$config$::jsonb) loop
  i:=i+1; p:=md5(ds||':pet:'||i)::uuid; switch_month:=20+(i*7)%24;
  oldfood:=cfg->>'food1'; newfood:=cfg->>'food2';
  owner_name:=(array['Sam','Alex','Riley','Morgan','Jamie'])[1+(i%5)];
  insert into public.dog_profiles(id,user_id,name,species,breed,sex,age_value,age_unit,weight_value,weight_unit,current_food,routine_note,wellness_goal)
  values(p,u,cfg->>'name',cfg->>'species',cfg->>'breed',cfg->>'sex',(cfg->>'age')::numeric,'years',(cfg->>'weight')::numeric,'kg',newfood,
   'Synthetic test profile. Five-year sample history; gaps are intentional. Rabbit species is represented as Other where applicable.','preventive_care');
  for m in 0..59 loop
   for k in 0..5 loop
    -- Deterministic irregular recording gaps; never fabricate continuous observation.
    if (m*13+i*11+k*7)%19=0 then continue; end if;
    d:=('2021-09-09'::date+make_interval(months=>m))::date+k*3;
    r:=(m*17+i*23+k*11)%13;
    w:=round((cfg->>'weight')::numeric*(1+((m+i*3)%9-4)*.008+(59-m)*.0007),2);
    case k
    when 0 then cat:='general';label:='Body measurement';
     n:=format('%s weighed %s kg on %s. This was body mass on the household scale with no carrier or harness included. The reason for any change was not established.',cfg->>'name',w,d);
    when 1 then cat:='food';label:='Food observation';
     n:=format('%s was offered %s. %s observed normal eating at this check. This observation does not establish intake at unobserved meals or an allergy diagnosis.',cfg->>'name',case when m<switch_month then oldfood else newfood end,owner_name);
    when 2 then cat:='activity';label:='Activity log';
     n:=format('%s had %s minutes of %s, followed by %s minutes of separate rest. The activity timer excluded the separate rest period. No conclusion about other days is recorded.',cfg->>'name',(cfg->>'minutes')::integer+r-6,cfg->>'activity',2+r%5);
    when 3 then cat:='grooming';label:='Coat care';
     n:=format('%s had a %s-minute %s session. %s noted %s at this check; this was not a veterinary skin diagnosis.',cfg->>'name',5+r%8,case when cfg->>'species'='other' then 'gentle brushing' else 'brushing' end,owner_name,(array['a small amount of loose fur','more loose fur than the previous session','an easily removed tangle','no visible tangles'])[1+r%4]);
    when 4 then cat:='behavior';label:='Behavior observation';
     n:=format('%s %s. The trigger and frequency outside this observation were not established.',cfg->>'name',(array['approached a new cardboard tunnel after watching it for four minutes','rested in a quieter room while the vacuum was running','investigated a visitor''s bag and then returned to the usual resting place','ignored a new toy but interacted with the familiar toy','startled at a dropped pan, then resumed the prior activity after three minutes'])[1+r%5]);
    else cat:='general';label:='Household care note';
     n:=format('%s: %s. This is a household-care observation, not evidence of a change in body weight, diagnosis, or medication.',cfg->>'name',(array['water bowl washed and refilled; consumption was not measured','bedding washed and returned to the same location','a sealed 1.2 kg food parcel arrived; parcel weight is not pet weight','the room thermometer read 21 C','the usual resting mat was moved beside the window'])[1+r%5]);
    end case;
    insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,occurred_at,created_at,care_event_metadata)
    values(md5(ds||':'||i||':'||m||':'||k)::uuid,u,p,cat,'Synthetic history — '||label,n,d+time '12:00',d+time '18:00',jsonb_build_object('synthetic',true,'dataset',ds,'sequence',m*6+k));
    expected:=expected+1;
   end loop;
  end loop;
  -- Five annual visits and paired observations with deliberately unknown gaps.
  for y in 0..4 loop
   d:=make_date(2022+y,1+(i*3+y)%8,4+i);
   for k in 0..4 loop
    case k
    when 0 then cat:='vet_visit';label:='Annual examination';
     n:=format('Fictional clinic visit for %s on %s. The examination note said no new diagnosis was entered. No medication was prescribed in this note. This does not establish lifetime absence of illness or unrecorded care.',cfg->>'name',d);
    when 1 then cat:='symptom';label:='Dated mobility observation';
     n:=format('%s hesitated before stepping onto the usual low platform. %s saw this once. The affected limb, cause, onset date and any diagnosis were not recorded.',cfg->>'name',owner_name);
    when 2 then cat:='activity';label:='Later mobility observation';
     n:=format('%s used the same low platform without hesitation at this check. There were no observations recorded between this check and the earlier hesitation note four days before. The exact recovery date and continuous state are unknown.',cfg->>'name');
    when 3 then cat:='general';label:='Equipment-inclusive weighing';
     n:=format('An initial weighing note for %s listed %s kg as the body weight. The scale display included a carrier; the carrier was not weighed separately on this date.',cfg->>'name',(cfg->>'weight')::numeric+1.35);
    else cat:='general';label:='Weighing correction';
     n:=format('Correction to %s''s weighing note dated %s: the earlier %s kg display included a 1.35 kg carrier. Corrected body mass is %s kg. The equipment-inclusive figure must not be treated as body mass. This correction was recorded on %s.',cfg->>'name',d+20,(cfg->>'weight')::numeric+1.35,cfg->>'weight',d+22);
    end case;
    insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,severity,occurred_at,created_at,care_event_metadata)
    values(md5(ds||':annual:'||i||':'||y||':'||k)::uuid,u,p,cat,'Synthetic history — '||label,n,case when k=1 then 'mild' else null end,
      (d+(array[0,8,12,20,22])[k+1])+time '12:00',(d+(array[0,8,12,20,22])[k+1])+time '18:00',jsonb_build_object('synthetic',true,'dataset',ds));
    expected:=expected+1;
   end loop;
  end loop;
  for k in 0..5 loop
   d:=('2021-09-09'::date+make_interval(months=>switch_month))::date+(array[0,7,35,47,61,82])[k+1];
   case k
   when 0 then cat:='food';label:='Diet transition started';n:=format('%s started a gradual transition from %s to %s today. The owner recorded a preference change, not a diagnosed food allergy.',cfg->>'name',oldfood,newfood);
   when 1 then cat:='food';label:='Diet transition completed';n:=format('%s completed the transition to %s today, seven elapsed days after the recorded start. No reason other than the earlier preference note was recorded.',cfg->>'name',newfood);
   when 2 then cat:='behavior';label:='Observer attribution';n:=format('%s told a friend, "My knee hurt, so I shortened %s''s activity." The knee symptom belongs to the human observer, not the pet. The pet''s health status was not assessed in this note.',owner_name,cfg->>'name');
   when 3 then cat:='general';label:='Shared supplies';n:=format('A 600 g bag of treats was shared between %s and a visiting animal over several days. The individual shares and the identity of the visiting animal were not recorded. Equal sharing cannot be assumed.',cfg->>'name');
   when 4 then cat:='medication';label:='Incomplete medication record';n:=format('A fictional historical medication note for %s lists a seven-day course but omits the medication name, dose, and reason. This is deliberately incomplete test data; do not infer a prescription or recommend a dose.',cfg->>'name');
   else cat:='general';label:='Retrospective report';n:=format('Report written on %s: %s explored a new room yesterday, then returned to the usual mat. The event date is %s, not the report date. No clinical interpretation was recorded.',d,cfg->>'name',d-1);
   end case;
   insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,occurred_at,created_at,care_event_metadata)
   values(md5(ds||':milestone:'||i||':'||k)::uuid,u,p,cat,'Synthetic history — '||label,n,d+time '12:00',d+time '18:00',jsonb_build_object('synthetic',true,'dataset',ds));
   expected:=expected+1;
  end loop;
  insert into public.pet_care_entries(id,user_id,pet_profile_id,category,title,note,occurred_at,created_at,care_event_metadata)
  values(md5(ds||':latest:'||i)::uuid,u,p,'general','Synthetic history — Latest profile measurement',
    format('%s body weight was %s kg on September 9, 2026 without equipment. The currently recorded food is %s. These observations do not establish a complete health assessment. All records for this profile are synthetic test data.',cfg->>'name',cfg->>'weight',newfood),
    '2026-09-09 12:00:00+00','2026-09-09 18:00:00+00',jsonb_build_object('synthetic',true,'dataset',ds));
  expected:=expected+1;
 end loop;
 select count(*) into actual from public.pet_care_entries where user_id=u;
 if actual<>expected or (select count(*) from public.dog_profiles where user_id=u)<>10 then raise exception 'Seed verification failed'; end if;
end $seed$;
commit;