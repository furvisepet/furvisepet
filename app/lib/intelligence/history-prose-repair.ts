import { historyNarrativeSchema, parseHistoryNarrative, type HistoryNarrative } from "./history-narrative.ts";

/** Replacements are proposals. The reconstructed answer still requires review. */
export function proseRepairSchema(count: number) {
  const sentence = historyNarrativeSchema.properties.sentences.items;
  return { type: "object", additionalProperties: false, required: ["replacements"], properties: {
    replacements: { type: "array", minItems: 1, maxItems: count, items: {
      ...sentence, required: ["index", ...sentence.required], properties: {
        ...sentence.properties,
        text: { ...sentence.properties.text, pattern: "^[^\\r\\n]*$" },
        index: { type: "integer", enum: Array.from({length: count}, (_, i) => i) },
      },
    } },
  } };
}

export function applyProseRepair(draft: HistoryNarrative, value: unknown, availableSourceIds?: readonly string[]): HistoryNarrative {
  const fail = (): never => { throw new Error("INVALID_PROSE_REPAIR"); };
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).join() !== "replacements") return fail();
  const replacements = (value as { replacements: unknown }).replacements;
  if (!Array.isArray(replacements) || !replacements.length || replacements.length > draft.sentences.length) return fail();
  const sentences = structuredClone(draft.sentences), seen = new Set<number>();
  for (const item of replacements) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const { index, ...sentence } = item;
    if (!Number.isInteger(index) || index < 0 || index >= sentences.length || seen.has(index)) return fail();
    const parsed = parseHistoryNarrative({ sentences: [sentence] });
    if (!parsed) return fail();
    // A text correction must not drop evidence for unchanged facts in that
    // chunk. These remain candidates, not an approval of the replacement.
    const available = availableSourceIds ? new Set(availableSourceIds) : null;
    const originalIds = sentences[index].sourceIds.filter(id => !available || available.has(id));
    seen.add(index); sentences[index] = { ...parsed.sentences[0],
      sourceIds: [...new Set([...parsed.sentences[0].sourceIds, ...originalIds])],
    };
  }
  const result = parseHistoryNarrative({ sentences });
  return result || fail();
}
