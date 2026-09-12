import { ASK_HISTORY_MAX_OBLIGATIONS } from "./history-limits.ts";
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

/** A task-level receipt cannot approve a subset that silently drops a requested
 * obligation. Limited evidence is a valid answer only with retained explanation. */
export const TASK_COMPLETION_STATUSES = ["answered", "action_ready", "limited", "missing", "not_requested", "refused", "needs_information"] as const;
export type TaskObligationReview = { index: number; status: typeof TASK_COMPLETION_STATUSES[number]; sentenceIndexes: number[]; actionIndexes?: number[] };
export const taskHistoryReviewSchema = {
  ...historyReviewSelectionSchema,
  required: [...historyReviewSelectionSchema.required, "obligations"],
  properties: { ...historyReviewSelectionSchema.properties,
    obligations: { type: "array", maxItems: ASK_HISTORY_MAX_OBLIGATIONS, items: { type: "object", additionalProperties: false,
      required: ["index", "status", "sentenceIndexes", "actionIndexes"], properties: {
        index: { type: "integer", minimum: 0, maximum: ASK_HISTORY_MAX_OBLIGATIONS - 1 },
        status: { type: "string", enum: ["answered", "limited", "missing", "action_ready", "refused", "needs_information"] },
        sentenceIndexes: historyReviewSelectionSchema.properties.retainedSentenceIndexes,
        actionIndexes: { type: "array", maxItems: 8, items: { type: "integer", minimum: 0, maximum: 7 } },
      } } },
  },
};
export function parseTaskHistoryReview(value: unknown, sentenceCount: number, obligationCount: number, actionCount = 0): HistoryReviewSelection & { obligations: TaskObligationReview[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_TASK_REVIEW");
  const p = value as Record<string, unknown>;
  if (Object.keys(p).sort().join() !== "approved,obligations,retainedSentenceIndexes"
    || !Array.isArray(p.obligations) || p.obligations.length !== obligationCount || obligationCount < 1 || obligationCount > ASK_HISTORY_MAX_OBLIGATIONS) throw new Error("INVALID_TASK_REVIEW");
  const result = parseHistoryReviewSelection({ approved: p.approved, retainedSentenceIndexes: p.retainedSentenceIndexes }, sentenceCount);
  const seen = new Set<number>();
  for (const raw of p.obligations) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_TASK_REVIEW");
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).sort().join() !== ("actionIndexes" in item ? "actionIndexes,index,sentenceIndexes,status" : "index,sentenceIndexes,status")
      || actionCount > 0 && !("actionIndexes" in item)
      || "actionIndexes" in item && (!Array.isArray(item.actionIndexes) || item.actionIndexes.length > 8
        || new Set(item.actionIndexes).size !== item.actionIndexes.length
        || item.actionIndexes.some(index => !Number.isInteger(index) || index < 0 || index >= actionCount))
      || !Number.isInteger(item.index) || (item.index as number) < 0 || (item.index as number) >= obligationCount
      || seen.has(item.index as number) || !["answered", "limited", "missing", "action_ready", "refused", "needs_information"].includes(String(item.status))
      || !Array.isArray(item.sentenceIndexes) || item.sentenceIndexes.length > 8
      || new Set(item.sentenceIndexes).size !== item.sentenceIndexes.length
      || item.sentenceIndexes.some(index => !Number.isInteger(index) || !result.retainedSentenceIndexes.includes(index))
      || result.approved && (item.status === "missing" || !item.sentenceIndexes.length && !(item.actionIndexes as unknown[] | undefined)?.length)
      || ["limited", "refused", "needs_information"].includes(String(item.status)) && !item.sentenceIndexes.length
      || item.status === "action_ready" && !(item.actionIndexes as unknown[] | undefined)?.length
      || item.status === "missing" && (item.sentenceIndexes.length || (item.actionIndexes as unknown[] | undefined)?.length)) throw new Error("INVALID_TASK_REVIEW");
    seen.add(item.index as number);
  }
  if (result.approved && actionCount > 0) {
    const whole = p.obligations.find(item => item.index === 0);
    if (whole?.actionIndexes?.length !== actionCount) throw new Error("UNREVIEWED_NAVIGATION");
  }
  return { ...result, obligations: structuredClone(p.obligations) as TaskObligationReview[] };
}

/** Feedback is untrusted repair guidance, never approval or new evidence. */
export const repairableTaskHistoryReviewSchema = {
  ...taskHistoryReviewSchema,
  required: [...taskHistoryReviewSchema.required, "rejectionReason"],
  properties: { ...taskHistoryReviewSchema.properties,
    rejectionReason: { type: ["string", "null"], maxLength: 800 },
  },
};
/** Indexes reference the actual submitted draft, never hypothetical rows in a
 * JSON container. Invalid references should be unrepresentable at generation. */
export function boundedTaskHistoryReviewSchema(sentenceCount: number, obligationCount: number, actionCount: number) {
  const schema = structuredClone(repairableTaskHistoryReviewSchema);
  const indexes = { type: "array", maxItems: sentenceCount,
    items: { type: "integer", minimum: 0, maximum: Math.max(0, sentenceCount - 1) } };
  schema.properties.retainedSentenceIndexes = indexes;
  schema.properties.obligations.maxItems = obligationCount;
  Object.assign(schema.properties.obligations, { minItems: obligationCount });
  const fields = schema.properties.obligations.items.properties;
  fields.index.maximum = obligationCount - 1;
  fields.sentenceIndexes = structuredClone(indexes);
  fields.actionIndexes.maxItems = actionCount;
  fields.actionIndexes.items.maximum = Math.max(0, actionCount - 1);
  return schema;
}
export function parseRepairableTaskHistoryReview(value: unknown, sentenceCount: number, obligationCount: number, actionCount = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_TASK_REVIEW");
  const { rejectionReason, ...selection } = value as Record<string, unknown>;
  if (rejectionReason !== undefined && rejectionReason !== null
    && (typeof rejectionReason !== "string" || !rejectionReason.trim() || rejectionReason.length > 800)) throw new Error("INVALID_TASK_REVIEW");
  // A malformed denial still grants no approval. Its bounded feedback can guide
  // one repair; the repaired body must obtain a fully valid independent receipt.
  let parsed: HistoryReviewSelection & { obligations: TaskObligationReview[] };
  try { parsed = parseTaskHistoryReview(selection, sentenceCount, obligationCount, actionCount); }
  catch (error) {
    if (selection.approved !== false || typeof rejectionReason !== "string"
      || Object.keys(selection).sort().join() !== "approved,obligations,retainedSentenceIndexes") throw error;
    parsed = { approved: false, retainedSentenceIndexes: [], obligations: [] };
  }
  return { ...parsed, rejectionReason: !parsed.approved && typeof rejectionReason === "string" ? rejectionReason : null };
}
