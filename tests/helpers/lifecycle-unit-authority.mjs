// Unit boundary fixture for already-hydrated state. End-to-end issuance is
// exercised separately by ask-lifecycle-role-contract and staged catalog tests.
import {bindCancellationSelector,retainCancellationAuthority} from '../../app/lib/furvise-brain/lifecycle-plan.ts';
import {explicitlyNamedOwnedPets} from '../../app/lib/intelligence/entities/resolve-turn-subject.ts';
export function lifecycleUnitAuthority(context){
 context.conversationId ||= 'unit-lifecycle-conversation';
 context.currentTurn.createdAt ||= '2026-09-23T12:00:00Z';
 const state=context.lifecycleActionState;
 state.provenance={conversationId:context.conversationId,sourceTurnId:context.currentTurn.id,cutoff:context.currentTurn.createdAt,
  assistantMessageIds:state.actions.length?['prior-assistant']:[],capabilityIds:state.actions.map(a=>a.id),scope:'current_conversation'};
 const names=explicitlyNamedOwnedPets(context.currentMessage,context.eligiblePets.filter(p=>p.user_id===context.owner.userId)).map(p=>p.name);
 const selector={petNames:names.length?names:null,quote:context.currentMessage};
 const authority=bindCancellationSelector(selector,context,context.eligiblePets.map(p=>p.id));
 retainCancellationAuthority(context,authority,Date.now()+30000);
 return selector;
}
