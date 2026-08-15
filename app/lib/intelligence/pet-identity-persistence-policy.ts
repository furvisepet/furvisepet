const unsupportedPetIdentitySemantics = /\b(?:sexual\s+orientation|sexuality|homosexual(?:ity)?|heterosexual(?:ity)?|bisexual(?:ity)?|gay|lesbian|gender\s+identity)\b/i;

/** Furvise does not treat human sexual-orientation or gender-identity labels as durable pet facts. */
export function containsUnsupportedPetIdentitySemantics(...values: unknown[]) {
  return unsupportedPetIdentitySemantics.test(values.map(stringValue).join(" "));
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value ?? ""); }
}
