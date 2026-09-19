export const ACTIVE_PET_STORAGE_KEY = "furvise:active-pet-id";

export function setActivePetId(storage: Pick<Storage, "setItem">, petId: string) {
  if (petId) storage.setItem(ACTIVE_PET_STORAGE_KEY, petId);
}

export function getActivePetId(storage: Pick<Storage, "getItem">) {
  return storage.getItem(ACTIVE_PET_STORAGE_KEY) || "";
}

export function clearActivePetId(storage: Pick<Storage, "getItem" | "removeItem">, petId?: string) {
  if (!petId || storage.getItem(ACTIVE_PET_STORAGE_KEY) === petId) storage.removeItem(ACTIVE_PET_STORAGE_KEY);
}
