import { splitSentencesPreservingFacts } from "./text-segmentation.ts";
import { analyzeOwnerAssertions, unquotedOwnerText } from "./owner-assertion.ts";

/** Scope evidence, not symptom severity. Uncertainty and current questions stay
 * eligible; a hypothetical or explicitly old source is not a current report. */
function scopedClauses(message: string) {
  // Find boundaries on the original source; masking must not erase separators.
  const sentences = splitSentencesPreservingFacts(message);
  const unquoted = unquotedOwnerText(message);
  let from = 0;
  const scopedSentences = sentences.map(sentence => {
    const start = message.indexOf(sentence, from);
    from = start + sentence.length;
    // Slice the full quote mask so quotes spanning multiple sentences stay excluded.
    return unquoted.slice(start, from);
  });
  const blocks = scopedSentences.flatMap(sentence => sentence.split(/[,;]?\s+but\s+(?=now\b|today\b|currently\b)/i));
  // A discourse preamble before a colon must not hide the condition opener
  // from the existing assertion classifier. Scope only that following block;
  // independently reported current clauses remain eligible.
  const conditionBlocks = blocks.flatMap(block => block.split(/\s*:\s*(?=(?:what\s+if|if|unless|suppose|supposing|assuming|imagine|hypothetical(?:ly)?|even if)\b)/i));
  const clauses = conditionBlocks.flatMap(block => /^(?:hypothetically|suppose|supposing|imagine)\b/i.test(block.trim()) ? [] : analyzeOwnerAssertions(block).clauseSpans);
  const historical = /\b(?:(?:years?|months?|weeks?) (?:ago|back)|(?:a )?long (?:time|while) ago|a while back|back then|last (?:year|month)|back in (?:19|20)\d{2}|in (?:19|20)\d{2}|(?:old|previous|past|dated) (?:note|record|report)|when .{1,40} (?:puppy|kitten))\b/i;
  const hypothetical = /\b(?:hypothetically|hypothetical|suppose|supposing|imagine)\b/i;
  const current = clauses.filter(clause => !clause.isConditional && !clause.isAttributed
    && !historical.test(clause.text) && !hypothetical.test(clause.text));
  return { clauses, current };
}

/** Local triage needs boundaries; prompt transport retains its compact shape. */
export function currentSafetyClauses(message: string) { return scopedClauses(message).current; }

export function safetyTemporalScope(message: string) {
  const { clauses, current } = scopedClauses(message);
  return { currentText: current.map(clause => clause.text).join(" "),
    hasNonCurrentContext: current.length < clauses.length || /\b(?:hypothetically|suppose|supposing|imagine)\b/i.test(message),
    instruction: "Only currentText may establish a current emergency. Historical and hypothetical context may need explanation or conditional guidance, never a claim that an emergency is happening now. Uncertain current symptoms still need safety guidance." };
}
