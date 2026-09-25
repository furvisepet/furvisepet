import type { FurviseApplicationAction } from "../application-actions/types.ts";
import type { AskOperationReceipt } from "./types.ts";

/** Completion is derived from linked records, never from prior assistant prose.
 * A deleted or changed record does not certify the original requested content. */
export function receiptCompletionText(receipt: AskOperationReceipt): string {
  const requested = receipt.requestedItems || [];
  const records = [...new Map(receipt.records.map(record => [record.id, record])).values()];
  if (!requested.length) return `This lookup found ${records.length} current care-history ${records.length === 1 ? "entry" : "entries"} linked to that prior request.`;
  const used = new Set<string>();
  const matched = requested.filter(note => {
    const record = records.find(row => !used.has(row.id) && row.note === note.body
      && row.petId === note.petId && row.sourceMessageId === note.sourceMessageId && row.sourceSpanId === note.sourceSpanId
      && (note.occurredAt === null || Date.parse(row.occurredAt) === Date.parse(note.occurredAt)));
    if (!record) return false;
    used.add(record.id); return true;
  }).length;
  return matched === requested.length
    ? `All ${requested.length} requested notes have matching current saved records linked to that request; none is missing.`
    : `${matched} of ${requested.length} requested notes have matching current saved records linked to that request. ${requested.length - matched} requested notes could not be verified as currently saved with the requested contents and dates.`;
}

/** Only immutable owner-scoped capabilities supply requested obligations on reload. */
export function requestedAppendItems(actions: readonly FurviseApplicationAction[], sourceMessageId: string, petId: string) {
  const jobs = actions.filter(action => action.kind === "care_history.add" && action.sourceMessageId === sourceMessageId
    && action.petId === petId && action.appendJob?.sourceMessageId === sourceMessageId && action.appendJob.petId === petId);
  // Conflicting capabilities cannot define a coherent operation receipt.
  if (jobs.length !== 1) return undefined;
  return jobs[0].appendJob!.items.map(item => ({ sourceSpanId: item.body.id, body: item.body.text,
    occurredAt: item.occurredAt, sourceMessageId, petId }));
}
