type AnswerBody = { summary: string; sections?: { heading: string; items: string[] }[]; safetyNote?: string | null };
const body = (answer: AnswerBody) => [answer.summary, ...(answer.sections || []).flatMap(s => [s.heading, ...s.items]), answer.safetyNote || ""].join("\n");
const placeholder = /^(?:i can help with that|i can help|happy to help|sure|okay|ok)[.!\s]*$/i;
const numbers = (text: string) => [...new Set(text.replace(/(?<=\d),(?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/g) || [])];
/** Last-mile invariant, not a substitute for source review. A transformation
 * cannot silently delete values, uncertainty, attribution or other wording. */
export function answerIntegrityFailure(before: AnswerBody, after: AnswerBody): string | null {
  const original = body(before).trim(), visible = body(after).trim();
  const substantiveBody = [after.summary, ...(after.sections || []).flatMap(s => s.items)].join("\n").trim();
  if (!substantiveBody || placeholder.test(substantiveBody)) return "empty_answer";
  const retained = new Set(numbers(visible));
  if (numbers(original).some(value => !retained.has(value))) return "lost_numeric_fact";
  const uncertainty = /\b(?:not|never|unknown|unrecorded|unavailable|uncertain|cannot|missing)\b|\bno\s+(?:record|diagnosis|medication|dose|cause|reason|evidence)/i;
  if (uncertainty.test(original) && !uncertainty.test(visible)) return "lost_uncertainty";
  // Numeric-set membership alone misses a dropped reason, swapped attribution,
  // or reordered operands. Permit layout markers/whitespace, not word changes.
  const tokens = (value: string) => value.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|`)([^\n]+?)\1/g, "$2")
    .normalize("NFC").match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*|[+-]?\d+(?:[.,]\d+)*|[%/<>=≤≥≠≈±×÷−–+*^()-]/gu) || [];
  if (JSON.stringify(tokens(original)) !== JSON.stringify(tokens(visible))) return "changed_answer_content";
  return null;
}
