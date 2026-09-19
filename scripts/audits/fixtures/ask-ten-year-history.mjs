// SYNTHETIC ONLY: ten calendar years, never an account's care records.
// SYNTHETIC ONLY: ten calendar years, never an account's care records.
import {care,pets,ownerId} from './ask-lifetime-history.mjs';
export const stressPets=pets.slice(0,3);
export const start='2016-09-04', end='2026-09-03';
export const routine=[];
for(let at=Date.parse(start),i=0;at<=Date.parse(end);at+=86400000,i++) {
 const day=new Date(at).toISOString().slice(0,10);
 for(const pet of stressPets) routine.push(care(`decade-${pet.id}-${i}`,pet.id,day,'grooming',`${pet.name} rested after routine brushing. Synthetic daily entry ${i}.`));
}
export const milestones=[
 care('decade-old-weight','milo',start,'weight','Milo weighed 28.4 kg.'),
 care('decade-new-weight','milo',end,'weight','Milo weighed 27.8 kg.'),
 care('decade-stool','milo','2017-02-03','symptom','Milo had two soft stools today. Appetite was normal.'),
 care('decade-stool-end','milo','2017-02-09','symptom','Milo returned to normal stool.'),
 care('decade-stool-return','milo','2021-06-10','symptom','Milo had soft stools again after several years without a recorded stool update.'),
 care('decade-litter','luna','2018-04-05','general','Luna changed to scented litter and a covered tray together.'),
 care('decade-accidents','luna','2018-04-08','general','Luna urinated on the bath mat once yesterday and once today. The cause was unclear.'),
 care('decade-restored','luna','2018-04-10','general','Luna returned to unscented litter and an uncovered tray together.'),
 care('decade-course','oscar','2019-06-01','medication','Oscar finished a seven-day medication course. The medicine name and dose were not recorded.'),
 care('decade-stiffness','oscar','2024-06-01','symptom','Oscar had morning stiffness again. No diagnosis was recorded.'),
 care('decade-wrong','milo','2017-02-03','symptom','Milo vomited twice.'),
 care('decade-correction','milo','2026-08-20','general','Correction to the February 3, 2017 vomiting report: that vomiting belonged to Bruno, not Milo.'),
];
export const rows=[...routine,...milestones];
export {ownerId};
