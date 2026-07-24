import type { PetProfile } from "../lib/petwise";

type TextFieldKey = "currentFood";

type TextFieldConfig = {
  unknownKey: "currentFoodUnknown";
  valueKey: "currentFood";
};

const TEXT_FIELD_CONFIG: Record<TextFieldKey, TextFieldConfig> = {
  currentFood: {
    unknownKey: "currentFoodUnknown",
    valueKey: "currentFood",
  },
};

export function beginTextFieldEntry(field: TextFieldKey): Partial<PetProfile> {
  const config = TEXT_FIELD_CONFIG[field];
  return {
    [config.unknownKey]: false,
  } as Partial<PetProfile>;
}

export function markTextFieldUnknown(field: TextFieldKey): Partial<PetProfile> {
  const config = TEXT_FIELD_CONFIG[field];
  return {
    [config.unknownKey]: true,
    [config.valueKey]: "",
  } as Partial<PetProfile>;
}

export function updateTextFieldValue(
  field: TextFieldKey,
  value: string,
): Partial<PetProfile> {
  const config = TEXT_FIELD_CONFIG[field];
  return {
    [config.unknownKey]: false,
    [config.valueKey]: value,
  } as Partial<PetProfile>;
}
