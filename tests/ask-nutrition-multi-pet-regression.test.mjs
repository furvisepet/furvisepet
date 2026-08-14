import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveAuthoritativeTurnSubject } from "../app/lib/intelligence/entities/resolve-turn-subject.ts";
import { governCanonicalEvents, governCanonicalEventsForOwnedPets } from "../app/lib/intelligence/semantic-events.ts";
import { oneSemanticEventPerPet, persistSemanticEventRpc, temporalForSemanticPersistence } from "../app/lib/intelligence/semantic-event-persistence.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";

const milo = { id: "pet-milo", name: "Milo", species: "dog", age_value: 4, age_unit: "years" };
const coco = { id: "pet-coco", name: "Coco", species: "dog", age_value: 3, age_unit: "years" };

test("a selected-pet reduced-appetite observation uses source chronology and persists through the semantic RPC", async () => {
  const message = "She hasn't eaten much today.";
  const governed = governCanonicalEvents({
    proposals: [event({
      subject: { type: "pet", name: "Milo" }, domain: "nutrition", topic: "appetite_reduced",
      eventTitle: "Reduced appetite", transition: "observed", state: "monitoring",
      temporal: { occurredAt: "2026-08-14T12:00:00.000Z", explicitTime: "today" },
      importance: "important", confidence: 0.97, sourceExcerpt: message,
    })],
    message,
    resolvedPetSubject: milo,
    activeEpisodes: [],
    subjectConfidence: 0.99,
  });
  assert.equal(governed.accepted.length, 1);

  const calls = [];
  const result = await persistSemanticEventRpc({
    event: governed.accepted[0], fallbackPetId: milo.id, sourceMessageId: "message-1", userId: "owner-1",
    supabase: { rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [{ persistence_status: "persisted", care_entry_id: "care-1" }], error: null };
    } },
  });
  assert.equal(result.error, null);
  assert.equal(result.data[0].persistence_status, "persisted");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "persist_furvise_semantic_event");
  assert.equal(calls[0].args.p_pet_id, milo.id);
  assert.equal(calls[0].args.p_event.domain, "nutrition");
  assert.equal(calls[0].args.p_event.transition, "observed");
  assert.deepEqual(calls[0].args.p_event.temporal, { occurredAt: null, explicitTime: "today" });
});

test("only explicitly supported current-day wording drops an unsupported model instant", () => {
  assert.equal(temporalForSemanticPersistence({ occurredAt: "2026-08-14T12:00:00Z", explicitTime: "today" }).occurredAt, null);
  assert.equal(temporalForSemanticPersistence({ occurredAt: "2026-08-12T09:30:00Z", explicitTime: "Wednesday at 9:30" }).occurredAt, "2026-08-12T09:30:00Z");
});

test("mixed named-pet context does not block Milo's grounded symptom", () => {
  const message = "Milo has diarrhea but Coco is fine.";
  const frame = frameFor(message, [
    claim("milo", "Milo", "diarrhea", "temporary"),
    claim("coco", "Coco", "overall wellbeing", "temporary"),
  ]);
  const resolution = resolve(frame, message, [milo, coco]);
  assert.equal(resolution.requiresClarification, false);
  assert.deepEqual(resolution.petIds, [milo.id, coco.id]);

  const governed = governCanonicalEventsForOwnedPets({
    proposals: [event({ subject: { type: "pet", name: "Milo" }, topic: "diarrhea", eventTitle: "Diarrhea observed", sourceExcerpt: "Milo has diarrhea" })],
    message, pets: [milo, coco], activeEpisodes: [], subjectConfidence: 0.99,
  });
  assert.equal(governed.accepted.length, 1);
  assert.equal(governed.accepted[0].event.subject.id, milo.id);
});

test("two owned pets' medical observations are governed independently", () => {
  const message = "Milo is vomiting and Coco is limping.";
  const frame = frameFor(message, [
    claim("milo", "Milo", "vomiting", "temporary"),
    claim("coco", "Coco", "limping", "temporary"),
  ]);
  const resolution = resolve(frame, message, [milo, coco]);
  assert.equal(resolution.requiresClarification, false);

  const governed = governCanonicalEventsForOwnedPets({
    proposals: [
      event({ subject: { type: "pet", name: "Milo" }, topic: "vomiting", eventTitle: "Vomiting observed", sourceExcerpt: "Milo is vomiting" }),
      event({ subject: { type: "pet", name: "Coco" }, topic: "limping", eventTitle: "Limping observed", sourceExcerpt: "Coco is limping" }),
    ],
    message, pets: [milo, coco], activeEpisodes: [], subjectConfidence: 0.99,
  });
  assert.deepEqual(governed.accepted.map((item) => item.event.subject.id), [milo.id, coco.id]);
  assert.deepEqual(oneSemanticEventPerPet(governed.accepted, milo.id).map((item) => item.event.subject.id), [milo.id, coco.id]);
});

test("an unknown explicit pet fails the entire mixed turn closed", () => {
  const message = "Milo is vomiting but UnknownPet is fine.";
  const frame = frameFor(message, [
    claim("milo", "Milo", "vomiting", "temporary"),
    claim("unknown", "UnknownPet", "overall wellbeing", "temporary"),
  ]);
  const resolution = resolve(frame, message, [milo, coco]);
  assert.equal(resolution.requiresClarification, true);
  assert.deepEqual(resolution.petIds, []);
  assert.equal(resolution.petId, null);
});

test("a genuinely ambiguous pronoun beside a named pet still clarifies", () => {
  const message = "He has diarrhea but Coco is fine.";
  const frame = frameFor(message, [
    claim("pronoun", "He", "diarrhea", "temporary"),
    claim("coco", "Coco", "overall wellbeing", "temporary"),
  ]);
  const resolution = resolve(frame, message, [milo, coco]);
  assert.equal(resolution.requiresClarification, true);
  assert.equal(resolution.petId, null);
});

test("multi-pet care idempotency is scoped by target pet and safe database errors remain diagnosable", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260813010000_allow_one_ask_care_event_per_pet.sql", import.meta.url), "utf8");
  assert.match(migration, /user_id, pet_profile_id, intelligence_source_message_id/);
  assert.match(migration, /persist_furvise_intelligence/);
  assert.match(migration, /persist_furvise_care_event_with_concern/);
  assert.match(migration, /ASK_CARE_IDEMPOTENCY_GUARD_UNEXPECTED/);
  const logging = readFileSync(new URL("../app/lib/security/logging.ts", import.meta.url), "utf8");
  assert.match(logging, /errorIdentifier: safeDatabaseIdentifier/);
  assert.match(logging, /sqlState: typeof value\?\.code/);
});

function resolve(frame, message, pets) {
  return resolveAuthoritativeTurnSubject({
    frame, message, ownerId: "owner-1", pets, recentConversation: [], selectedPetId: milo.id,
  });
}

function frameFor(message, inputs) {
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION,
    frameLocalId: "frame_1",
    discourseActs: [{ kind: "statement", confidence: 0.99 }],
    mentions: inputs.map((input) => ({
      localId: input.ref, surface: input.surface, coarseType: "animal", confidence: 0.99,
      attributes: { species: null, lifeStage: null, ownership: "unknown" }, evidence: [{ surfaceText: input.surface }],
    })),
    references: [],
    claims: inputs.map((input, index) => ({
      localId: `claim_${index + 1}`, kind: "assertion", subjectRef: input.ref,
      predicate: concept(input.predicate), polarity: "affirmed", modality: "asserted",
      temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" },
      uncertainty: { confidence: 0.98, reasons: [] }, evidence: [{ surfaceText: message }],
      persistenceHint: "current_state", value: true, unit: null, durability: input.durability,
    })),
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}

function claim(ref, surface, predicate, durability) {
  return { ref, surface, predicate, durability };
}

function concept(label) {
  return { label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] };
}

function event(overrides = {}) {
  return {
    subject: { type: "pet", name: "Milo" }, domain: "health", topic: "symptom", eventTitle: "Symptom observed",
    transition: "observed", state: "active", temporal: { occurredAt: null, explicitTime: null },
    importance: "important", confidence: 0.97, sourceExcerpt: "Milo has a symptom", ...overrides,
  };
}
