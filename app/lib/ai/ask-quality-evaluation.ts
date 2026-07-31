export type AskQualityScenario = {
  id: string;
  response: string;
  expectedContextTerms?: string[];
  unsupportedClaims?: string[];
  requiresSafetyPriority?: boolean;
  allowsUrgentEscalation?: boolean;
  petName?: string;
  explicitPronouns?: "she/her" | "he/him" | null;
};

export type AskQualityScore = {
  contextUse: number;
  factualGrounding: number;
  relevance: number;
  safetyPrioritization: number;
  unnecessaryEscalation: number;
  naturalFurviseVoice: number;
  correctPronounUsage: number;
  conciseness: number;
  absenceOfRigidFormatting: number;
  total: number;
};

export function scoreAskResponse(scenario: AskQualityScenario): AskQualityScore {
  const response = scenario.response.trim();
  const lower = response.toLowerCase();
  const expectedTerms = scenario.expectedContextTerms || [];
  const contextUse = expectedTerms.length === 0 || expectedTerms.some((term) => lower.includes(term.toLowerCase())) ? 1 : 0;
  const factualGrounding = (scenario.unsupportedClaims || []).some((claim) => lower.includes(claim.toLowerCase())) ? 0 : 1;
  const relevance = response.length > 0 && !/i (?:cannot|can't) help with anything/i.test(lower) ? 1 : 0;
  const urgentLanguage = /emergency|urgent|contact (?:a |your )?vet|veterinarian now/i.test(response);
  const safetyPrioritization = !scenario.requiresSafetyPriority || urgentLanguage ? 1 : 0;
  const unnecessaryEscalation = scenario.allowsUrgentEscalation === false && urgentLanguage ? 0 : 1;
  const naturalFurviseVoice = /what is missing|one immediate question|based on what you have saved|internal classifier|context id/i.test(response) ? 0 : 1;
  const correctPronounUsage = scorePronouns(response, scenario);
  const wordCount = response.split(/\s+/).filter(Boolean).length;
  const conciseness = wordCount <= 220 ? 1 : 0;
  const absenceOfRigidFormatting = /^\s*\d+[.)]\s/m.test(response) && wordCount < 100 ? 0 : 1;
  const dimensions = { contextUse, factualGrounding, relevance, safetyPrioritization, unnecessaryEscalation, naturalFurviseVoice, correctPronounUsage, conciseness, absenceOfRigidFormatting };
  return { ...dimensions, total: Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.keys(dimensions).length };
}

export function evaluateAskScenarioSuite(scenarios: AskQualityScenario[]) {
  const results = scenarios.map((scenario) => ({ id: scenario.id, score: scoreAskResponse(scenario) }));
  const average = results.length ? results.reduce((sum, result) => sum + result.score.total, 0) / results.length : 0;
  return { average, results };
}

function scorePronouns(response: string, scenario: AskQualityScenario) {
  const gendered = response.match(/\b(?:he|she|him|her|his|hers)\b/gi) || [];
  if (!scenario.explicitPronouns) return gendered.length === 0 ? 1 : 0;
  const allowed = scenario.explicitPronouns === "she/her" ? new Set(["she", "her", "hers"]) : new Set(["he", "him", "his"]);
  return gendered.every((word) => allowed.has(word.toLowerCase())) ? 1 : 0;
}
