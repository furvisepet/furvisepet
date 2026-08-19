import { evaluateCareHistorySaveWorthiness } from "../intelligence/care-history-policy.ts";
import {
  applyAskAnswerEconomy,
  measureAskAnswerEconomy,
  planAskAnswerDepth,
  type AskAnswerDepth,
  type AskEconomyAnswer,
} from "./ask-answer-economy.ts";

type ReviewBase = {
  category: string;
  messages: string[];
  previousUser: string;
  previousAssistant: string;
  safety: "normal" | "monitor" | "urgent";
  expectedDepth: AskAnswerDepth;
  baselineSuggestion: boolean;
  requiredTerms: string[];
};

export type AskAnswerEconomyReviewCase = {
  id: string;
  category: string;
  message: string;
  previousUser: string;
  previousAssistant: string;
  safety: "normal" | "monitor" | "urgent";
  expectedDepth: AskAnswerDepth;
  baselineSuggestion: boolean;
  requiredTerms: string[];
  before: AskEconomyAnswer;
  candidate: AskEconomyAnswer;
};

const bases: ReviewBase[] = [
  {
    category: "ack_social",
    messages: ["Thanks.", "Okay, got it.", "lol fair", "That makes sense, thank you.", "Yep, understood."],
    previousUser: "Why does she follow me?",
    previousAssistant: "She may be looking for company or expecting a familiar routine.",
    safety: "normal", expectedDepth: 0, baselineSuggestion: false, requiredTerms: ["welcome"],
  },
  {
    category: "casual_roleplay",
    messages: ["Can you talk like her for a minute?", "Be her for one message.", "Pretend you're my cat for a bit.", "Just chat with me as her.", "Talk to me like she would."],
    previousUser: "She is curled up beside me.",
    previousAssistant: "She sounds settled and close to you.",
    safety: "normal", expectedDepth: 0, baselineSuggestion: true, requiredTerms: ["mrrp"],
  },
  {
    category: "simple_behavior",
    messages: ["Why does she follow me?", "Why does she sit on my laptop?", "Is it normal that she sleeps by my head?", "Why does she ask for attention when I'm busy?", "Does she stare because she wants something?"],
    previousUser: "She has been acting normal today.",
    previousAssistant: "Nothing you described sounds urgent.",
    safety: "normal", expectedDepth: 1, baselineSuggestion: true, requiredTerms: ["routine"],
  },
  {
    category: "simple_nutrition",
    messages: ["Can cats eat a little plain pumpkin?", "Can she have a tiny bit of cooked egg?", "Is plain chicken okay as a small treat?", "Should I give her a little wet food?", "Can she taste a small piece of cucumber?"],
    previousUser: "She ate her usual breakfast.",
    previousAssistant: "Her appetite sounds normal.",
    safety: "normal", expectedDepth: 1, baselineSuggestion: false, requiredTerms: ["small"],
  },
  {
    category: "practical_behavior_emotion",
    messages: [
      "Lately she keeps biting hard when I pet her, and I feel guilty for getting frustrated.",
      "I love her, but lately she keeps getting overstimulated and biting me.",
      "She has been biting hard for several days and I'm worried I'm making it worse.",
      "I'm exhausted because she keeps biting when she asks for affection.",
      "Lately she follows me, asks for touch, then bites hard and I don't know what to do.",
    ],
    previousUser: "She asks for a lot of attention.",
    previousAssistant: "Short, predictable attention can help.",
    safety: "monitor", expectedDepth: 2, baselineSuggestion: true, requiredTerms: ["stop", "warning"],
  },
  {
    category: "practical_symptom",
    messages: ["She started limping this morning.", "She vomited twice today but kept water down.", "She has been scratching one ear since yesterday.", "She is eating less today but still drinking.", "She coughed a few times after playing."],
    previousUser: "She was acting normally yesterday.",
    previousAssistant: "A new physical change is worth monitoring closely.",
    safety: "monitor", expectedDepth: 2, baselineSuggestion: true, requiredTerms: ["vet"],
  },
  {
    category: "follow_up_delta",
    messages: ["She only does it at night.", "It stops as soon as I leave the room.", "She is still eating normally though.", "It only happens after play.", "She seems fine again in the morning."],
    previousUser: "Why does she bite when I pet her?",
    previousAssistant: "Petting can become overstimulating. Keep contact brief, watch for tail flicks or skin twitching, and stop before she turns toward your hand.",
    safety: "normal", expectedDepth: 2, baselineSuggestion: true, requiredTerms: ["detail"],
  },
  {
    category: "complex_medication",
    messages: [
      "She started medication and now won't eat or drink much.",
      "His new medicine helped the pain, but now he is vomiting and skipping meals.",
      "Since the dose changed, she is sleepy, drinking more, and eating less.",
      "The treatment started yesterday and now she has diarrhea and no appetite.",
      "He takes two medicines and has started vomiting after food.",
    ],
    previousUser: "The vet prescribed a new treatment.",
    previousAssistant: "Track the timing of each dose and any changes.",
    safety: "monitor", expectedDepth: 3, baselineSuggestion: true, requiredTerms: ["medication", "vet"],
  },
  {
    category: "complex_vet_preparation",
    messages: ["Prepare for the vet and summarize the changes this week.", "Can you make appointment notes from her symptoms and routine changes?", "Help me prepare a vet brief for tomorrow.", "What questions should I take to the vet about her recent changes?", "Summarize her week for the clinic visit."],
    previousUser: "Several things have changed this week.",
    previousAssistant: "A concise timeline will help the appointment.",
    safety: "normal", expectedDepth: 3, baselineSuggestion: false, requiredTerms: ["timeline", "vet"],
  },
  {
    category: "urgent_safety",
    messages: ["She can't breathe.", "His gums are blue and he collapsed.", "She is open-mouth breathing and weak.", "He may have eaten poison and is shaking.", "She is unconscious after a fall."],
    previousUser: "Something is very wrong.",
    previousAssistant: "Tell me the immediate signs you see.",
    safety: "urgent", expectedDepth: 4, baselineSuggestion: false, requiredTerms: ["emergency", "now", "avoid"],
  },
];

export function buildAskAnswerEconomyReviewSet(): AskAnswerEconomyReviewCase[] {
  return bases.flatMap((base) => base.messages.map((message, index) => ({
    id: `${base.category}-${index + 1}`,
    category: base.category,
    message,
    previousUser: base.previousUser,
    previousAssistant: base.previousAssistant,
    safety: base.safety,
    expectedDepth: base.expectedDepth,
    baselineSuggestion: base.baselineSuggestion,
    requiredTerms: base.requiredTerms,
    before: inflateBaselineDraft(draftFor(base.category)),
    candidate: draftFor(base.category),
  })));
}

export function measureAskAnswerEconomyBenchmark(cases = buildAskAnswerEconomyReviewSet()) {
  const evaluated = cases.map((item) => evaluateReviewCase(item));
  const before = aggregate(evaluated.map((item) => ({ ...item.beforeMetrics, suggestion: item.baselineSuggestion, depth: item.plan.depth })));
  const after = aggregate(evaluated.map((item) => ({ ...item.afterMetrics, suggestion: item.afterSuggestion, depth: item.plan.depth })));
  const providerCallsBefore = cases.length;
  const providerCallsAfter = cases.length;
  return {
    cases: cases.length,
    before,
    after,
    providerCallsBefore,
    providerCallsAfter,
    approximateOutputTokenReduction: Math.round((before.averageWords - after.averageWords) * cases.length * 1.33),
    qualityPassed: evaluated.filter((item) => Object.values(item.quality).every(Boolean)).length,
    dangerouslyShort: evaluated.filter((item) => !item.quality.safetyCompleteness).length,
    evaluations: evaluated,
  };
}

function evaluateReviewCase(item: AskAnswerEconomyReviewCase) {
  const conversation = [{ role: "user" as const, text: item.previousUser }, { role: "furvise" as const, text: item.previousAssistant }];
  const plan = planAskAnswerDepth({ message: item.message, minimumSafetyLevel: item.safety, recentConversation: conversation });
  const after = applyAskAnswerEconomy(item.candidate, plan, { previousAssistantText: item.previousAssistant });
  const beforeMetrics = measureAskAnswerEconomy(item.before);
  const afterMetrics = measureAskAnswerEconomy(after);
  const rendered = [after.summary, ...after.sections.flatMap((section) => section.items)].join(" ").toLowerCase();
  const historyDecision = evaluateCareHistorySaveWorthiness({
    domain: item.category.includes("medication") ? "medication" : item.category.includes("symptom") ? "health" : "behavior",
    sourceMessage: item.message,
    title: item.message,
    details: item.message,
    transition: "changed",
  });
  const afterSuggestion = item.baselineSuggestion && plan.allowsAutomaticHistory && historyDecision.eligible;
  const upperGuardrail = ({ 0: 70, 1: 170, 2: 330, 3: 540, 4: Number.POSITIVE_INFINITY } as const)[plan.depth];
  const safetyCompleteness = plan.depth !== 4
    ? afterMetrics.words >= 2 && item.requiredTerms.every((term) => rendered.includes(term))
    : item.requiredTerms.every((term) => rendered.includes(term));
  const quality = {
    correctness: item.requiredTerms.filter((term) => term !== "avoid").every((term) => rendered.includes(term)),
    directness: !/^(?:here['’]?s what|the key thing is|it['’]?s worth keeping an eye on)/i.test(after.summary),
    sufficientContext: afterMetrics.words >= (plan.depth === 0 ? 2 : plan.followUpDeltaOnly ? 8 : plan.depth === 1 ? 20 : plan.depth === 2 ? 40 : plan.depth === 3 ? 80 : 80),
    unnecessaryRepetition: afterMetrics.repeatedSemanticContent <= 1,
    actionableValue: plan.depth < 2 || /\b(?:avoid|call|contact|give|keep|note|offer|stop|track|use|watch)\b/i.test(rendered),
    voice: !/\b(?:as an ai|please be advised|leverage|utilize|workflow|system)\b/i.test(rendered),
    safetyCompleteness,
    appropriateDepth: plan.depth === item.expectedDepth && afterMetrics.words <= upperGuardrail && afterMetrics.headings <= plan.maxSections && afterMetrics.bullets <= plan.maxBullets,
  };
  return { ...item, plan, after, beforeMetrics, afterMetrics, afterSuggestion, quality };
}

function aggregate(items: Array<ReturnType<typeof measureAskAnswerEconomy> & { suggestion: boolean; depth: AskAnswerDepth }>) {
  const words = items.map((item) => item.words).sort((left, right) => left - right);
  const byDepth = (depth: AskAnswerDepth) => average(items.filter((item) => item.depth === depth).map((item) => item.words));
  return {
    averageWords: round(average(words)),
    medianWords: percentile(words, 0.5),
    p90Words: percentile(words, 0.9),
    simpleAverageWords: round(byDepth(1)),
    practicalAverageWords: round(byDepth(2)),
    complexAverageWords: round(byDepth(3)),
    averageHeadings: round(average(items.map((item) => item.headings))),
    averageBullets: round(average(items.map((item) => item.bullets))),
    careHistorySuggestionRate: round(items.filter((item) => item.suggestion).length / items.length),
    zeroHeadingPercentage: round(items.filter((item) => item.headings === 0).length / items.length),
  };
}

function draftFor(category: string): AskEconomyAnswer {
  if (category === "ack_social") return { summary: "You're welcome. I'm glad that helped.", sections: [{ heading: "Next steps", items: ["You can come back whenever something changes."] }], safetyNote: null };
  if (category === "casual_roleplay") return { summary: "Mrrp. Come sit with me. I am warm, important, and absolutely not moving from this spot.", sections: [{ heading: "What I want", items: ["One slow blink and a comfortable blanket.", "No serious checklist is needed right now."] }], safetyNote: null };
  if (category === "simple_behavior") return { summary: "This is usually a normal routine or attention habit. Cats repeat behavior that reliably gets company, warmth, or a reaction, so the pattern often says more about what has worked before than about a problem.", sections: [{ heading: "Why this happens", items: ["Your routine gives her a predictable cue.", "The spot may be warm or close to you.", "A reaction can reinforce the habit."] }, { heading: "What to do", items: ["Offer a nearby alternative.", "Reward the alternative consistently.", "Keep your response calm."] }], safetyNote: null };
  if (category === "simple_nutrition") return { summary: "A small amount is usually reasonable when it is plain, unseasoned, and introduced slowly. Keep it to a taste rather than a meal, and stop if it causes vomiting or diarrhea.", sections: [{ heading: "How to offer it", items: ["Start with a very small portion.", "Avoid salt, sauces, butter, and seasoning.", "Keep the usual balanced food as the main diet."] }, { heading: "What to watch", items: ["Vomiting or diarrhea.", "Refusing the regular meal.", "Any ingredient that is toxic to cats."] }], safetyNote: null };
  if (category === "practical_behavior_emotion") return { summary: "That sounds exhausting, especially when she asks for closeness and then bites. Treat the bite as a signal that contact went past her limit, not as something to punish. Give her more control, keep petting brief, and stop at the first warning sign.", sections: [{ heading: "What to do now", items: ["Let her initiate contact and stop after a few seconds.", "Use play or a food puzzle for attention that does not involve touch.", "Pause immediately when her tail flicks or her head turns toward your hand."] }, { heading: "What to avoid", items: ["Do not punish or hold her in place.", "Do not keep petting to test whether she will bite.", "Do not use your hands as play targets."] }, { heading: "What to watch", items: ["Notice whether the warning signs happen in the same places.", "Track whether the behavior is worsening.", "Arrange a vet check if touch seems painful."] }], safetyNote: null };
  if (category === "practical_symptom") return { summary: "A new physical change is worth monitoring today. Keep activity gentle, note when it happens and whether it is getting worse, and contact the vet if it continues or affects eating, drinking, breathing, or normal movement.", sections: [{ heading: "Check now", items: ["Look for swelling, pain, or repeated episodes.", "Note appetite, water intake, and energy.", "Keep a short timeline for the vet."] }, { heading: "Call the vet", items: ["The change persists or worsens.", "She cannot use the limb normally.", "She stops eating or seems very unwell."] }, { heading: "Avoid", items: ["Do not give human medication.", "Do not force exercise.", "Do not repeatedly press a painful area."] }], safetyNote: null };
  if (category === "follow_up_delta") return { summary: "Petting can become overstimulating. Keep contact brief, watch for tail flicks or skin twitching, and stop before she turns toward your hand. That new detail helps narrow the pattern: compare what happens immediately before it and adjust that specific trigger.", sections: [{ heading: "What to do", items: ["Keep petting sessions short.", "Stop at the first warning sign.", "Write down when the new detail appears."] }, { heading: "What to watch", items: ["Look for the same timing tomorrow.", "Notice whether appetite and energy remain normal.", "Call the vet if the pattern becomes painful or sudden."] }], safetyNote: null };
  if (category === "complex_medication") return { summary: "A change after starting medication deserves a same-day call to the prescribing vet, especially when appetite, drinking, vomiting, or energy also changed. Do not stop or repeat a dose unless the clinic tells you to. Write down each dose, meal, symptom, and time so the vet can compare the sequence.", sections: [{ heading: "Call with", items: ["The medication name, dose, and last dose time.", "When appetite or drinking changed.", "How often vomiting or diarrhea occurred."] }, { heading: "Until you hear back", items: ["Offer water and the usual tolerated food without forcing it.", "Keep her quiet and observe breathing and responsiveness.", "Avoid adding supplements or human medication."] }, { heading: "Go urgently if", items: ["She cannot keep water down.", "She becomes weak, collapses, or has trouble breathing.", "You suspect an overdose or wrong medication."] }], safetyNote: null };
  if (category === "complex_vet_preparation") return { summary: "Build the vet discussion around a short timeline: what changed first, what followed, what stayed normal, and what you already tried. Include dates, frequency, medication or diet changes, and two or three examples that show the pattern without turning the note into a transcript.", sections: [{ heading: "Timeline", items: ["List the first noticeable change and date.", "Add worsening, improvement, and recurrence points.", "Note what remained normal."] }, { heading: "Bring", items: ["Medication and food names.", "Photos or video of intermittent signs.", "Recent appetite, weight, and litter details."] }, { heading: "Ask the vet", items: ["Which causes need ruling out first?", "What should be monitored at home?", "What change should trigger an urgent return?"] }], safetyNote: null };
  return { summary: "Contact an emergency veterinarian now and start traveling if you can do so safely. Keep her quiet, minimize handling, and call the clinic on the way so they can prepare. Avoid food, water, medication, or home remedies unless a veterinary professional specifically directs them.", sections: [{ heading: "Do now", items: ["Call the nearest emergency clinic.", "Move her with as little stress as possible.", "Bring any package or exposure information."] }, { heading: "Avoid", items: ["Do not wait for another symptom.", "Do not induce vomiting unless directed.", "Do not give human medication."] }, { heading: "Tell the clinic", items: ["What happened and when.", "Current breathing and responsiveness.", "Any possible toxin, injury, or medication exposure."] }], safetyNote: null };
}

function inflateBaselineDraft(draft: AskEconomyAnswer): AskEconomyAnswer {
  const decorative = {
    heading: "Next steps",
    items: [
      "Keep watching the overall pattern and take note of anything that changes.",
      "Review the same points again if the behavior continues.",
      "Consider the context, timing, and other details together.",
    ],
  };
  return {
    ...draft,
    summary: `${draft.summary} The key thing is to keep the full situation in mind and continue watching for changes so you can decide what to do next.`,
    sections: [...draft.sections.map((section) => ({ ...section, items: [...section.items, ...section.items.slice(0, 2)] })), decorative],
  };
}

function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function round(value: number) { return Math.round(value * 100) / 100; }
function percentile(sorted: number[], value: number) { return sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)] || 0; }
