import type { AgeUnit, PetProfile, WeightUnit } from "../lib/petwise";

type NumericFieldKey = "age" | "weight";

type NumericFieldConfig = {
  unitKey: "ageUnit" | "weightUnit";
  unknownKey: "ageUnknown" | "weightUnknown";
  valueKey: "age" | "weight";
};

const NUMERIC_FIELD_CONFIG: Record<NumericFieldKey, NumericFieldConfig> = {
  age: {
    unitKey: "ageUnit",
    unknownKey: "ageUnknown",
    valueKey: "age",
  },
  weight: {
    unitKey: "weightUnit",
    unknownKey: "weightUnknown",
    valueKey: "weight",
  },
};

export function beginNumericFieldEntry(field: NumericFieldKey): Partial<PetProfile> {
  const config = NUMERIC_FIELD_CONFIG[field];
  return {
    [config.unknownKey]: false,
  } as Partial<PetProfile>;
}

export function markNumericFieldUnknown(field: NumericFieldKey): Partial<PetProfile> {
  const config = NUMERIC_FIELD_CONFIG[field];
  return {
    [config.unknownKey]: true,
    [config.valueKey]: "",
  } as Partial<PetProfile>;
}

export function updateNumericFieldValue(
  field: NumericFieldKey,
  value: string,
): Partial<PetProfile> {
  const config = NUMERIC_FIELD_CONFIG[field];
  return {
    [config.unknownKey]: false,
    [config.valueKey]: value,
  } as Partial<PetProfile>;
}

export function updateNumericFieldUnit(
  field: NumericFieldKey,
  unit: AgeUnit | WeightUnit,
): Partial<PetProfile> {
  const config = NUMERIC_FIELD_CONFIG[field];
  return {
    [config.unknownKey]: false,
    [config.unitKey]: unit,
  } as Partial<PetProfile>;
}
