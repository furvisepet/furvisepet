import assert from 'node:assert/strict';
import {stressProposal} from './current-stress-harness.mjs';
// Semantic dimensions are supplied explicitly by each case. Never parse the question.
export function datedSelectionProposal({question,petNames,requests,referenceTurnIds=[]}) {
 assert.ok(requests.length>0&&requests.length<=4);
 const p=stressProposal({question,petNames});
 return {...p,referenceTurnIds,readTicket:{...p.readTicket,outputs:{completeness:'sufficient',ordering:'asc',limit:null},
  probes:requests.map(({quote,sourceTurnId=null,from,to,terms=[],count=1,petNames:subjects=petNames})=>({
   quote,sourceTurnId,petNames:subjects,from,to,target:null,termGroups:[terms],ordering:'asc',
   predicates:terms.length?[{kind:'text_any',terms}]:[],
   selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'asc'}],take:{count,per:'group'}}]},
  }))}};
}
