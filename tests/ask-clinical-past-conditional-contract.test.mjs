import test from "node:test";
import assert from "node:assert/strict";
import {
  validateClinicalAssessment, decodeClinicalSelection, emergencyHandoffForAssessment,
} from "../app/lib/ask-read-only/clinical-policy.mjs";

// Synthetic, privacy-safe counterpart of the failed November 18 preview prompt.
const pastAndNowNormal = "Last month Cedar had trouble breathing, but he is breathing normally now and has no current symptoms. If it happens again, when should I seek emergency care?";
const ownerStatements = [{ ref: "owner1", text: pastAndNowNormal }];
const assessment = (events, careContext = "clinical_history") => ({
  medicationIntent: "none", referent: "clear", missingContext: [],
  careContext,
  eventAssessments: events.map(([occurrence, event = "breathing_distress", ownerStatementRef = "owner1"]) => ({
    event, occurrence, ownerStatementRef,
  })),
});
const tools = [{ name: "read_pet_profile", parameters: { properties: { pet: { enum: ["p1"] } } } }];
const selection = (safety, pet = null, reads = []) => ({
  safety, reads, draft: "",
  historyIntent: { requested: false, timeBasis: "event", pet },
  workflowIntent: "none",
});

test("historical breathing event plus future recurrence does not become a current emergency", () => {
  const result = validateClinicalAssessment(assessment([["historical"], ["conditional"]]), ownerStatements);
  assert.deepEqual(result.currentEvents, []);
  assert.deepEqual(result.conditionalEvents, ["breathing_distress"]);
  assert.equal(result.scenario, "hypothetical");
  assert.equal(result.careContext, "clinical_history");
  assert.equal(emergencyHandoffForAssessment(result), null);
});

test("explicitly normal now can coexist with past and conditional warning, never current", () => {
  const result = decodeClinicalSelection(selection(assessment([["historical"], ["negated"], ["conditional"]])), tools, {
    question: pastAndNowNormal,
    ownerStatementRefs: [{ ref: "owner1", question: true }],
    dialogue: [],
  });
  assert.deepEqual(result.safety.currentEvents, []);
  assert.deepEqual(result.safety.conditionalEvents, ["breathing_distress"]);
  assert.equal(result.safety.careContext, "clinical_history");
  assert.equal(result.calls.length, 0);
});

test("present emergency retains current status with a valid owner statement", () => {
  const refs = [{ ref: "owner1", text: "Cedar is struggling to breathe right now." }];
  const result = validateClinicalAssessment(assessment([["current"]], "current_concern"), refs);
  assert.deepEqual(result.currentEvents, ["breathing_distress"]);
  assert.equal(result.urgency, "immediate");
});

test("model cannot combine a current event with past or conditional meaning", () => {
  for (const occurrences of [["current", "conditional"], ["historical", "current"], ["negated", "current"]]) {
    assert.throws(() => validateClinicalAssessment(assessment(occurrences.map(k => [k])), ownerStatements), /ASK_READ_CLINICAL_CONTRACT/);
  }
});

test("a duplicate occurrence or unsupported event must still fail closed", () => {
  assert.throws(() => validateClinicalAssessment(assessment([["historical"], ["historical"]]), ownerStatements), /ASK_READ_CLINICAL_CONTRACT/);
  assert.throws(() => validateClinicalAssessment(assessment([["conditional", "invented_diagnosis"]]), ownerStatements), /ASK_READ_CLINICAL_CONTRACT/);
});

test("current event without verified owner statement reference still fails closed", () => {
  assert.throws(() => validateClinicalAssessment(assessment([["current", "breathing_distress", null]]), ownerStatements), /ASK_READ_CLINICAL_CONTRACT/);
  assert.throws(() => validateClinicalAssessment(assessment([["current", "breathing_distress", "owner99"]]), ownerStatements), /ASK_READ_CLINICAL_CONTRACT/);
});

test("no saved-record request remains source-free and never invents a pet record", () => {
  const result = decodeClinicalSelection(selection(assessment([], "none")), tools, {
    question: "What does trouble breathing mean in general?",
    ownerStatementRefs: [{ ref: "owner1", question: true }],
    dialogue: [],
  });
  assert.deepEqual(result.calls, []);
  assert.deepEqual(result.safety.currentEvents, []);
  assert.deepEqual(result.safety.conditionalEvents, []);
  assert.equal(result.historyIntent.requested, false);
});

test("an unauthorized pet handle is not accepted in the clinical history intent", () => {
  assert.throws(() => decodeClinicalSelection(selection(assessment([], "none"), "p2"), tools, {
    question: "Please review a different pet",
    ownerStatementRefs: [{ ref: "owner1", question: true }],
    dialogue: [],
  }), /ASK_READ_CLINICAL_CONTRACT/);
});
