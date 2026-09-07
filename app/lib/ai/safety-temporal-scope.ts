import { analyzeOwnerAssertions } from "./owner-assertion.ts";

/** Scope evidence, not symptom severity. Uncertainty and current questions stay
 * eligible; a hypothetical or explicitly old source is not a current report. */
export function safetyTemporalScope(message: string) {
  const blocks = message.split(/[,;]?\s+but\s+(?=now\b|today\b|currently\b)/i);
  const clauses = blocks.flatMap(block => /^(?:hypothetically|suppose|supposing|imagine)\b/i.test(block.trim()) ? [] : analyzeOwnerAssertions(block).clauseSpans);
  const historical = /\b(?:(?:years?|months?|weeks?) ago|last (?:year|month)|back in (?:19|20)\d{2}|in (?:19|20)\d{2}|(?:old|previous|past|dated) (?:note|record|report)|when .{1,40} (?:puppy|kitten))\b/i;
  const hypothetical = /\b(?:hypothetically|hypothetical|suppose|supposing|imagine)\b/i;
  const current = clauses.filter(clause => !clause.isConditional && !clause.isAttributed
    && !historical.test(clause.text) && !hypothetical.test(clause.text));
  return { currentText: current.map(clause => clause.text).join(" "),
    hasNonCurrentContext: current.length < clauses.length || /\b(?:hypothetically|suppose|supposing|imagine)\b/i.test(message),
    instruction: "Only currentText may establish a current emergency. Historical and hypothetical context may need explanation or conditional guidance, never a claim that an emergency is happening now. Uncertain current symptoms still need safety guidance." };
}
