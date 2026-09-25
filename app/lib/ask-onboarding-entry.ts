export const ASK_ONBOARDING_SOURCE = "onboarding";

const onboardingStarterTemplates = [
  "What do you remember about {pet} so far?",
  "What was the earliest recorded weight for {pet}?",
  "When did we change {pet}'s food?",
] as const;

export function buildOnboardingAskStarters(petName: string) {
  return onboardingStarterTemplates.map((starter) => starter.replace("{pet}", petName));
}

export function shouldShowOnboardingAskStarters({
  activeConversationId,
  composerDraft,
  explicitPetId,
  onboardingEntryActive,
  resolvedPetId,
  threadLength,
}: {
  activeConversationId: string | null;
  composerDraft: string;
  explicitPetId: string;
  onboardingEntryActive: boolean;
  resolvedPetId: string;
  threadLength: number;
}) {
  return onboardingEntryActive
    && Boolean(explicitPetId)
    && resolvedPetId === explicitPetId
    && !activeConversationId
    && threadLength === 0
    && !composerDraft.trim();
}
