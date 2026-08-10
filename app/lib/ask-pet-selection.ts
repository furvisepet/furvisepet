export type AskSelectablePet = {
  id: string;
  created_at?: string | null;
};

export function resolveAskPetSelection({
  boundConversationPetId,
  explicitPetId,
  pets,
  storedPetId,
}: {
  boundConversationPetId?: string | null;
  explicitPetId?: string | null;
  pets: AskSelectablePet[];
  storedPetId?: string | null;
}) {
  const validIds = new Set(pets.map((pet) => pet.id));
  if (boundConversationPetId && validIds.has(boundConversationPetId)) return boundConversationPetId;
  if (explicitPetId && validIds.has(explicitPetId)) return explicitPetId;
  if (storedPetId && validIds.has(storedPetId)) return storedPetId;
  return [...pets].sort((left, right) => stablePetOrder(left, right))[0]?.id || "";
}

function stablePetOrder(left: AskSelectablePet, right: AskSelectablePet) {
  const created = safeTimestamp(left.created_at) - safeTimestamp(right.created_at);
  return created || left.id.localeCompare(right.id);
}

function safeTimestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}
