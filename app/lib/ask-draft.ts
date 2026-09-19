type AskDraftStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function getAskDraftKey(conversationId: string | null, petId: string) {
  return `furvise:ask-draft:${conversationId || `new:${petId}`}`;
}

export function readAskDraft(storage: AskDraftStorage, conversationId: string | null, petId: string) {
  try {
    return storage.getItem(getAskDraftKey(conversationId, petId)) || "";
  } catch {
    return "";
  }
}

export function persistAskDraft(storage: AskDraftStorage, conversationId: string | null, petId: string, draft: string) {
  try {
    storage.setItem(getAskDraftKey(conversationId, petId), draft);
  } catch {
    // The in-memory composer remains usable when browser storage is unavailable.
  }
}

export function removeAskDraft(storage: AskDraftStorage, conversationId: string | null, petId: string) {
  try {
    storage.removeItem(getAskDraftKey(conversationId, petId));
  } catch {
    // The current Ask session remains authoritative when browser storage is unavailable.
  }
}
