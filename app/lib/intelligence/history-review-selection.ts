/** A review may select existing sentences, never inject or reorder prose. */
export type HistoryReviewSelection = { approved: boolean; retainedSentenceIndexes: number[] };
export const historyReviewSelectionSchema = {
  type: "object", additionalProperties: false,
  required: ["approved", "retainedSentenceIndexes"],
  properties: {
    approved: { type: "boolean" },
    retainedSentenceIndexes: { type: "array", maxItems: 8, items: { type: "integer", minimum: 0, maximum: 7 } },
  },
};
export function parseHistoryReviewSelection(value: unknown, sentenceCount: number): HistoryReviewSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_REVIEW");
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join() !== "approved,retainedSentenceIndexes" || typeof item.approved !== "boolean"
    || !Array.isArray(item.retainedSentenceIndexes)) throw new Error("INVALID_REVIEW");
  const indexes = item.retainedSentenceIndexes;
  if (indexes.length > sentenceCount || indexes.length > 8
    || indexes.some((index, position) => !Number.isInteger(index) || index < 0 || index >= sentenceCount
      || position > 0 && index <= indexes[position - 1])
    || item.approved !== (indexes.length > 0)) throw new Error("INVALID_REVIEW");
  return { approved: item.approved, retainedSentenceIndexes: [...indexes] };
}
