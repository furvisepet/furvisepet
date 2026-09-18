// SYNTHETIC ONLY — 10-pet / 5-year Ask stress fixture.
export const ownerId='synthetic-owner';
export const now=new Date('2026-09-04T18:00:00Z');
const names=['Aster','Birch','Cedar','Dune','Echo','Fennel','Grove','Hazel','Indigo','Juniper'];
export const stressPets=names.map((name,i)=>({
  id:'stress-pet-'+String(i+1).padStart(2,'0'),user_id:ownerId,name,
  species:i%3===1?'cat':'dog',sex:i%2?'female':'male',lifecycle_status:'active',
  weight_value:null,weight_unit:'kg',current_food:null,avoid_ingredients:[],
  created_at:'2021-01-01T00:00:00Z',updated_at:now.toISOString(),
}));
export function care(id,pet,date,category,note,overrides={}){
  return {id,user_id:ownerId,pet_profile_id:pet,category,title:null,note,severity:null,
    occurred_at:date+'T12:00:00Z',created_at:date+'T12:01:00Z',updated_at:date+'T12:01:00Z',deleted_at:null,...overrides};
}
const id=n=>'stress-pet-'+String(n).padStart(2,'0');
export const decisive=[
  care('aster-weight-2022',id(1),'2022-02-14','weight','Aster weighed 22.4 kg.'),
  care('aster-weight-2026',id(1),'2026-08-14','weight','Aster weighed 20.9 kg.'),
  care('birch-food-old',id(2),'2022-03-03','food','Birch switched to beef and oat food.'),
  care('birch-food-corrected',id(2),'2026-08-30','food','Correction: Birch switched to turkey and oat food in March 2022, not beef and oat.'),
  care('cedar-med',id(3),'2023-05-10','medication','Cedar started medicine 10 mg once daily for 4 days, then 5 mg once daily for 3 days. Last confirmed dose was May 16, 2023.'),
  care('dune-itch-2022',id(4),'2022-06-01','symptom','Dune had paw itching.'),
  care('dune-resolved-2022',id(4),'2022-06-06','symptom','Dune paw itching resolved.'),
  care('dune-itch-2026',id(4),'2026-07-20','symptom','Dune paw itching returned mildly.'),
  care('echo-owner-note',id(5),'2024-09-05','general','Echo seemed tired and ate only half breakfast.',{
    occurred_at:'2024-09-05T12:00:00Z',created_at:'2024-09-05T16:30:00Z',
    updated_at:'2024-09-05T16:30:00Z',intelligence_source_type:'owner_note',
    care_event_metadata:{authority:'owner_report',explicitTime:null,clinicalStatus:'unconfirmed',occurrenceBasis:'recorded_at'}
  }),
  care('fennel-weight',id(6),'2026-08-18','weight','Fennel weighed 8.2 kg.'),
  care('grove-weight',id(7),'2026-08-18','weight','Grove weighed 12.7 kg.'),
  care('hazel-weight',id(8),'2026-08-18','weight','Hazel weighed 4.4 kg.'),
  care('indigo-act-2022',id(9),'2022-04-12','activity','Indigo puzzle play lasted 6 minutes.'),
  care('indigo-act-2023',id(9),'2023-04-12','activity','Indigo puzzle play lasted 8 minutes.'),
  care('indigo-act-2024',id(9),'2024-04-12','activity','Indigo puzzle play lasted 11 minutes.'),
  care('indigo-act-2025',id(9),'2025-04-12','activity','Indigo puzzle play lasted 14 minutes.'),
  care('indigo-act-2026',id(9),'2026-04-12','activity','Indigo puzzle play lasted 18 minutes.'),
  care('juniper-good',id(10),'2025-11-02','general','Juniper slept normally after the evening walk.'),
  care('juniper-deleted','stress-pet-10','2025-11-03','general','Juniper had an obsolete draft note.',{deleted_at:'2025-11-04T00:00:00Z'}),
];
export const noise=stressPets.flatMap((pet,p)=>
  Array.from({length:120},(_,i)=>{
    const year=2022+(i%5); const month=1+((i*7+p)%12); const day=1+((i*11+p)%27);
    const d=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return care(`noise-${p+1}-${i}`,pet.id,d,'general',`${pet.name} routine observation ${i+1}: normal water and ordinary rest.`);
  })
);
export const rows=[...decisive,...noise];
