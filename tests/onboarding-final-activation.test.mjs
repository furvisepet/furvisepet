import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  ASK_ONBOARDING_SOURCE,
  buildOnboardingAskStarters,
  shouldShowOnboardingAskStarters,
} from "../app/lib/ask-onboarding-entry.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("onboarding remains exactly four steps", () => {
  const source = read("app/onboarding/page.tsx");
  const surface = read("app/onboarding/onboarding-surface.tsx");
  assert.match(surface, /`Step \$\{step \+ 1\} of 4`/);
  assert.match(surface, /grid-cols-4/);
  assert.doesNotMatch(source, /Step 5|of 5|grid-cols-5/);
});

test("post-create uses the same stable onboarding surface as every step", () => {
  const source = read("app/onboarding/page.tsx");
  const surface = read("app/onboarding/onboarding-surface.tsx");
  const activation = source.slice(source.indexOf("function PostCreateActivation"), source.indexOf("function ResumeChoice"));
  assert.match(activation, /<OnboardingViewport><OnboardingSurface/);
  assert.match(activation, /complete/);
  assert.match(activation, /state="success"/);
  assert.match(surface, /max-w-\[780px\]/);
  assert.match(surface, /shadow-\[var\(--shadow-surface-1\)\]/);
  assert.match(surface, /<BrandMark[^>]*showName=\{false\}[^>]*size=\{30\}/);
  assert.doesNotMatch(activation, /max-w-\[500px\]|post-create-success-card|<header|furvise-wordmark|showName=\{true\}/);
});

test("success copy and routes form one focused activation", () => {
  const source = read("app/onboarding/page.tsx");
  const activation = source.slice(source.indexOf("function PostCreateActivation"), source.indexOf("function ResumeChoice"));
  assert.match(activation, />\{pet\.name\} is ready<\/h1>/);
  assert.match(activation, /Start with a question\. Furvise will use what you shared\./);
  assert.match(activation, /`\/ask\?pet=\$\{encodeURIComponent\(pet\.id\)\}&from=onboarding`/);
  assert.match(activation, />Ask Furvise about \{pet\.name\}<\/PrimaryButton>/);
  assert.match(activation, /`\/today\?pet=\$\{encodeURIComponent\(pet\.id\)\}`/);
  assert.match(activation, />Go to Today<\/TextButton>/);
  assert.equal(activation.match(/<PrimaryButton/g)?.length, 1);
  assert.doesNotMatch(activation, /Show me|Skip for now|View profile|checkmark|confetti|\u2713|\u2014/iu);
});

test("the static knowledge demonstration and its dead helper are removed", () => {
  const source = read("app/onboarding/page.tsx");
  const activation = source.slice(source.indexOf("function PostCreateActivation"), source.indexOf("function ResumeChoice"));
  assert.equal(existsSync(new URL("../app/onboarding/post-create-knowledge.ts", import.meta.url)), false);
  assert.doesNotMatch(source, /buildPetKnowledgeRows|buildDurableFileCloser|data-post-create-state="knowledge"/);
  assert.doesNotMatch(activation, /<dl/);
  for (const text of ["See what Furvise knows", "This is Mani's file", "Species", "Weight"]) {
    assert.doesNotMatch(activation, new RegExp(text));
  }
});

test("active pet selection and post-create focus/scroll authority remain intact", () => {
  const source = read("app/onboarding/page.tsx");
  const save = source.slice(source.indexOf("const saved = await savePetProfileForUser"), source.indexOf("} catch (saveFailure)"));
  const activation = source.slice(source.indexOf("function PostCreateActivation"), source.indexOf("function ResumeChoice"));
  assert.ok(save.indexOf("setActivePetId(window.localStorage, saved.id)") < save.indexOf("setSavedPet"));
  assert.match(activation, /window\.scrollTo\(\{ behavior: "auto", left: 0, top: 0 \}\)/);
  assert.match(activation, /headingRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(activation, /behavior: "smooth"/);
});

test("onboarding Ask starters are exact, compact, and name-aware", () => {
  assert.equal(ASK_ONBOARDING_SOURCE, "onboarding");
  assert.deepEqual(buildOnboardingAskStarters("Mani"), [
    "What do you remember about Mani so far?",
    "What should I keep an eye on with Mani?",
    "What should I tell you when something changes?",
  ]);
  const source = read("app/ask/page.tsx");
  const component = source.slice(source.indexOf("function OnboardingAskStarters"), source.indexOf("function UserMessage"));
  assert.match(component, /Try one with \{petName\}/);
  assert.match(component, /min-h-11/);
  assert.equal(component.match(/data-ui="onboarding-starter-question"/g)?.length, 1);
  assert.doesNotMatch(component, /marketing|explanatory|\u2014/iu);
});

test("onboarding starter eligibility requires the explicit resolved pet and a pristine thread", () => {
  const base = {
    activeConversationId: null,
    composerDraft: "",
    explicitPetId: "pet-1",
    onboardingEntryActive: true,
    resolvedPetId: "pet-1",
    threadLength: 0,
  };
  assert.equal(shouldShowOnboardingAskStarters(base), true);
  assert.equal(shouldShowOnboardingAskStarters({ ...base, explicitPetId: "" }), false);
  assert.equal(shouldShowOnboardingAskStarters({ ...base, resolvedPetId: "pet-2" }), false);
  assert.equal(shouldShowOnboardingAskStarters({ ...base, composerDraft: "My question" }), false);
  assert.equal(shouldShowOnboardingAskStarters({ ...base, threadLength: 1 }), false);
  assert.equal(shouldShowOnboardingAskStarters({ ...base, activeConversationId: "conversation-1" }), false);
});

test("starter selection drafts and focuses without submitting or spending", () => {
  const source = read("app/ask/page.tsx");
  const handler = source.slice(source.indexOf("function draftOnboardingQuestion"), source.indexOf("function runAction"));
  assert.match(handler, /dismissOnboardingEntry\(\)/);
  assert.match(handler, /draftSuggestedQuestion\(suggestion\)/);
  assert.match(source, /applySuggestedQuestionDraft\(suggestion/);
  assert.doesNotMatch(handler, /\bask\(|submit\(|fetch\(|idempotentClientFetch|\/api\/ask|quota|credit|conversationJson/);
});

test("onboarding presentation is dismissed without reload and does not resurrect", () => {
  const source = read("app/ask/page.tsx");
  const dismiss = source.slice(source.indexOf("function dismissOnboardingEntry"), source.indexOf("function runAction"));
  const startNew = source.slice(source.indexOf("function startNewQuestion"), source.indexOf("async function submit"));
  assert.match(dismiss, /setOnboardingEntryActive\(false\)/);
  assert.match(dismiss, /replaceAskLocation\(\{ petId: selectedPet \}\)/);
  assert.doesNotMatch(dismiss, /location\.(?:assign|replace)|router\.(?:push|replace)/);
  assert.match(startNew, /dismissOnboardingEntry\(\)/);
  assert.match(source, /if \(value\.trim\(\)\) dismissOnboardingEntry\(\)/);
  assert.match(source, /if \(!prompt[\s\S]*dismissOnboardingEntry\(\)/);
});

test("normal Ask keeps its generic empty state and explicit-pet authority", () => {
  const source = read("app/ask/page.tsx");
  assert.match(source, /const emptyStarters = \[[\s\S]*What has changed recently\?[\s\S]*What should I keep an eye on\?[\s\S]*next vet visit/);
  assert.match(source, /const requestedPet = searchParams\.get\("pet"\)/);
  assert.match(source, /resolveAskPetSelection\(\{ explicitPetId: requestedPet, pets: rows, storedPetId: storedPet \}\)/);
  assert.match(source, /showOnboardingStarters[\s\S]*<OnboardingAskStarters[\s\S]*<EmptyConversation/);
});
