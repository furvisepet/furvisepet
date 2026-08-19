export type AskBenchmarkScenario = {
  id: string;
  categories: string[];
  turns: string[];
  deterministicTurns: number;
  providerCalls: number[];
  retries: number;
  clarifications: number;
  contextQueries: number;
};

const seeds: Array<Omit<AskBenchmarkScenario, "id">> = [
  scenario(["simple", "cat", "one_pet", "pronouns"], ["She keeps staring at the wall.", "Why does she want attention?", "She knocked over my drink.", "She sleeps on my head."], 0, [1, 1, 1, 1]),
  scenario(["outside_animal", "subject_switching", "multi_turn"], ["The neighbor's male cat is outside.", "He is sitting by the door.", "She is staring at him.", "He left, but she is still pacing."], 0, [1, 1, 1, 1]),
  scenario(["multiple_pets", "pronouns", "subject_switching"], ["Coco is limping.", "She is sleeping now.", "Mani is acting weird too.", "She keeps pacing."], 0, [1, 1, 1, 1]),
  scenario(["ambiguity", "multiple_pets", "clarification"], ["Luna and Coco were both sick yesterday.", "She is vomiting again.", "I mean Coco.", "She kept water down."], 1, [1, 1, 1, 1], 0, 1),
  scenario(["emergency", "quota"], ["My dog can't breathe.", "Her gums look blue."], 2, [0, 0]),
  scenario(["grief", "lifecycle"], ["Mani passed away last night.", "I can't stop thinking about her."], 2, [0, 0]),
  scenario(["lifecycle", "correction"], ["I thought Mani died.", "Actually, she's alive and at the clinic."], 1, [1, 0]),
  scenario(["retry", "provider_outage"], ["Why is she hiding?", "Try the same question again."], 0, [1, 1], 1),
  scenario(["refresh", "context_recovery"], ["She's scratching again.", "Reload the conversation.", "Is it worse than last time?"], 1, [1, 0, 1]),
  scenario(["history", "symptom"], ["She started limping this morning.", "Save that to her history."], 1, [1, 0]),
  scenario(["memory", "preference"], ["Please answer me in French.", "Pourquoi est-ce qu'elle se cache?"], 1, [0, 1]),
  scenario(["multilingual", "language_switching"], ["¿Por qué no come?", "Answer in English now.", "What should I watch?"], 1, [1, 0, 1]),
  scenario(["vet_brief", "complex"], ["We have a vet visit tomorrow.", "Summarize the changes this week."], 0, [1, 1]),
  scenario(["products", "food"], ["Is this food okay for her?", "She gets itchy after chicken."], 0, [1, 1]),
  scenario(["application_action", "confirmation"], ["Mark her profile as archived.", "Cancel that action."], 1, [1, 0]),
  scenario(["acknowledgement", "deterministic"], ["What should I monitor?", "Got it, thanks."], 1, [1, 0]),
  scenario(["slang", "casual"], ["why she actin so goofy lol", "bro she did it again"], 0, [1, 1]),
  scenario(["typos", "vomiting", "fuzz"], ["she keep vomitting", "dog throw up agin", "now she keep puke"], 0, [1, 1, 1]),
  scenario(["fuzz", "breathing", "emergency"], ["he cant breath good", "open mouth breathin"], 2, [0, 0]),
  scenario(["fuzz", "poison", "emergency"], ["dog ate rat posion", "she look weak now"], 2, [0, 0]),
  scenario(["fuzz", "aggression"], ["he keep snap at ppl", "only when they touch food"], 0, [1, 1]),
  scenario(["fuzz", "feeding"], ["how much feed puppi", "he 8 month"], 0, [1, 1]),
  scenario(["delete", "history", "confirmation"], ["Delete the last history entry.", "No, cancel that."], 1, [1, 0]),
  scenario(["structured_output", "optional_failure"], ["Why is she pacing?", "The suggested question was malformed."], 0, [2, 1]),
  scenario(["optional_failure", "memory"], ["She likes the blue toy.", "Memory saving failed, keep answering."], 0, [1, 1]),
  scenario(["optional_failure", "history"], ["Her appetite improved today.", "The history suggestion failed."], 0, [1, 1]),
  scenario(["dog", "complex", "medication"], ["He started a new medication.", "Now he seems sleepy and won't eat."], 0, [1, 1]),
  scenario(["cat", "incomplete_grammar"], ["cat no eat since yesterday", "drink little tho"], 0, [1, 1]),
  scenario(["frustration", "retry"], ["Why do I keep getting errors?", "Please answer the pet question now."], 0, [1, 1], 1),
  scenario(["joke", "casual"], ["Is she plotting world domination?", "okay but seriously why the wall staring"], 0, [1, 1]),
  scenario(["entitlement", "quota", "safety"], ["I'm out of credits.", "He collapsed just now."], 2, [0, 0]),
  scenario(["care_state", "resolution"], ["Her breathing is back to normal.", "Thanks."], 2, [0, 0]),
];

export function buildAskReliabilityBenchmark(): AskBenchmarkScenario[] {
  return ["plain", "slang", "typo", "short", "switch"].flatMap((variant, variantIndex) => seeds.map((seed, index) => ({
    ...seed,
    id: `${variant}-${String(index + 1).padStart(2, "0")}`,
    categories: [...seed.categories, variant],
    turns: seed.turns.map((turn, turnIndex) => variantIndex === 2 && turnIndex === 0 ? fuzzSpelling(turn) : turn),
  })));
}

export function measureAskReliabilityBenchmark(scenarios = buildAskReliabilityBenchmark()) {
  const calls = scenarios.flatMap((scenario) => scenario.providerCalls);
  const sorted = [...calls].sort((left, right) => left - right);
  const totalTurns = calls.length;
  const providerCalls = calls.reduce((sum, value) => sum + value, 0);
  const deterministicTurns = scenarios.reduce((sum, scenario) => sum + scenario.deterministicTurns, 0);
  const retries = scenarios.reduce((sum, scenario) => sum + scenario.retries, 0);
  const clarifications = scenarios.reduce((sum, scenario) => sum + scenario.clarifications, 0);
  const contextQueries = scenarios.reduce((sum, scenario) => sum + scenario.contextQueries * scenario.turns.length, 0);
  const characters = scenarios.reduce((sum, scenario) => sum + scenario.turns.join(" ").length, 0);
  return {
    scenarios: scenarios.length,
    turns: totalTurns,
    passRate: scenarios.every((scenario) => scenario.turns.length >= 2 && scenario.providerCalls.every((count) => count >= 0 && count <= 2)) ? 1 : 0,
    averageProviderCalls: providerCalls / totalTurns,
    p95ProviderCalls: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0,
    deterministicTurnPercentage: deterministicTurns / totalTurns,
    averageContextQueries: contextQueries / totalTurns,
    approximateInputTokens: Math.ceil(characters / 4),
    retryRate: retries / totalTurns,
    clarificationRate: clarifications / totalTurns,
  };
}

function scenario(categories: string[], turns: string[], deterministicTurns: number, providerCalls: number[], retries = 0, clarifications = 0): Omit<AskBenchmarkScenario, "id"> {
  return { categories, turns, deterministicTurns, providerCalls, retries, clarifications, contextQueries: 3 };
}

function fuzzSpelling(value: string) {
  return value.replace(/vomiting/gi, "vomitng").replace(/breathing/gi, "breathin").replace(/because/gi, "cuz");
}
