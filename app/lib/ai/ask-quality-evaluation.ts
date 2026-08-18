export type AskQualityScenario = {
  id: string;
  response: string;
  depth?: 1 | 2 | 3;
  expectedContextTerms?: string[];
  expectedEntityTerms?: string[];
  unsupportedClaims?: string[];
  ownerUncertainty?: boolean;
  relevantContextExists?: boolean;
  requiresActionability?: boolean;
  requiresSafetyPriority?: boolean;
  allowsUrgentEscalation?: boolean;
  petName?: string;
  explicitPronouns?: "she/her" | "he/him" | null;
};

export type AskQualityScore = {
  directness: number;
  usefulness: number;
  personalization: number;
  contextCorrectness: number;
  uncertaintyPreservation: number;
  actionability: number;
  safety: number;
  naturalness: number;
  verbosityAppropriateness: number;
  genericChatbotResemblance: number;
  entityContinuity: number;
  correctPronounUsage: number;
  total: number;
};

export function scoreAskResponse(scenario: AskQualityScenario): AskQualityScore {
  const response = scenario.response.trim();
  const lower = response.toLowerCase();
  const words = response.split(/\s+/).filter(Boolean);
  const expectedContextTerms = scenario.expectedContextTerms || [];
  const expectedEntityTerms = scenario.expectedEntityTerms || [];
  const usesRelevantContext = expectedContextTerms.length === 0 || expectedContextTerms.some((term) => lower.includes(term.toLowerCase()));
  const unsupported = (scenario.unsupportedClaims || []).some((claim) => lower.includes(claim.toLowerCase()));
  const urgentLanguage = /emergency|urgent|contact (?:a |your )?(?:vet|veterinarian|qualified professional)|veterinarian now/i.test(response);
  const requiredSafetyPresent = !scenario.requiresSafetyPriority || urgentLanguage;
  const unnecessaryEscalationAbsent = scenario.allowsUrgentEscalation !== false || !urgentLanguage;
  const directness = response && !/^(?:thanks for|i understand|i'm sorry|as an ai|based on the (?:information|context) provided|it sounds like you(?:'re| are) asking)/i.test(response) ? 1 : 0;
  const usefulness = response && !/\bi (?:cannot|can't) help with (?:that|anything)\b/i.test(response) ? 1 : 0;
  const personalization = usesRelevantContext ? 1 : 0;
  const contextCorrectness = unsupported ? 0 : 1;
  const uncertaintyPreservation = !scenario.ownerUncertainty || /\b(?:uncertain|not sure|may|might|could|possibly|if she did|if he did|if that happened|can't confirm|cannot confirm)\b/i.test(response) ? 1 : 0;
  const actionability = scenario.requiresActionability === false || /\b(?:do|keep|watch|check|offer|avoid|note|log|track|call|contact|ask|monitor|look for|make sure)\b/i.test(response) ? 1 : 0;
  const safety = requiredSafetyPresent && unnecessaryEscalationAbsent ? 1 : 0;
  const naturalness = /\b(?:what is missing|one immediate question|internal classifier|context id|provided context|based on the information provided|as an ai|if you want, i can|let me know if you'd like)\b/i.test(response) ? 0 : 1;
  const verbosityAppropriateness = scoreVerbosity(words.length, scenario.depth || 2, response);
  const genericChatbotResemblance = scenario.relevantContextExists && !usesRelevantContext || /\b(?:it's important to remember|consult with a qualified professional|every pet is different|based on the information provided)\b/i.test(response) ? 0 : 1;
  const entityContinuity = expectedEntityTerms.every((term) => lower.includes(term.toLowerCase())) ? 1 : 0;
  const correctPronounUsage = scorePronouns(response, scenario);
  const dimensions = {
    directness, usefulness, personalization, contextCorrectness, uncertaintyPreservation,
    actionability, safety, naturalness, verbosityAppropriateness, genericChatbotResemblance,
    entityContinuity, correctPronounUsage,
  };
  return { ...dimensions, total: Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.keys(dimensions).length };
}

export function evaluateAskScenarioSuite(scenarios: AskQualityScenario[]) {
  const results = scenarios.map((scenario) => ({ id: scenario.id, score: scoreAskResponse(scenario) }));
  const average = results.length ? results.reduce((sum, result) => sum + result.score.total, 0) / results.length : 0;
  return { average, results };
}

function scoreVerbosity(wordCount: number, depth: 1 | 2 | 3, response: string) {
  if (depth === 1) return wordCount > 0 && wordCount <= 90 && !/^#{1,3}\s|^\s*[-*]\s/m.test(response) ? 1 : 0;
  if (depth === 2) return wordCount >= 15 && wordCount <= 260 ? 1 : 0;
  return wordCount >= 60 && wordCount <= 500 ? 1 : 0;
}

function scorePronouns(response: string, scenario: AskQualityScenario) {
  const gendered = response.match(/\b(?:he|she|him|her|his|hers)\b/gi) || [];
  if (!scenario.explicitPronouns) return gendered.length === 0 ? 1 : 0;
  const allowed = scenario.explicitPronouns === "she/her" ? new Set(["she", "her", "hers"]) : new Set(["he", "him", "his"]);
  return gendered.every((word) => allowed.has(word.toLowerCase())) ? 1 : 0;
}
