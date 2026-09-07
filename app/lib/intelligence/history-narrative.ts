/** Draft prose is a model proposal, never persistence or source authority. */
export type HistoryNarrative = { sentences: Array<{ text: string; sourceIds: string[] }> };
export const historyNarrativeSchema = {
  type: ["object", "null"], additionalProperties: false, required: ["sentences"],
  properties: { sentences: { type: "array", minItems: 1, maxItems: 8, items: {
    type: "object", additionalProperties: false, required: ["text", "sourceIds"],
    properties: { text: { type: "string", minLength: 1, maxLength: 650 },
      sourceIds: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", maxLength: 160 } } },
  } } },
};
export function parseHistoryNarrative(value: unknown): HistoryNarrative | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).join() !== "sentences" || !Array.isArray(item.sentences)
    || item.sentences.length < 1 || item.sentences.length > 8) return;
  const sentences: HistoryNarrative["sentences"] = [];
  for (const raw of item.sentences) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const sentence = raw as Record<string, unknown>;
    if (Object.keys(sentence).sort().join() !== "sourceIds,text" || typeof sentence.text !== "string"
      || !sentence.text.trim() || sentence.text.length > 650
      || /[\r\n]/.test(sentence.text) || !Array.isArray(sentence.sourceIds)
      || sentence.sourceIds.length < 1 || sentence.sourceIds.length > 12
      || sentence.sourceIds.some(id => typeof id !== "string" || !id || id.length > 160)) return;
    sentences.push({ text: sentence.text.trim(), sourceIds: [...new Set(sentence.sourceIds as string[])] });
  }
  if (sentences.map(s => s.text).join(" ").length > 3600) return;
  return { sentences };
}
