import { parseVetBriefDocument } from "./schema.ts";
import type { VetBriefDocument } from "./types.ts";

const LEGACY_VET_BRIEF_DRAFT_PREFIX = "furvise:vet-brief-draft:";
const VET_BRIEF_DRAFT_PREFIX = "furvise:vet-brief-draft:v2:";
const VET_BRIEF_DRAFT_VERSION = 2;

type DraftStorage = Pick<Storage, "getItem" | "key" | "length" | "removeItem" | "setItem">;

export type VetBriefDraftScope = {
  userId: string;
  petId: string;
  briefId: string | null;
};

export type VetBriefClientDraft = {
  document: VetBriefDocument;
  sourceEntryIds: string[];
};

export function getVetBriefDraftStorageKey(scope: VetBriefDraftScope) {
  return `${VET_BRIEF_DRAFT_PREFIX}${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.petId)}:${encodeURIComponent(scope.briefId || "new")}`;
}

export function saveVetBriefClientDraft(storage: DraftStorage, scope: VetBriefDraftScope, draft: VetBriefClientDraft) {
  storage.setItem(getVetBriefDraftStorageKey(scope), JSON.stringify({
    version: VET_BRIEF_DRAFT_VERSION,
    userId: scope.userId,
    petId: scope.petId,
    briefId: scope.briefId,
    document: draft.document,
    sourceEntryIds: draft.sourceEntryIds,
  }));
}

export function readVetBriefClientDraft(storage: DraftStorage, scope: VetBriefDraftScope): VetBriefClientDraft | null {
  const key = getVetBriefDraftStorageKey(scope);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const document = parseVetBriefDocument(value?.document);
    if (
      value?.version !== VET_BRIEF_DRAFT_VERSION
      || value?.userId !== scope.userId
      || value?.petId !== scope.petId
      || value?.briefId !== scope.briefId
      || !document
    ) {
      storage.removeItem(key);
      return null;
    }
    const sourceEntryIds = Array.isArray(value.sourceEntryIds)
      ? value.sourceEntryIds.filter((item): item is string => typeof item === "string").slice(0, 300)
      : [];
    return { document, sourceEntryIds };
  } catch {
    try { storage.removeItem(key); } catch { /* Inaccessible storage already fails closed. */ }
    return null;
  }
}

export function removeVetBriefClientDraft(storage: DraftStorage, scope: VetBriefDraftScope) {
  storage.removeItem(getVetBriefDraftStorageKey(scope));
}

export function clearVetBriefClientDraftsForPet(storage: DraftStorage, userId: string, petId: string) {
  if (!userId || !petId) return;
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key?.startsWith(VET_BRIEF_DRAFT_PREFIX)) continue;
      const raw = storage.getItem(key);
      try {
        const value = raw ? JSON.parse(raw) as { petId?: unknown; userId?: unknown } : null;
        if (value?.userId === userId && value.petId === petId) storage.removeItem(key);
      } catch {
        // Account-boundary cleanup handles malformed drafts separately.
      }
    }
  } catch {
    // Storage denial cannot leave the deleted pet selected in server data.
  }
}

export function enforceVetBriefDraftAccountBoundary(storage: DraftStorage, activeUserId: string | null) {
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key?.startsWith(LEGACY_VET_BRIEF_DRAFT_PREFIX)) continue;
      if (!key.startsWith(VET_BRIEF_DRAFT_PREFIX)) {
        storage.removeItem(key);
        continue;
      }
      const raw = storage.getItem(key);
      let storedUserId = "";
      try {
        const value = raw ? JSON.parse(raw) as { userId?: unknown; version?: unknown } : null;
        if (value?.version === VET_BRIEF_DRAFT_VERSION && typeof value.userId === "string") storedUserId = value.userId;
      } catch { /* Malformed draft state is removed below. */ }
      if (!activeUserId || storedUserId !== activeUserId) storage.removeItem(key);
    }
  } catch {
    // Storage denial cannot authorize or hydrate a draft.
  }
}
