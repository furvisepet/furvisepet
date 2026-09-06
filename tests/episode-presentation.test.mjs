import assert from 'node:assert/strict';
import test from 'node:test';
import {episodePresentation} from '../app/lib/intelligence/episode-presentation.ts';
const pet={id:'milo',name:'Milo'},pets=[pet,{id:'luna',name:'Luna'}];
const user={id:'u',role:'user',user_text:'List Milo vomiting episodes.',response_data:null};
const answer={id:'a',role:'furvise',user_text:null,response_data:{sections:[{heading:'Episodes',items:['July 2014: second episode.']}]}};
test('presentation hints require retained, single-pet conversation context',()=>{
 assert.ok(episodePresentation([answer,user],new Set(['a','u']),pet,pets));
 assert.equal(episodePresentation([answer,user],new Set(['a']),pet,pets),undefined);
 assert.equal(episodePresentation([answer,{...user,user_text:'Compare Milo and Luna episodes.'}],new Set(['a','u']),pet,pets),undefined);
 assert.equal(episodePresentation([{...answer,response_data:{sections:[{heading:'Episodes',items:['x'.repeat(241)]}]}},user],new Set(['a','u']),pet,pets),undefined);
});
