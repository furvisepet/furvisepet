import { analyzeOwnerAssertions } from "./owner-assertion.ts";
import { hasExplicitPersonSurface, isExplicitExternalAnimalSurface } from "../intelligence/entities/recent-subject-state.ts";
import { alignEvidenceFragments } from "../intelligence/semantic-frame/ground-evidence.ts";

/** Positive subject binding, with discourse carried across ALL source clauses,
 * including clauses a model or the observation extractor did not select. */
export function petObservationSpans(message: string, petName?: string) {
  const analysis = analyzeOwnerAssertions(message);
  if (!petName?.trim()) return [];
  let focus: "pet" | "other" | "unknown" = "unknown";
  const name = petName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const owned = new RegExp(`^${name}(?:['’]s)?\\b`, "i");
  return analysis.clauseSpans.filter((clause) => {
    const text = clause.text.trim().replace(/^(?:and|but|so|then)\s+/i, "").replace(/^(?:please\s+)?(?:save|remember|note)(?:\s+this)?(?:\s+that|\s*:)\s*/i, "")
      .replace(/^(?:i (?:think|believe|guess|noticed|observed)|perhaps|maybe|yesterday|today|now|then|actually)\s*,?\s*/i, "");
    const surface = text.replace(/^(?:over|during|for|in)\s+(?:the\s+)?(?:last|past)\s+(?:\w+\s+)?(?:day|week|month)s?\s*,?\s*/i, "");
    const namedAnimal = /^(?:my|our)\s+(?:cat|dog|pet)\s+([\p{L}'’-]+)\s+(?:has|had|is|was|stopped|started|returned)\b/iu.exec(text);
    if (isExplicitExternalAnimalSurface(text) || hasExplicitPersonSurface(text)
      || /\b[\p{L}]+['’]s\s+(?:cat|dog|pet|puppy|kitten|animal)\b/iu.test(text)) focus = "other";
    else if (owned.test(text)) focus = "pet";
    else if (/^(?:he|she|they|it|his|her|their|its)\b/i.test(surface)) {
      // A genuine animal pronoun in an otherwise unambiguous pet conversation
      // may bind; failure to recognize an explicit noun subject may not.
      if (focus === "unknown") focus = "pet";
    } else if (/^(?:my|our)\s+(?:cat|dog|pet)\b/i.test(text)) focus = namedAnimal && namedAnimal[1].toLowerCase() !== petName.toLowerCase() ? "other" : "pet";
    else if (/^(?:i|we)\s+(?:also\s+)?(?:changed|switched|gave|started|stopped|noticed|observed)\b/i.test(text)
      && /\b(?:her|his|him|she|he)\b/i.test(text) && focus !== "other") focus = "pet";
    else if (/^(?:the\s+)?(?:breathing|vomiting|hiding|no (?:more|further)|still|seems?)\b/i.test(text)) {
      if (focus === "unknown") focus = "pet";
    } else if (!/^(?:i (?:think|believe|guess)|perhaps|maybe)[.!]*$/i.test(text)) focus = "other";
    return focus === "pet" && analysis.assertionSpans.includes(clause);
  });
}

export function isPetObservationEvidence(message: string, evidence: string, petName?: string) {
  const alignment = alignEvidenceFragments([{ surfaceText: evidence }], message).grounded[0];
  if (!alignment) return false;
  const normalized = message.normalize("NFKC").trim();
  const spans = petObservationSpans(normalized, petName);
  if (spans.some((span) => !span.isCertain) && evidence.normalize("NFKC").trim() !== normalized) return false;
  // Check the entire evidence, not a contained supported fragment. Include
  // uncertainty qualifiers in the payload even when the model omits them.
  const evidenceClauses = analyzeOwnerAssertions(evidence).clauseSpans;
  return spans.length > 0 && evidenceClauses.length > 0 && evidenceClauses.every((part) =>
    spans.some((span) => span.text.includes(part.text))
    || /^(?:i (?:think|believe|guess)|perhaps|maybe)[.!]*$/i.test(part.text));
}
