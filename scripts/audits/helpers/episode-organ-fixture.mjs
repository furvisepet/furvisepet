import assert from 'node:assert/strict';
import {requestProposal} from './request-proposal.mjs';
import {database} from './lifetime-harness.mjs';
import {ownerId,pets} from '../fixtures/ask-lifetime-history.mjs';
const {buildFurviseContext}=await import('../../../app/lib/intelligence/retrieve-context.ts');
const {retrieveEpisodeHistory}=await import('../../../app/lib/intelligence/episode-history.ts');
const {episodeAnswer}=await import('../../../app/lib/intelligence/episode-contract.ts');
// Direct organ/serializer unit fixture. It does not claim current Ask publication authority.
export async function episodeOrganFixture(question,{rows=[],fixturePets=pets,petId='milo',messages=[],authoritativePetIds=[petId],historyAccess,interpretationProposal,priorHistory,...options}={}){
 const effects=[],base=database(rows,{fixturePets,conversationPetId:petId,messages,...options});
 const db={...base,rpc(name,args){if(!name.startsWith('read_ask_')){effects.push(name);throw Error('EPISODE_UNIT_WRITE_FORBIDDEN');}return base.rpc(name,args);},
  from(table){const chain=base.from(table);return new Proxy(chain,{get(target,key){if(['insert','update','delete','upsert'].includes(key))return()=>{effects.push(table+':'+key);throw Error('EPISODE_UNIT_WRITE_FORBIDDEN')};return Reflect.get(target,key);}});}};
 let initial=await buildFurviseContext({supabase:db,userId:ownerId,petId,conversationId:'chat',conversationPetId:petId,currentMessage:question,historyAccess});
 if(interpretationProposal){const {recoverAskInterpretation,prepareAskInterpretationRequest}=await import('../../../app/lib/intelligence/interpret-ask.ts');const prepared=prepareAskInterpretationRequest(initial,'gpt-5-mini');initial={...initial,askInterpretation:recoverAskInterpretation(requestProposal(interpretationProposal,question),prepared.context)};}
 if(priorHistory)initial={...initial,askHistory:priorHistory};
 const context=await retrieveEpisodeHistory(initial,db,authoritativePetIds);
 assert.ok(context.episodeResult,'the case must request an episode organ operation');
 assert.deepEqual(effects,[]);
 return {context,answer:{title:'Furvise',safetyNote:null,...episodeAnswer(context.episodeResult)},queries:base.queries,effects};
}
