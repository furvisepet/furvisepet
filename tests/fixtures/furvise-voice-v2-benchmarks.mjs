export const voiceV2AssessmentCriteria = [
  "directness",
  "usefulness",
  "personalization",
  "contextCorrectness",
  "uncertaintyPreservation",
  "actionability",
  "safety",
  "naturalness",
  "verbosityAppropriateness",
  "genericChatbotResemblance",
];

const benchmark = (value) => ({ ...value, assessmentCriteria: voiceV2AssessmentCriteria });

export const furviseVoiceV2Benchmarks = [
  benchmark({
    id: "simple-egg",
    depth: 1,
    prompt: "Can cats eat a tiny piece of plain cooked egg?",
    qualityFocus: ["directness", "safety", "verbosityAppropriateness"],
  }),
  benchmark({
    id: "personalized-rocky-paws",
    depth: 2,
    prompt: "Rocky keeps licking his paws after walks. Anything from his history I should think about?",
    context: ["Rocky previously had paw irritation after salted winter walks", "Rocky eats salmon kibble", "Rocky dislikes nail trims"],
    relevantContext: ["paw irritation after salted winter walks"],
    qualityFocus: ["personalization", "contextCorrectness", "actionability"],
  }),
  benchmark({
    id: "mani-outside-cat-follow-up",
    depth: 2,
    prompt: "Is he likely why she keeps waiting there?",
    conversation: ["Mani is the selected female cat", "A male cat has been coming to the door"],
    qualityFocus: ["entityContinuity", "contextCorrectness", "naturalness"],
  }),
  benchmark({
    id: "uncertain-outside-water",
    depth: 2,
    prompt: "I think she drank some water I left outside yesterday, but I’m not sure.",
    qualityFocus: ["uncertaintyPreservation", "actionability", "safety"],
  }),
  benchmark({
    id: "complex-mani",
    depth: 3,
    prompt: "Mani has been acting restless since the male cat started coming to our door three days ago. She keeps meowing at the door and seems more interested in getting outside. Yesterday I think she drank some water I had left outside, but I’m not completely sure. Today she ate normally and is acting mostly like herself. Based on what you already know about Mani and what I’ve told you recently, what do you think is relevant here, what should I do today, what should I keep an eye on, and is there anything from her history that changes your advice?",
    qualityFocus: ["directness", "personalization", "uncertaintyPreservation", "entityContinuity", "actionability", "verbosityAppropriateness"],
  }),
  benchmark({
    id: "irrelevant-memory",
    depth: 2,
    prompt: "Could Rocky's paw licking after walks relate to anything we've tracked?",
    context: ["Past paw irritation after de-icer exposure", "Prefers a blue bowl", "Annual vaccine was in May", "Dislikes lamb treats"],
    relevantContext: ["Past paw irritation after de-icer exposure"],
    qualityFocus: ["personalization", "contextCorrectness", "genericChatbotResemblance"],
  }),
  benchmark({
    id: "genuine-clarification",
    depth: 1,
    prompt: "Should I give her more?",
    conversation: [],
    qualityFocus: ["directness", "safety", "verbosityAppropriateness"],
  }),
  benchmark({
    id: "urgent-breathing",
    depth: 3,
    prompt: "Mani is breathing with her mouth open and seems weak. What should I do?",
    qualityFocus: ["directness", "safety", "actionability"],
  }),
  benchmark({
    id: "language-continuity-french",
    depth: 2,
    prompt: "Answer me in French. What should I watch tonight?",
    conversation: ["Earlier context and the pet history were discussed in English"],
    qualityFocus: ["contextCorrectness", "naturalness", "actionability"],
  }),
  benchmark({
    id: "product-guidance",
    depth: 2,
    prompt: "Would this paw wipe make sense for Rocky after walks?",
    context: ["The selected product label is loaded", "Rocky previously had paw irritation after salted winter walks"],
    qualityFocus: ["personalization", "contextCorrectness", "safety", "naturalness"],
  }),
];
