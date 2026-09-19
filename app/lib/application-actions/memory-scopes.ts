export type FurviseMemoryScope = "USER" | "PET" | "CONVERSATION";

export type FurviseMemoryDefinition = {
  scope: FurviseMemoryScope;
  cardinality: "singleton" | "multiple";
  durable: boolean;
};

const singletonUserPreferences = new Set(["preferred_language", "preferred_units", "communication_style"]);

export function getFurviseMemoryDefinition(factKey: string): FurviseMemoryDefinition {
  const key = normalizeKey(factKey);
  if (singletonUserPreferences.has(key)) return { scope: "USER", cardinality: "singleton", durable: true };
  if (/^(?:current_turn|temporary|conversation|pending_reference)/.test(key)) return { scope: "CONVERSATION", cardinality: "multiple", durable: false };
  return { scope: "PET", cardinality: "multiple", durable: true };
}

export function canPersistFurviseMemory(factKey: string) {
  return getFurviseMemoryDefinition(factKey).durable;
}

export function normalizeSingletonPreferenceKey(value: string) {
  const key = normalizeKey(value);
  if (/language|speak|reply_language|response_language/.test(key)) return "preferred_language";
  if (/unit|metric|imperial/.test(key)) return "preferred_units";
  if (/communication|response_style|tone|format/.test(key)) return "communication_style";
  return key;
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

