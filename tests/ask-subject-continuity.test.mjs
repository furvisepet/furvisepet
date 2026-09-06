import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAskTurnSubject } from '../app/lib/intelligence/entities/resolve-turn-subject.ts';
const pets = [{id:'milo',name:'Milo',species:'dog',sex:'male'}, {id:'luna',name:'Luna',species:'cat',sex:'female'}];
async function decide(message, recentConversation, eligible=pets) {
  return (await resolveAskTurnSubject({message,recentConversation,pets:eligible,ownerId:'owner',selectedPetId:'milo',
    extractFrame:async()=>{throw new Error('unexpected provider extraction');}})).resolution;
}
const switched=[{role:'user',text:'Tell me about Luna litter accidents.'}];
for (const message of ['What about the second episode?','What changed during the second one?','Was that episode different?','What about her second episode?']) {
  test(`a switched pet owns the follow-up: ${message}`, async()=>{
    const result=await decide(message,switched);
    assert.equal(result.petId,'luna'); assert.deepEqual(result.petIds,['luna']);
  });
}
test('an explicit pet overrides previous focus',async()=>{
  assert.equal((await decide('What about Milo second episode?',switched)).petId,'milo');
});
test('ordinary unreferenced questions retain selected-pet semantics',async()=>{
  assert.equal((await decide('What food is recommended?',switched)).petId,'milo');
});
test('assistant wording cannot change owner-established focus',async()=>{
  assert.equal((await decide('What about the second episode?',[...switched,{role:'furvise',text:'Milo was discussed.'}])).petId,'luna');
});
test('competing recent pets clarify rather than reuse the selected pet',async()=>{
  const result=await decide('What about the second episode?',[{role:'user',text:'Compare Milo and Luna episodes.'}]);
  assert.equal(result.requiresClarification,true); assert.equal(result.petId,null);
});
test('an outside animal cannot transfer its episode to the selected pet',async()=>{
  const result=await decide('What about the second episode?',[{role:'user',text:'The stray cat had two episodes.'}]);
  assert.equal(result.requiresClarification,true); assert.deepEqual(result.petIds,[]);
});
test('without a recent subject the selected pet is context, not an invented identity',async()=>{
  assert.equal((await decide('What about the second episode?',[])).petId,'milo');
});
test('removed pets cannot remain eligible through prior text',async()=>{
  const result=await decide('What about her second episode?',switched,[pets[0]]).catch(()=>null);
  assert.ok(!result || result.petId!=='luna');
});
test('that one retains focus across intervening owner pronouns',async()=>{
 assert.equal((await decide('Tell me about that one.',[...switched,{role:'user',text:'She was doing better.'}])).petId,'luna');
});
test('neutral and feminine pronouns retain the switched pet',async()=>{
 for(const message of ['What should I watch for her?','Was it improving?']) assert.equal((await decide(message,switched)).petId,'luna');
});
test('a later explicit switch back is authoritative',async()=>{
 assert.equal((await decide('What about the second episode?',[...switched,{role:'user',text:'Back to Milo.'}])).petId,'milo');
});
