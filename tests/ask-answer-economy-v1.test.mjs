import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyAskAnswerEconomy,
  measureAskAnswerEconomy,
  planAskAnswerDepth,
} from "../app/lib/ai/ask-answer-economy.ts";
import {
  buildAskAnswerEconomyReviewSet,
  measureAskAnswerEconomyBenchmark,
} from "../app/lib/ai/ask-answer-economy-benchmark.ts";
import { classifyUserTurn } from "../app/lib/ai/turn-classifier.ts";
import { deriveConversationTitle } from "../app/lib/ask-conversations.ts";
import { evaluateCareHistorySaveWorthiness } from "../app/lib/intelligence/care-history-policy.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("answer depth is earned by reasoning needs rather than message length or emotion", () => {
  assert.equal(planAskAnswerDepth({ message: "thanks" }).depth, 0);
  assert.equal(planAskAnswerDepth({ message: "Why does she follow me?" }).depth, 1);
  assert.equal(planAskAnswerDepth({ message: "I need real advice because I feel frustrated and guilty. Lately she keeps biting hard when I pet her." }).depth, 2);
  assert.equal(planAskAnswerDepth({ message: "She started medication and now will not eat or drink." }).depth, 3);
  assert.equal(planAskAnswerDepth({ message: "She cannot breathe.", minimumSafetyLevel: "urgent" }).depth, 4);
  assert.equal(planAskAnswerDepth({ message: "Can you talk to me like her for a minute?" }).depth, 0);
});

test("semantic section and bullet budgets remove decorative structure without truncating urgent guidance", () => {
  const draft = {
    summary: "Here’s what to do: Give her more control over contact and stop when she turns toward your hand.",
    sections: [
      { heading: "What to do", items: ["Keep petting brief.", "Stop at the first warning sign.", "Offer play instead."] },
      { heading: "What to watch", items: ["Watch for tail flicks.", "Watch for skin twitching.", "Notice head turns."] },
      { heading: "Next steps", items: ["Keep a long diary.", "Review every detail."] },
    ],
    safetyNote: null,
  };
  const practical = planAskAnswerDepth({ message: "Lately she keeps biting hard when I pet her." });
  const economical = applyAskAnswerEconomy(draft, practical);
  const metrics = measureAskAnswerEconomy(economical);
  assert.equal(economical.sections.length, 1);
  assert.ok(metrics.bullets <= 4);
  assert.doesNotMatch(economical.summary, /^Here’s what to do/i);
  assert.match(economical.sections.flatMap((section) => section.items).join(" "), /Review every detail/);

  const urgent = planAskAnswerDepth({ message: "She cannot breathe.", minimumSafetyLevel: "urgent" });
  const urgentAnswer = applyAskAnswerEconomy(draft, urgent);
  assert.equal(urgentAnswer.summary, draft.summary);
  assert.equal(urgentAnswer.sections.length, draft.sections.length);
});

test("simple answers collapse headings into a compact complete paragraph", () => {
  const simple = planAskAnswerDepth({ message: "Why does she follow me?" });
  const answer = applyAskAnswerEconomy({
    summary: "She probably follows you for company and routine.",
    sections: [{ heading: "What to do", items: ["Offer a nearby resting spot.", "Reward calm independent time.", "Keep a predictable routine."] }],
    safetyNote: null,
  }, simple);
  assert.equal(answer.sections.length, 0);
  assert.match(answer.summary, /nearby resting spot/i);
  assert.ok(measureAskAnswerEconomy(answer).words < 80);
});

test("follow-up delta shaping removes a repeated prior explanation", () => {
  const previous = "Petting can become overstimulating. Keep contact brief and stop before she turns toward your hand.";
  const plan = planAskAnswerDepth({
    message: "She only does it at night.",
    recentConversation: [{ role: "user", text: "Why does she bite?" }, { role: "furvise", text: previous }],
  });
  assert.equal(plan.followUpDeltaOnly, true);
  const answer = applyAskAnswerEconomy({
    summary: `${previous} The nighttime detail suggests checking what happens just before bed.`,
    sections: [],
    safetyNote: null,
  }, plan, { previousAssistantText: previous });
  assert.equal(answer.summary, "The nighttime detail suggests checking what happens just before bed.");
});

test("automatic care-history suggestions require longitudinal value", () => {
  const cases = [
    ["She follows me everywhere today and seems clingy.", false],
    ["She sits on my laptop whenever I work.", false],
    ["She has a new meowing quirk every evening.", false],
    ["Lately she keeps biting hard when I pet her.", true],
    ["She has been hiding for the past few days.", true],
    ["She started limping this morning.", true],
  ];
  for (const [sourceMessage, eligible] of cases) {
    assert.equal(evaluateCareHistorySaveWorthiness({ domain: "behavior", title: sourceMessage, details: sourceMessage, sourceMessage, transition: "changed" }).eligible, eligible, sourceMessage);
  }
  assert.notEqual(classifyUserTurn("Can you talk to me like her for a bit?").intent, "preference");
  assert.notEqual(classifyUserTurn("Talk to me the way she would if she could.").intent, "preference");
});

test("new conversation titles are standalone topics for long messages", () => {
  assert.equal(
    deriveConversationTitle("I need real advice. Lately she’s affectionate and then bites me hard when I pet her.", "Mani"),
    "Managing Mani's biting",
  );
  assert.equal(deriveConversationTitle("She has been hiding under the bed for three days.", "Mani"), "Mani hiding more");
});

test("the executable 60-case review improves density without provider-call or safety regression", () => {
  const review = buildAskAnswerEconomyReviewSet();
  const result = measureAskAnswerEconomyBenchmark(review);
  assert.equal(review.length, 60);
  assert.ok(review.every((item) => item.previousUser && item.previousAssistant));
  assert.equal(result.providerCallsAfter, result.providerCallsBefore);
  assert.ok(result.after.averageWords < result.before.averageWords);
  assert.ok(result.after.averageHeadings < result.before.averageHeadings);
  assert.ok(result.after.averageBullets < result.before.averageBullets);
  assert.ok(result.after.careHistorySuggestionRate < result.before.careHistorySuggestionRate);
  assert.ok(result.after.zeroHeadingPercentage > result.before.zeroHeadingPercentage);
  assert.equal(result.dangerouslyShort, 0);
  assert.equal(result.qualityPassed, 60);
});

test("generation, orchestration, and UI share economy policy without touching reliability identities", () => {
  const reasoning = read("app/lib/ai/ask-reasoning.ts");
  const orchestrator = read("app/lib/ai/ask-orchestrator.ts");
  const route = read("app/api/ask/route.ts");
  const page = read("app/ask/page.tsx");
  assert.match(reasoning, /answerEconomy/);
  assert.match(reasoning, /applyAskAnswerEconomy/);
  assert.match(orchestrator, /answerDepth\.allowsAutomaticHistory/);
  assert.match(page, /Optional care-history save/);
  assert.match(page, /p-3\.5 sm:max-w-3xl sm:p-4/);
  assert.match(route, /deriveAskAttemptId\(logicalTurnId, idempotency\.operation\.ownerToken\)/);
  assert.match(route, /creditDisposition/);
});
