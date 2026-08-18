export const PET_LIFECYCLE_STATUSES = ["active", "deceased", "archived"] as const;

export type PetLifecycleStatus = (typeof PET_LIFECYCLE_STATUSES)[number];

type PetLifecycleCarrier = {
  lifecycle_status?: PetLifecycleStatus | null;
  lifecycleStatus?: PetLifecycleStatus | null;
};

export function getPetLifecycleStatus(pet: PetLifecycleCarrier): PetLifecycleStatus {
  return pet.lifecycle_status || pet.lifecycleStatus || "active";
}

export function isActivePet(pet: PetLifecycleCarrier) {
  return getPetLifecycleStatus(pet) === "active";
}

export function activePetsOnly<T extends PetLifecycleCarrier>(pets: readonly T[]) {
  return pets.filter(isActivePet);
}

export function featureRequiresActivePet(feature: string) {
  return feature === "product_question"
    || feature === "product_query_interpretation"
    || feature === "product_explanation"
    || feature === "care_plan";
}
