// Fixture coordinator for pre-canonical entity-grounding tests only.
// Actual Ask/audit execution consumes the bound request via readInterpretationSubject.
import {resolveDeterministicTurnSubject,resolveAuthoritativeTurnSubject,explicitMutationTarget}
 from '../../app/lib/intelligence/entities/resolve-turn-subject.ts';
export async function resolveAskTurnSubject({ extractFrame, operationPetIds, message, ownerId, pets, recentConversation, selectedPetId, }) {
    const owned = pets.filter(pet => pet.user_id === ownerId);
    const target = operationPetIds?.length === 1 ? explicitMutationTarget(message, owned) : null;
    if (target && operationPetIds?.[0] === target) {
        return { resolution: resolved(target, 0.99), frame: await extractFrame(), usedProviderExtraction: true };
    }
    const deterministic = resolveDeterministicTurnSubject({ message, pets, recentConversation, selectedPetId });
    if (deterministic)
        return { resolution: deterministic, usedProviderExtraction: false };
    const frame = await extractFrame();
    return {
        frame,
        resolution: resolveAuthoritativeTurnSubject({
            frame,
            message,
            ownerId,
            pets,
            recentConversation,
            selectedPetId,
        }),
        usedProviderExtraction: true,
    };
}
