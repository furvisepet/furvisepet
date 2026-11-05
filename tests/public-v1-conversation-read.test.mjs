import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAskRequest} from '../app/lib/intelligence/ask-request-contract.ts';
import {publicV1AskCapability} from '../app/lib/public-v1-capabilities.ts';
const pet={id:'pet',user_id:'owner',name:'Cedar',species:'dog'};
const q='How should I introduce a different food gradually?';
const context={owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:q,conversationTurns:[],currentTurn:{id:'u',role:'user',text:q,createdAt:'2026-09-20T12:00:00Z'},timeZone:'UTC'};
const proposal={version:'ask-request.v2',mode:'read',question:q,requirements:[],referenceTurnIds:[],scope:'none',petNames:[],operation:'general',selection:'summary',quantity:null,topic:'care',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'general',premiseQuotes:[],readTicket:null};
test('bound source-free general read is a conversation at the public gate',()=>{
 const bound=validateAskRequest(proposal,context);
 assert.equal(bound.conversationOnly,true);assert.equal(bound.readOnly,true);assert.deepEqual(bound.petIds,[]);
 assert.equal(publicV1AskCapability(bound.request).available,true);
});
