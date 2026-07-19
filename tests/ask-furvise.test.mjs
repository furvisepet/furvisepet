import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAskSaveMetadata,
  buildContextSummary,
  buildGuidanceCareEntry,
  buildGuidanceCareNote,
  buildUrgentAskResponse,
  formatAskResponsePlainText,
  hasUrgentSymptomContext,
  parseAskResponse,
  shouldIncludeProductFeedback,
} from "../app/lib/ask.mjs";

test("Ask Furvise safety gate catches urgent symptom language", () => {
  assert.equal(hasUrgentSymptomContext("My pet collapsed and cannot breathe"), true);
  assert.equal(hasUrgentSymptomContext("Summarize recent changes"), false);
});

test("Ask Furvise only adds product feedback for relevant questions", () => {
  assert.equal(shouldIncludeProductFeedback("Which food worked best?"), true);
  assert.equal(shouldIncludeProductFeedback("Help me prepare for a vet visit"), false);
});

test("Ask Furvise validates and renders structured responses without raw Markdown", () => {
  const response = parseAskResponse({
    title: "**Vet visit preparation**",
    summary: "Use Rocky's saved history.",
    sections: [{ heading: "**Saved facts:**", items: ["`One` recent update"] }],
    safetyNote: null,
  });

  assert.ok(response);
  assert.equal(response.title, "Vet visit preparation");
  assert.equal(response.sections[0].heading, "Saved facts:");
  assert.doesNotMatch(formatAskResponsePlainText(response), /[*`]/);
});

test("Ask Furvise rejects malformed structured responses", () => {
  assert.equal(parseAskResponse({ title: "Missing fields" }), null);
  assert.equal(
    parseAskResponse({
      title: "Invalid items",
      summary: "Summary",
      sections: [{ heading: "Facts", items: "not-an-array" }],
      safetyNote: null,
    }),
    null,
  );
});

test("Ask Furvise builds clean copy, save, context, and urgent safety content", () => {
  const response = parseAskResponse({
    title: "Rocky's recent changes",
    summary: "One appetite change was recorded.",
    sections: [{ heading: "Watch next", items: ["Track appetite and water intake."] }],
    safetyNote: "Contact a veterinarian for medical decisions.",
  });
  assert.ok(response);
  assert.match(formatAskResponsePlainText(response), /Watch next\n- Track appetite/);
  assert.match(buildGuidanceCareNote(response), /^Furvise-generated note/);
  assert.equal(
    buildContextSummary({
      petName: "Rocky",
      profileCount: 1,
      savedDetailCount: 2,
      recentUpdateCount: 1,
    }),
    "Using Rocky's profile, saved details, and 1 recent update.",
  );
  const urgent = buildUrgentAskResponse();
  assert.match(urgent.title, /veterinarian now/i);
  assert.match(urgent.safetyNote, /Furvise organizes care context/);
});

test("saving vet prep guidance creates a concise Furvise care-history entry", () => {
  const rawResponseText =
    "Use these saved facts and recent logs to prepare a clear vet summary for Rocky. Species: dog. ".repeat(12);
  const response = parseAskResponse({
    title: "Vet visit preparation",
    summary: rawResponseText,
    sections: [
      {
        heading: "Questions to ask the vet",
        items: [
          "Ask whether the recent appetite change should be monitored before changing food.",
          "Bring every raw detail from the generated answer into this fake long item.".repeat(8),
        ],
      },
    ],
    safetyNote: "Furvise organizes care context. It does not diagnose or replace a veterinarian.",
  });

  assert.ok(response);
  const saveMetadata = buildAskSaveMetadata(response, {
    intent: "vet_prep",
    question: "Prepare for a vet visit.",
  });
  const entry = buildGuidanceCareEntry(response, saveMetadata);
  assert.equal(entry.category, "general");
  assert.equal(entry.title, "Furvise vet prep summary");
  assert.match(entry.note, /^Furvise-generated note, not veterinary advice\./);
  assert.match(entry.note, /Prepared a vet summary/);
  assert.equal(entry.note.length <= 500, true);
  assert.doesNotMatch(entry.note, /Use these saved facts and recent logs/);
  assert.doesNotMatch(entry.note, /Bring every raw detail/);
  assert.doesNotMatch(entry.note, /does not diagnose or replace a veterinarian/);
});

test("Ask Furvise save eligibility blocks no-record and generic answers", () => {
  const noDiarrhea = parseAskResponse({
    title: "Rocky's diarrhea history",
    summary: "Saved history does not show diarrhea logs for Rocky.",
    sections: [{ heading: "What to log next", items: ["Log stool changes if they happen."] }],
    safetyNote: null,
  });
  const noWater = parseAskResponse({
    title: "Rocky's saved context",
    summary: "I can answer best from saved memory. Furvise has Rocky's profile and 1 recent update.",
    sections: [{ heading: "Recent updates", items: ["Jul 18, 2026 - Behavior - Too sad - been sitting whole day."] }],
    safetyNote: null,
  });
  const generic = parseAskResponse({
    title: "Rocky's care context",
    summary: "Furvise organizes care context. It does not diagnose or replace a veterinarian.",
    sections: [],
    safetyNote: "Furvise organizes care context. It does not diagnose or replace a veterinarian.",
  });

  assert.ok(noDiarrhea);
  assert.ok(noWater);
  assert.ok(generic);
  assert.equal(buildAskSaveMetadata(noDiarrhea, { intent: "symptom_notes", question: "Did Rocky have diarrhea?" }).saveable, false);
  assert.equal(buildAskSaveMetadata(noWater, { intent: "general_pet_question", question: "Is there anything about water intake?" }).saveable, false);
  assert.equal(buildAskSaveMetadata(generic, { intent: "general_pet_question", question: "What should I do?" }).saveable, false);
});

test("Ask Furvise save eligibility allows useful saved facts and maps categories", () => {
  const paw = parseAskResponse({
    title: "Rocky's paw notes",
    summary: "I found a saved paw update for Rocky.",
    sections: [{ heading: "Saved facts used", items: ["Jul 12, 2026 - Symptom - Licked paws after dinner - Paw licking was mild."] }],
    safetyNote: null,
  });
  const food = parseAskResponse({
    title: "Rocky's food notes",
    summary: "Here is the saved food context I found for Rocky.",
    sections: [{ heading: "Saved food updates", items: ["Jul 8, 2026 - Food - Switched from chicken food - Scratching seemed worse."] }],
    safetyNote: null,
  });
  const behavior = parseAskResponse({
    title: "Rocky's saved context",
    summary: "The saved history includes a behavior update.",
    sections: [{ heading: "Recent updates", items: ["Jul 18, 2026 - Behavior - Too sad - been sitting whole day."] }],
    safetyNote: null,
  });
  const pawRecent = parseAskResponse({
    title: "Rocky's saved context",
    summary: "I can answer best from saved memory. Furvise has Rocky's profile and 1 recent update.",
    sections: [{ heading: "Recent updates", items: ["Jul 18, 2026 - Symptom - Licked paws after dinner - Paw licking was mild."] }],
    safetyNote: null,
  });

  assert.ok(paw);
  assert.ok(food);
  assert.ok(behavior);
  assert.ok(pawRecent);
  assert.equal(buildAskSaveMetadata(paw, { intent: "symptom_notes", question: "Do we have any notes about paws?" }).saveable, true);
  assert.equal(buildAskSaveMetadata(paw, { intent: "symptom_notes", question: "Do we have any notes about paws?" }).saveCategory, "symptom");
  assert.equal(buildAskSaveMetadata(paw, { intent: "general_pet_question", question: "Do we have any notes about paws?" }).saveCategory, "symptom");
  assert.equal(buildAskSaveMetadata(pawRecent, { intent: "general_pet_question", question: "Do we have any notes about paws?" }).saveable, true);
  assert.equal(buildAskSaveMetadata(pawRecent, { intent: "general_pet_question", question: "Do we have any notes about paws?" }).saveCategory, "symptom");
  assert.equal(buildAskSaveMetadata(food, { intent: "food_notes", question: "Any food notes?" }).saveCategory, "food");
  assert.equal(buildAskSaveMetadata(behavior, { intent: "general_pet_question", question: "Any behavior notes?" }).saveCategory, "behavior");
});

test("vet prep save eligibility requires actual recent saved updates", () => {
  const withLog = parseAskResponse({
    title: "Vet prep for Rocky",
    summary: "Use these saved facts and recent logs to prepare a clear vet summary for Rocky.",
    sections: [
      { heading: "Saved profile facts", items: ["Species: dog."] },
      { heading: "Recent saved updates", items: ["Jul 18, 2026 - Behavior - Too sad - been sitting whole day."] },
      { heading: "What to ask the vet", items: ["Could this change in activity or mood be related to pain?", "What signs would make this urgent?", "What should I track over the next 24-48 hours?"] },
    ],
    safetyNote: "Furvise organizes care context. It does not diagnose or replace a veterinarian.",
  });
  const withoutLog = parseAskResponse({
    title: "Vet prep for Rocky",
    summary: "Use these saved facts and recent logs to prepare a clear vet summary for Rocky.",
    sections: [
      { heading: "Saved profile facts", items: ["Species: dog."] },
      { heading: "Recent saved updates", items: ["Furvise does not have care updates for Rocky yet."] },
      { heading: "What to ask the vet", items: ["What signs would make this urgent?"] },
    ],
    safetyNote: "Furvise organizes care context. It does not diagnose or replace a veterinarian.",
  });

  assert.ok(withLog);
  assert.ok(withoutLog);
  const metadata = buildAskSaveMetadata(withLog, { intent: "vet_prep", question: "Prepare for a vet visit." });
  assert.equal(metadata.saveable, true);
  assert.equal(metadata.saveCategory, "general");
  assert.match(metadata.saveDetail, /behavior update: "Too sad - been sitting whole day"/);
  assert.equal(buildAskSaveMetadata(withoutLog, { intent: "vet_prep", question: "Prepare for a vet visit." }).saveable, false);
});

test("saved Furvise guidance titles match answer type when available", () => {
  const cases = [
    ["Recent changes for Rocky", "Summarized the recent changes from saved updates.", "Furvise recent changes summary"],
    ["Recent changes for Rocky", "Appetite and meal notes changed in the latest saved updates.", "Furvise recent changes summary"],
    ["Food notes", "Summarized food, meals, and appetite context.", "Furvise food notes summary"],
    ["Symptom notes", "No vomiting logs found in saved symptom updates.", "Furvise symptom notes summary"],
    ["Last week logs", "Reviewed last week care logs.", "Furvise log summary"],
    ["Guidance", "General tracking guidance from saved context.", "Furvise guidance summary"],
  ];

  for (const [title, summary, expectedTitle] of cases) {
    const response = parseAskResponse({ title, summary, sections: [], safetyNote: null });
    assert.ok(response);
    const entry = buildGuidanceCareEntry(response);
    assert.equal(entry.title, expectedTitle);
    assert.equal(entry.note.length <= 500, true);
    assert.doesNotMatch(entry.note, new RegExp(summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("saved symptom guidance uses actual saved facts instead of no-record phrasing", () => {
  const response = parseAskResponse({
    title: "Symptom notes",
    summary: "Rocky has itching notes, and no vomiting logs found in the saved care history.",
    sections: [{ heading: "Saved symptom updates", items: ["Itching after dinner was logged."] }],
    safetyNote: null,
  });

  assert.ok(response);
  const saveMetadata = buildAskSaveMetadata(response, {
    intent: "symptom_notes",
    question: "Do we have any notes about itching?",
  });
  const entry = buildGuidanceCareEntry(response, saveMetadata);
  assert.equal(entry.title, "Furvise symptom notes summary");
  assert.match(entry.note, /Itching after dinner was logged/);
  assert.doesNotMatch(entry.note, /no vomiting/i);
});
