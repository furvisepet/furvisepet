export const ADD_PET_DRAFT_VERSION = 2 as const;
export const ADD_PET_DRAFT_POINTER_KEY = "furvise:onboarding:add-pet:active:v2";
export const ADD_PET_DRAFT_PREFIX = "furvise:onboarding:add-pet:draft:v2:";
export const EDIT_PET_ONBOARDING_DRAFT_PREFIX = "furvise:onboarding:edit-pet:v2:";
export const LEGACY_ONBOARDING_DRAFT_KEY = "petwise:onboarding-draft";

const ONBOARDING_CONTEXT_KEYS = [
  LEGACY_ONBOARDING_DRAFT_KEY,
  "petwise:onboarding-mode",
  "petwise:dog-profile-id",
  "petwise:dog-profile-memories",
  "petwise:ai-analysis",
] as const;

export type AddPetDraftV2 = {
  version: 2;
  species: "dog" | "cat" | null;
  name: string;
  ageValue: string;
  ageUnit: "months" | "years";
  ageUnknown: boolean;
  sex: "female" | "male" | "not_sure" | "";
  breed: string;
  breedUnknown: boolean;
  weightValue: string;
  weightUnit: "lb" | "kg";
  weightUnknown: boolean;
  currentFood: string;
  currentFoodUnknown: boolean;
  mainConcern: string;
  otherConcern: string;
  avoidIngredients: string[];
  avoidIngredientsNoneKnown: boolean;
  customAvoidIngredient: string;
  monthlyBudget: string;
  routineNote: string;
  /** Legacy draft compatibility only. Onboarding no longer renders or saves photo uploads. */
  localPhotoPreview?: string | null;
  step: 0 | 1 | 2 | 3;
};

type StoragePair = {
  localStorage: Pick<Storage, "getItem" | "removeItem" | "setItem">;
  sessionStorage?: Pick<Storage, "removeItem">;
};

export function createBlankAddPetDraft(): AddPetDraftV2 {
  return {
    ageUnit: "years", ageUnknown: false, ageValue: "", avoidIngredients: [], avoidIngredientsNoneKnown: false, breed: "", breedUnknown: false,
    currentFood: "", currentFoodUnknown: false, customAvoidIngredient: "", mainConcern: "", monthlyBudget: "",
    localPhotoPreview: null, name: "", otherConcern: "", routineNote: "", sex: "", species: null, step: 0, version: ADD_PET_DRAFT_VERSION,
    weightUnit: "lb", weightUnknown: false, weightValue: "",
  };
}

export function beginAddPetDraft(storage: Pick<Storage, "getItem" | "removeItem" | "setItem">, userId = "") {
  clearActiveAddPetDraft(storage, userId);
  const id = createDraftId();
  const draft = createBlankAddPetDraft();
  storage.setItem(getAddPetDraftPointerKey(userId), id);
  storage.setItem(getAddPetDraftKey(id, userId), JSON.stringify(draft));
  return { draft, id };
}

export function getActiveAddPetDraftId(storage: Pick<Storage, "getItem">, userId = "") {
  return storage.getItem(getAddPetDraftPointerKey(userId)) || "";
}

export function readAddPetDraft(storage: Pick<Storage, "getItem">, draftId: string, userId = ""): AddPetDraftV2 | null {
  if (!draftId || storage.getItem(getAddPetDraftPointerKey(userId)) !== draftId) return null;
  const raw = storage.getItem(getAddPetDraftKey(draftId, userId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AddPetDraftV2>;
    if (value.version !== ADD_PET_DRAFT_VERSION) return null;
    if (value.species !== null && value.species !== "dog" && value.species !== "cat") return null;
    if (value.ageUnit !== "months" && value.ageUnit !== "years") return null;
    if (typeof value.name !== "string" || typeof value.ageValue !== "string" || typeof value.ageUnknown !== "boolean") return null;
    if (!Number.isInteger(value.step) || Number(value.step) < 0 || Number(value.step) > 3) return null;
    const blank = createBlankAddPetDraft();
    return {
      ...blank,
      ageUnit: value.ageUnit,
      ageUnknown: value.ageUnknown,
      ageValue: value.ageValue,
      avoidIngredients: Array.isArray(value.avoidIngredients) ? value.avoidIngredients.filter((item): item is string => typeof item === "string") : [],
      avoidIngredientsNoneKnown: Boolean(value.avoidIngredientsNoneKnown),
      breed: typeof value.breed === "string" ? value.breed : "",
      breedUnknown: Boolean(value.breedUnknown),
      currentFood: typeof value.currentFood === "string" ? value.currentFood : "",
      currentFoodUnknown: Boolean(value.currentFoodUnknown),
      customAvoidIngredient: typeof value.customAvoidIngredient === "string" ? value.customAvoidIngredient : "",
      mainConcern: typeof value.mainConcern === "string" ? value.mainConcern : "",
      localPhotoPreview: null,
      monthlyBudget: typeof value.monthlyBudget === "string" ? value.monthlyBudget : "",
      name: value.name,
      otherConcern: typeof value.otherConcern === "string" ? value.otherConcern : "",
      routineNote: typeof value.routineNote === "string" ? value.routineNote : "",
      sex: value.sex === "female" || value.sex === "male" || value.sex === "not_sure" ? value.sex : "",
      species: value.species,
      step: value.step as AddPetDraftV2["step"],
      version: ADD_PET_DRAFT_VERSION,
      weightUnit: value.weightUnit === "kg" ? "kg" : "lb",
      weightUnknown: Boolean(value.weightUnknown),
      weightValue: typeof value.weightValue === "string" ? value.weightValue : "",
    };
  } catch {
    return null;
  }
}

export function saveAddPetDraft(storage: Pick<Storage, "getItem" | "setItem">, draftId: string, draft: AddPetDraftV2, userId = "") {
  if (!draftId || storage.getItem(getAddPetDraftPointerKey(userId)) !== draftId) return false;
  try {
    storage.setItem(getAddPetDraftKey(draftId, userId), JSON.stringify({ ...draft, version: ADD_PET_DRAFT_VERSION }));
    return true;
  } catch {
    return false;
  }
}

export function getEditPetOnboardingDraftKey(profileId: string) {
  return `${EDIT_PET_ONBOARDING_DRAFT_PREFIX}${encodeURIComponent(profileId)}`;
}

export function clearEditPetOnboardingDraft(storage: Pick<Storage, "removeItem">, profileId: string) {
  if (profileId) storage.removeItem(getEditPetOnboardingDraftKey(profileId));
}

export function clearActiveAddPetDraft(storage: Pick<Storage, "getItem" | "removeItem">, userId = "") {
  const pointerKey = getAddPetDraftPointerKey(userId);
  const draftId = storage.getItem(pointerKey);
  if (draftId) storage.removeItem(getAddPetDraftKey(draftId, userId));
  storage.removeItem(pointerKey);
}

export function clearNewPetOnboardingState({ localStorage, sessionStorage }: StoragePair, userId = "") {
  clearActiveAddPetDraft(localStorage, userId);
  for (const key of ONBOARDING_CONTEXT_KEYS) {
    localStorage.removeItem(key);
    sessionStorage?.removeItem(key);
  }
}

export function clearCompletedOnboardingState(storage: StoragePair, profileId?: string, userId = "") {
  clearNewPetOnboardingState(storage, userId);
  if (profileId) clearEditPetOnboardingDraft(storage.localStorage, profileId);
}

function getAddPetDraftPointerKey(userId: string) {
  return userId ? `${ADD_PET_DRAFT_POINTER_KEY}:${encodeURIComponent(userId)}` : ADD_PET_DRAFT_POINTER_KEY;
}

function getAddPetDraftKey(draftId: string, userId: string) {
  return `${ADD_PET_DRAFT_PREFIX}${userId ? `${encodeURIComponent(userId)}:` : ""}${encodeURIComponent(draftId)}`;
}

function createDraftId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
