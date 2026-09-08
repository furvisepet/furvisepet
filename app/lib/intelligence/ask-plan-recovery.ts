import { medicationReferencePet } from "./medication-reference.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { emptyProposedSemanticFrame } from "./semantic-frame/extract-frame.ts";
import { explicitlyNamedOwnedPets } from "./entities/resolve-turn-subject.ts";
import type { FurviseLiveContext } from "./types.ts";
import type { AskInterpretation } from "./interpret-ask.ts";

type Context = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "pet" | "currentMessage" | "conversationTurns">;
const reads = new Set(["overview", "recall", "comparison", "status", "general"]);
/** Repair redundant read metadata, never identities, filters or write evidence.
 * The strict validator must still approve the entire normalized proposal. */
export function normalizeAskReadProposal(value: unknown, context: Context): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const p = { ...value as Record<string, unknown> };
  const initialOperation = p.operation;
  // Conditional safety guidance must not become a saved-record lookup merely
  // because the hypothetical mentions an old problem returning.
  if (p.operation !== "update" && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion
    && /\b(?:if|hypothetically|suppose|supposing)\b/i.test(context.currentMessage)
    && /\b(?:breath\w*|collaps\w*|urin\w*|poison\w*|ibuprofen)\b/i.test(context.currentMessage)
    && /\b(?:urgency|urgent|emergency|safe|wait|what (?:should|would))\b/i.test(context.currentMessage)) {
    Object.assign(p, { operation: "general", readOperation: "general", subject: "non_pet", petNames: [],
      selection: "summary", terms: [], from: null, to: null, ordinal: null, episodeTopic: null, frame: emptyProposedSemanticFrame() });
  }
  // A stated quantity within one dated note is not a count of illness episodes.
  // Keep the proposed subject, literal terms and bounds for strict validation.
  const quantityWording = context.currentMessage.replace(/\brather than how many episodes\b/gi, "");
  const datedQuantity = typeof p.from === "string" && typeof p.to === "string"
    && Date.parse(p.to) - Date.parse(p.from) === 86400000
    && /\b(?:stools?|accidents?|tablets?|doses?|courses?)\b/i.test(quantityWording);
  const documentedCourses = /\bmedication courses?\b/i.test(quantityWording)
    && /\b(?:explicitly described|recorded|documented|in (?:the )?(?:notes|records))\b/i.test(quantityWording);
  if (p.operation === "count" && p.readOperation === "count" && p.ordinal === null
    && (datedQuantity || documentedCourses)
    && !/\b(?:episodes?|ever|lifetime|separate|distinct)\b/i.test(quantityWording)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { operation: "recall", readOperation: "recall", selection: datedQuantity ? "reference" : "summary", episodeTopic: null });
  }
  // The requested unit determines the read task. A duration remains a
  // historical read even when its endpoints mention symptoms or episodes.
  // Do not compute from the exclusive retrieval bound or manufacture dates.
  const durationQuantity = /\bhow many\s+(?:hours?|days?|weeks?|months?|years?)\b/i.test(quantityWording);
  const competingCount = /\bhow many\s+(?!(?:hours?|days?|weeks?|months?|years?)\b)\w+|\b(?:count|number|total)\s+(?:of\s+)?(?:[\w-]+\s+){0,3}episodes?\b/i.test(quantityWording);
  if (p.operation === "count" && p.readOperation === "count" && p.ordinal === null
    && durationQuantity && !competingCount
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { operation: "recall", readOperation: "recall", episodeTopic: null });
  }
  // A specifically dated source is located by its day. Requiring a lexical
  // synonym as well can hide that very note (e.g. accidents versus urinated).
  // Keep date, ownership and source-version validation unchanged.
  if (p.operation === "recall" && p.readOperation === "recall" && p.selection === "reference"
    && typeof p.from === "string" && typeof p.to === "string"
    && Date.parse(p.to) - Date.parse(p.from) === 86400000 && p.ordinal === null
    && /\b(?:note|entry|report)\b/i.test(context.currentMessage)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion
    && Array.isArray(p.terms) && p.terms.length <= 6
    && p.terms.every(term => typeof term === "string" && term.length >= 3 && term.length <= 32
      && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term))) p.terms = [];
  // Complete only explicitly open-ended ranges. The strict validator still
  // rejects invalid dates, reversed ranges and missing bounds on closed ranges.
  if (p.operation !== "update") {
    if (p.from !== null && p.to === null && /\b(?:since|onward|onwards|from .+ on)\b/i.test(context.currentMessage)) p.to = "2100-01-01";
    if (p.from === null && p.to !== null && /\b(?:before|prior to|until)\b/i.test(context.currentMessage)) p.from = "1900-01-01";
  }
  const owned = context.eligiblePets.filter(pet => pet.user_id === context.owner.userId);
  const named = explicitlyNamedOwnedPets(context.currentMessage, owned);
  if (p.operation !== "update" && Array.isArray(p.petNames) && p.petNames.length > 3 && named.length > 0 && named.length <= 3
    && p.petNames.every(name => owned.some(pet => pet.name === name))) p.petNames = named.map(pet => pet.name);
  if (p.operation === "update" && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    p.operation = reads.has(String(p.readOperation)) ? p.readOperation : "recall";
    p.readOperation = p.operation;
    p.frame = emptyProposedSemanticFrame();
  }
  // General suitability comparisons need no saved history. Do not convert a
  // general read into historical lookup solely from the comparison verb.
  if (p.subject === "non_pet" && Array.isArray(p.petNames) && !p.petNames.length
    && p.readOperation === "general" && p.operation === "comparison"
    && !/\b(?:recorded|saved|history|notes|earliest|latest)\b/i.test(context.currentMessage)
    && !analyzeOwnerAssertions(context.currentMessage).hasOwnerAssertion) {
    Object.assign(p, { operation: "general", terms: [], from: null, to: null, episodeTopic: null, ordinal: null });
  }
  if (reads.has(String(p.operation)) && reads.has(String(p.readOperation)) && p.operation !== "general") p.readOperation = p.operation;
  if (reads.has(String(p.operation)) && p.readOperation === "clarify" && named.length === 1 && p.ordinal === null) p.readOperation = p.operation;
  if (p.subject === "non_pet" && !named.length && Array.isArray(p.petNames) && !p.petNames.length
    && ["general", "clarify", "update"].includes(String(initialOperation))) {
    Object.assign(p, { operation: "general", readOperation: "general", selection: "summary", terms: [], from: null, to: null, ordinal: null, episodeTopic: null, frame: emptyProposedSemanticFrame() });
  }
  // User-established reference scope applies to confident read plans too:
  // a generic pet-name answer must not bypass medication evidence retrieval.
  // Never reinterpret a proposed write, count, or displayed episode reference.
  const referenceReads = new Set(["clarify", "general", "recall", "status", "overview"]);
  const original = value as Record<string, unknown>;
  const referenceMetadata = original.from === null && original.to === null
    && original.ordinal === null && original.episodeTopic === null
    && Array.isArray(original.terms) && original.terms.length <= 6
    && original.terms.every(term => typeof term === "string" && term.length >= 3
      && term.length <= 32 && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term));
  const medicationPet = referenceMetadata && referenceReads.has(String(initialOperation))
    && referenceReads.has(String(p.operation)) && referenceReads.has(String(p.readOperation))
    && p.from === null && p.to === null && p.ordinal === null && p.episodeTopic === null
    && Array.isArray(p.terms) && p.terms.length <= 6
    && p.terms.every(term => typeof term === "string" && term.length >= 3 && term.length <= 32 && /^[A-Za-z][A-Za-z -]*[A-Za-z]$/.test(term))
    ? medicationReferencePet(context) : null;
  if (medicationPet && Array.isArray(p.petNames) && p.petNames.length <= 1
    && p.petNames.every(name => name === medicationPet.name)
    && ["unclear", "conversation", "selected", "explicit", "non_pet"].includes(String(p.subject))) {
    Object.assign(p, { operation: "recall", readOperation: "recall", subject: "conversation",
      petNames: [medicationPet.name], topic: "medication details", terms: ["medic", "prescri", "course"], selection: "summary" });
  }
  return p;
}

/** Failed planning can still yield conversation, with zero saved-data authority.
 * An empty frame/read-only scope prevents a recovery path from granting writes. */
export function unavailableAskReadPlan(reason: string): AskInterpretation {
  return { version: "ask-interpretation.v1", operation: "general", readOperation: "general", selection: "summary",
    conversationOnly: true, planningRecovery: reason, petIds: [], topic: "general conversation", history: null,
    episodeTopic: null, ordinal: null, readOnly: true, clarification: null, frame: emptyProposedSemanticFrame() };
}
