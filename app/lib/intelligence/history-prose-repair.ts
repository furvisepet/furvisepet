import { historyNarrativeSchema, parseHistoryNarrative, type HistoryNarrative } from "./history-narrative.ts";

/** Replacements are proposals. The reconstructed answer still requires review. */
export function proseRepairSchema(count: number) {
  const chunks = historyNarrativeSchema.properties.sentences;
  return { type: "object", additionalProperties: false, required: ["replacements"], properties: {
    replacements: { type: "array", minItems: 1, maxItems: count, items: {
      type: "object", additionalProperties: false, required: ["index", "sentences"], properties: {
        index: { type: "integer", enum: Array.from({length: count}, (_, i) => i) },
        sentences: { ...chunks, maxItems: 9 - count, items: { ...chunks.items, properties: {
          ...chunks.items.properties,
          sourceIds: { ...chunks.items.properties.sourceIds, minItems: 0 },
          text: { ...chunks.items.properties.text, pattern: "^[^\\r\\n]*$" },
        } } },
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
  const replacementsByIndex = new Map<number, HistoryNarrative["sentences"]>();
  for (const item of replacements) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const { index, ...sentence } = item;
    if (!Number.isInteger(index) || index < 0 || index >= draft.sentences.length || replacementsByIndex.has(index)) return fail();
    // Accept the previous single-chunk contract for in-flight proposals too.
    // A text correction must not drop evidence for unchanged facts in that
    // chunk. These remain candidates, not an approval of the replacement.
    const available = availableSourceIds ? new Set(availableSourceIds) : null;
    const originalIds = draft.sentences[index].sourceIds.filter(id => !available || available.has(id));
    // Empty additional citations inherit the unchanged server-held bindings.
    // Old single-chunk proposals remain strict for in-flight compatibility.
    const proposed = "sentences" in sentence && Array.isArray(sentence.sentences)
      ? { ...sentence, sentences: sentence.sentences.map((chunk: unknown) => chunk && typeof chunk === "object" && "sourceIds" in chunk && Array.isArray(chunk.sourceIds)
        ? { ...chunk, sourceIds: [...new Set([...chunk.sourceIds, ...originalIds])] } : chunk) } : { sentences: [sentence] };
    const parsed = parseHistoryNarrative(proposed);
    if (!parsed) return fail();
    replacementsByIndex.set(index, parsed.sentences.map(chunk => ({ ...chunk,
      sourceIds: [...new Set([...chunk.sourceIds, ...originalIds])],
    })));
  }
  const sentences = draft.sentences.flatMap((chunk, index) => replacementsByIndex.get(index) ?? [structuredClone(chunk)]);
  const result = parseHistoryNarrative({ sentences });
  return result || fail();
}
