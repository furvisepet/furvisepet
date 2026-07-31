export const ACTION_COPY = {
  addPet: "Add pet",
  addYourPet: "Add your pet",
  addYourFirstPet: "Add your first pet",
  addUpdate: "Add update",
  addFirstUpdate: "Add the first update",
  openProfile: "Open profile",
  prepareVetBrief: "Prepare vet brief",
} as const;

export function askAboutPet(petName: string) {
  return `Ask about ${petName}`;
}
