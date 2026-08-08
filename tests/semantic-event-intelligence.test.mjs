import assert from "node:assert/strict";
import test from "node:test";

import { urgentSemanticTitle } from "../app/lib/ai/ask-reasoning.ts";
import { governCanonicalEvents, learningFromSemanticEvent, semanticEpisodeKey } from "../app/lib/intelligence/semantic-events.ts";

const pet = { id: "pet-luna", name: "Luna" };
const base = (overrides = {}) => ({
  subject: { type: "pet", name: "Luna" }, domain: "safety", topic: "pet_missing", eventTitle: "Luna ran away", transition: "started", state: "active",
  temporal: { occurredAt: null, explicitTime: "today" }, importance: "urgent", confidence: 0.99,
  sourceExcerpt: "Luna ran away during our walk", ...overrides,
});
const episode = (domain, topic, overrides = {}) => ({
  id: `${domain}-${topic}`, pet_profile_id: pet.id, normalized_key: semanticEpisodeKey(domain, topic), episode_type: "care_tracking",
  title: topic, linked_concern_id: null, severity: "important", status: "active", sequence_number: 1, recurrence_of: null,
  started_at: "2026-08-07T10:00:00Z", last_event_at: "2026-08-07T10:00:00Z", resolved_at: null, ...overrides,
});

test("a general safety event opens and a related pronoun follow-up resolves the owned episode", () => {
  const opened = governCanonicalEvents({ proposals: [base()], message: "Luna ran away during our walk", pet, activeEpisodes: [] });
  assert.equal(opened.accepted[0].destination, "episode_current_state");
  assert.equal(opened.accepted[0].event.normalizedTopic, "pet_missing");

  const active = episode("safety", "missingpet", { summary: { semanticDomain: "safety", semanticTopic: "missingpet" } });
  const resolved = governCanonicalEvents({ proposals: [base({ topic: "missing_pet", eventTitle: "Luna was found", transition: "resolved", state: "resolved", sourceExcerpt: "I found her" })], message: "I found her", pet, activeEpisodes: [active] });
  assert.equal(resolved.accepted[0].event.references.episodeId, active.id);
  assert.equal(resolved.accepted[0].event.state, "resolved");
  assert.equal(resolved.accepted[0].event.normalizedTopic, "missingpet");
  assert.equal(resolved.accepted[0].event.eventTitle, "Luna was found");
});

test("health and nutrition lifecycle topics resolve through the same mechanism", () => {
  for (const sample of [
    { domain: "health", topic: "vomiting", message: "The vomiting stopped" },
    { domain: "nutrition", topic: "appetite_reduced", message: "She started eating normally again" },
    { domain: "behavior", topic: "temporary_reactivity", message: "Her temporary behavior problem has resolved" },
  ]) {
    const active = episode(sample.domain, sample.topic);
    const result = governCanonicalEvents({ proposals: [base({ domain: sample.domain, topic: sample.topic, transition: "resolved", state: "resolved", importance: "routine", sourceExcerpt: sample.message })], message: sample.message, pet, activeEpisodes: [active] });
    assert.equal(result.accepted[0].event.references.episodeId, active.id);
  }
});

test("behavior and food changes use semantic chronology without becoming preference memory", () => {
  const samples = [
    base({ domain: "behavior", topic: "reactivity", transition: "changed", state: "active", importance: "important", sourceExcerpt: "Luna became more reactive on walks" }),
    base({ domain: "nutrition", topic: "food_transition", transition: "started", state: "active", importance: "routine", sourceExcerpt: "I changed Luna's food yesterday" }),
  ];
  for (const proposal of samples) {
    const result = governCanonicalEvents({ proposals: [proposal], message: proposal.sourceExcerpt, pet, activeEpisodes: [] });
    assert.equal(result.accepted[0].destination, "episode_current_state");
    assert.deepEqual(result.accepted[0].destinations, ["care_event", "episode_current_state"]);
    assert.equal(learningFromSemanticEvent(result.accepted[0]), null);
  }
});

test("time-bound completed care routes to History without requiring an ongoing episode", () => {
  const vaccination = base({
    domain: "care", topic: "preventive_immunization", transition: "confirmed", state: "historical",
    temporal: { occurredAt: null, explicitTime: "today" }, importance: "routine", confidence: 0.99,
    sourceExcerpt: "I also got her vaccinated today",
  });
  const result = governCanonicalEvents({ proposals: [vaccination], message: vaccination.sourceExcerpt, pet, activeEpisodes: [] });
  assert.deepEqual(result.accepted[0].destinations, ["care_event"]);
  assert.equal(result.accepted[0].event.temporal.explicitTime, "today");
  assert.equal(learningFromSemanticEvent(result.accepted[0]), null);
});

test("medication and food starts route to both History and current state", () => {
  for (const proposal of [
    base({ domain: "medication", topic: "apoquel_course", transition: "started", state: "active", importance: "routine", sourceExcerpt: "I started giving Luna Apoquel today" }),
    base({ domain: "nutrition", topic: "food_transition", transition: "changed", state: "monitoring", importance: "routine", sourceExcerpt: "I changed Luna's food today" }),
  ]) {
    const result = governCanonicalEvents({ proposals: [proposal], message: proposal.sourceExcerpt, pet, activeEpisodes: [] });
    assert.deepEqual(result.accepted[0].destinations, ["care_event", "episode_current_state"]);
  }
});

test("an improvement updates only a compatible active state", () => {
  const active = episode("health", "limp");
  const improved = base({ domain: "health", topic: "limp", transition: "improved", state: "monitoring", importance: "important", sourceExcerpt: "Luna's limp is better today" });
  const result = governCanonicalEvents({ proposals: [improved], message: improved.sourceExcerpt, pet, activeEpisodes: [active] });
  assert.equal(result.accepted[0].event.references.episodeId, active.id);
  assert.equal(result.accepted[0].event.state, "monitoring");
});

test("medication started and stopped use a generic episode lifecycle", () => {
  const start = base({ domain: "medication", topic: "apoquel_course", transition: "started", state: "active", importance: "routine", sourceExcerpt: "I started giving Luna Apoquel" });
  assert.equal(governCanonicalEvents({ proposals: [start], message: start.sourceExcerpt, pet, activeEpisodes: [] }).accepted.length, 1);
  const active = episode("medication", "apoquel_course", { episode_type: "medication_course" });
  const stop = base({ domain: "medication", topic: "apoquel_course", transition: "resolved", state: "resolved", importance: "routine", sourceExcerpt: "I stopped giving Luna Apoquel" });
  assert.equal(governCanonicalEvents({ proposals: [stop], message: stop.sourceExcerpt, pet, activeEpisodes: [active] }).accepted[0].event.references.episodeId, active.id);
});

test("profile corrections and durable preferences route independently from chronology", () => {
  const correction = base({ domain: "profile", topic: "weight", transition: "corrected", state: "historical", importance: "important", sourceExcerpt: "Actually Luna weighs 58 pounds" });
  const petPreference = base({ domain: "preference", topic: "treat_flavor", transition: "preference_set", state: "historical", importance: "routine", sourceExcerpt: "Luna hates chicken treats" });
  const ownerPreference = base({ subject: { type: "owner", name: null }, domain: "shopping", topic: "maximum_budget", transition: "preference_set", state: "historical", importance: "routine", sourceExcerpt: "Don't recommend anything over $40" });
  assert.equal(governCanonicalEvents({ proposals: [correction], message: correction.sourceExcerpt, pet, activeEpisodes: [] }).accepted[0].destination, "profile_change");
  assert.equal(governCanonicalEvents({ proposals: [petPreference], message: petPreference.sourceExcerpt, pet, activeEpisodes: [] }).accepted[0].destination, "pet_memory");
  assert.equal(governCanonicalEvents({ proposals: [ownerPreference], message: ownerPreference.sourceExcerpt, pet, activeEpisodes: [] }).accepted[0].destination, "owner_memory");
  const governedPreference = governCanonicalEvents({ proposals: [petPreference], message: petPreference.sourceExcerpt, pet, activeEpisodes: [] }).accepted[0];
  const learning = learningFromSemanticEvent(governedPreference);
  assert.equal(learning.subjectType, "pet");
  assert.equal(learning.factKey, "treat_flavor");
  assert.equal(learning.durability, "durable");
  assert.deepEqual(governCanonicalEvents({ proposals: [ownerPreference], message: ownerPreference.sourceExcerpt, pet, activeEpisodes: [] }).accepted[0].destinations, ["owner_memory"]);
});

test("a durable shopping preference is memory-only and casual conversation has no destination", () => {
  const preference = base({ subject: { type: "owner", name: null }, domain: "shopping", topic: "maximum_budget", transition: "preference_set", state: "historical", temporal: { occurredAt: null, explicitTime: null }, sourceExcerpt: "Keep product suggestions under $40" });
  const governed = governCanonicalEvents({ proposals: [preference], message: preference.sourceExcerpt, pet, activeEpisodes: [] });
  assert.deepEqual(governed.accepted[0].destinations, ["owner_memory"]);
  assert.equal(governed.accepted[0].destinations.includes("care_event"), false);
  assert.deepEqual(governCanonicalEvents({ proposals: [], message: "That sounds good, thanks", pet, activeEpisodes: [] }).accepted, []);
});

test("casual turns persist nothing and ambiguous or wrong-pet mutations fail closed", () => {
  assert.deepEqual(governCanonicalEvents({ proposals: [], message: "Thanks!", pet, activeEpisodes: [] }).accepted, []);
  const ambiguous = governCanonicalEvents({ proposals: [base({ transition: "resolved", state: "resolved", sourceExcerpt: "I found her" })], message: "I found her", pet, activeEpisodes: [] });
  assert.equal(ambiguous.rejected[0].reason, "no_compatible_active_episode");
  const wrongPet = governCanonicalEvents({ proposals: [base({ subject: { type: "pet", name: "Maple" } })], message: "Luna ran away during our walk", pet, activeEpisodes: [] });
  assert.equal(wrongPet.rejected[0].reason, "wrong_pet");
  const unknown = governCanonicalEvents({ proposals: [base({ subject: { type: "unknown", name: null }, transition: "resolved", state: "resolved", sourceExcerpt: "They are okay now" })], message: "They are okay now", pet, activeEpisodes: [episode("safety", "pet_missing")] });
  assert.equal(unknown.rejected[0].reason, "ambiguous_subject");
});

test("semantic resolution cannot close an unrelated episode", () => {
  const result = governCanonicalEvents({ proposals: [base({ transition: "resolved", state: "resolved", sourceExcerpt: "I found her" })], message: "I found her", pet, activeEpisodes: [episode("health", "vomiting")] });
  assert.equal(result.rejected[0].reason, "no_compatible_active_episode");
});

test("ambiguous compatible resolution fails closed", () => {
  const proposal = base({ topic: "missing_pet", eventTitle: "Luna was found", transition: "resolved", state: "resolved", sourceExcerpt: "I found her" });
  const result = governCanonicalEvents({ proposals: [proposal], message: proposal.sourceExcerpt, pet, activeEpisodes: [
    episode("safety", "missingpet"), episode("safety", "missing_pet", { id: "second-missing" }),
  ] });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, "ambiguous_episode");
});

test("History titles are presentation text with deterministic validated fallbacks", () => {
  const raw = governCanonicalEvents({ proposals: [base({ topic: "missing_pet", eventTitle: "missing_pet" })], message: base().sourceExcerpt, pet, activeEpisodes: [] });
  assert.equal(raw.accepted[0].event.eventTitle, "Safety incident started");
  const duplicated = base({ domain: "medication", topic: "medication_start", eventTitle: "Started Medication Start", importance: "routine", sourceExcerpt: "I started medication today" });
  const medication = governCanonicalEvents({ proposals: [duplicated], message: duplicated.sourceExcerpt, pet, activeEpisodes: [] });
  assert.equal(medication.accepted[0].event.eventTitle, "Started medication");
  const food = base({ domain: "nutrition", topic: "food_transition", eventTitle: "Food changed", transition: "changed", state: "monitoring", importance: "routine", sourceExcerpt: "I changed Luna's food" });
  assert.equal(governCanonicalEvents({ proposals: [food], message: food.sourceExcerpt, pet, activeEpisodes: [] }).accepted[0].event.eventTitle, "Food changed");
  const vaccination = base({ domain: "care", topic: "preventive_immunization", eventTitle: "Vaccination", transition: "confirmed", state: "historical", importance: "routine", sourceExcerpt: "Luna was vaccinated today" });
  assert.equal(governCanonicalEvents({ proposals: [vaccination], message: vaccination.sourceExcerpt, pet, activeEpisodes: [] }).accepted[0].event.eventTitle, "Vaccination");
  assert.doesNotMatch([raw.accepted[0].event.eventTitle, medication.accepted[0].event.eventTitle].join(" "), /missingpet|missing_pet|Started Medication Start/i);
});

test("urgent presentation is topic-aware and never equates urgency with breathing", () => {
  const missing = base();
  assert.equal(urgentSemanticTitle("Luna", [missing], missing.sourceExcerpt), "Urgent safety guidance for Luna");
  const toxin = base({ domain: "safety", topic: "toxin_exposure", sourceExcerpt: "Luna ate rat poison" });
  assert.equal(urgentSemanticTitle("Luna", [toxin], toxin.sourceExcerpt), "Possible toxin exposure for Luna");
  const breathing = base({ domain: "health", topic: "respiratory_distress", sourceExcerpt: "Luna cannot breathe" });
  assert.equal(urgentSemanticTitle("Luna", [breathing], breathing.sourceExcerpt), "Luna's breathing needs urgent attention");
  const generic = base({ domain: "other", topic: "acute_issue", sourceExcerpt: "Something urgent happened" });
  assert.equal(urgentSemanticTitle("Luna", [generic], generic.sourceExcerpt), "Urgent guidance for Luna");
});
