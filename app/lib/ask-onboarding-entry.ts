export const ASK_ONBOARDING_SOURCE = "onboarding";

const onboardingStarterTemplates = [
  "What do you remember about {pet} so far?",
  "What should I keep an eye on with {pet}?",
  "What should I tell you when something changes?",
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
