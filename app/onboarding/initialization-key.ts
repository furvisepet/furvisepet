export function buildOnboardingInitializationKey({
  draftId,
  mode,
  requestedPetId,
  userId,
}: {
  draftId: string;
  mode: string;
  requestedPetId: string;
  userId: string;
}) {
  if (!userId) return "";
  return JSON.stringify([userId, mode, draftId, requestedPetId]);
}
