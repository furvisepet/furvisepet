export const stateDomainRegistry = {
  breathing: { values: ["unknown", "normal", "uncertain", "abnormal"], safetyRelevant: true, minimumConfidence: 0.9, freshnessMs: 24 * 60 * 60 * 1000, inferable: false },
  energy: { values: ["unknown", "normal", "reduced", "high", "uncertain"], safetyRelevant: true, minimumConfidence: 0.85, freshnessMs: 24 * 60 * 60 * 1000, inferable: false },
  appetite: { values: ["unknown", "normal", "reduced", "increased", "uncertain"], safetyRelevant: true, minimumConfidence: 0.85, freshnessMs: 24 * 60 * 60 * 1000, inferable: false },
  currentFood: { values: ["unknown", "current"], safetyRelevant: false, minimumConfidence: 0.9, freshnessMs: 90 * 24 * 60 * 60 * 1000, inferable: false },
} as const;
