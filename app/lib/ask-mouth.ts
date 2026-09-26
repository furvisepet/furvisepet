const implementationTracePattern = /\b(?:ai|openai|chatgpt|gpt(?:[-.][a-z0-9.]+)?|language model|model (?:output|response|reasoning|call)|provider (?:call|response|request|error)|system prompt|developer message|hidden instructions?|token (?:budget|limit|count)|semantic contract|structured output schema|generation pipeline|internal prompt)\b/i;

function quoteAwareSegments(value: string) {
  return String(value || "").split(/("(?:[^"\\]|\\.)*"|“[^”]*”)/g);
}

/** Literal quoted owner/source wording is evidence and remains byte-for-byte text.
 * Furvise-authored segments use one deterministic punctuation policy. */
export function normalizeFurviseAuthoredText(value: string) {
  return quoteAwareSegments(value).map((part, index) => index % 2 ? part : part.replace(/\s*—\s*/g, ", ")).join("");
}

/** Implementation details are never a user-visible Furvise answer.
 * Quoted owner/source wording is data, not Furvise-authored prose. */
export function containsFurviseImplementationTrace(value: string) {
  return quoteAwareSegments(value).some((part, index) => index % 2 === 0 && implementationTracePattern.test(part));
}
