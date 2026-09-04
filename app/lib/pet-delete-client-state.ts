import { ANALYSIS_STORAGE_KEY } from "./ai-analysis";
import { clearActivePetId } from "./active-pet";
import { removeAskDraft } from "./ask-draft";
import { removeLocalPhoto } from "./local-pet-media";
import { clearEditPetOnboardingDraft } from "./onboarding-drafts";
import { PROFILE_ID_STORAGE_KEY, PROFILE_MEMORIES_STORAGE_KEY } from "./supabase";
import { clearVetBriefClientDraftsForPet } from "./vet-brief/client-drafts";

type PetDeletionStorage = Pick<Storage, "getItem" | "key" | "length" | "removeItem" | "setItem">;

export function clearDeletedPetClientState(
  storage: { localStorage: PetDeletionStorage; sessionStorage: PetDeletionStorage },
  petId: string,
  userId: string,
) {
  if (!petId) return;
  try {
    clearActivePetId(storage.localStorage, petId);
    clearEditPetOnboardingDraft(storage.localStorage, petId);
    removeAskDraft(storage.localStorage, null, petId);
    clearVetBriefClientDraftsForPet(storage.localStorage, userId, petId);

    if (storage.localStorage.getItem(PROFILE_ID_STORAGE_KEY) === petId) {
      storage.localStorage.removeItem(PROFILE_ID_STORAGE_KEY);
      storage.localStorage.removeItem(PROFILE_MEMORIES_STORAGE_KEY);
      storage.localStorage.removeItem(ANALYSIS_STORAGE_KEY);
    }
  } catch {
    // Browser storage availability must not turn a completed deletion into a failure.
  }

  removeLocalPhoto("pet", petId);
}
