import { parseDatedNoteBatch } from "./dated-note-batch.ts";
import type { AskOperationReceipt } from "./types.ts";

/** Completion is derived from linked records, never from prior assistant prose.
 * A deleted or changed record does not certify the original requested content. */
export function receiptCompletionText(receipt: AskOperationReceipt): string {
  const requested = parseDatedNoteBatch(receipt.requestText);
  const records = [...new Map(receipt.records.map(record => [record.id, record])).values()];
  if (!requested.length) return `This lookup found ${records.length} current care-history entries linked to that prior request.`;
  const used = new Set<string>();
  const matched = requested.filter(note => {
    const record = records.find(row => !used.has(row.id) && row.note === note.note
      && Date.parse(row.occurredAt) === Date.parse(note.occurredAt));
    if (!record) return false;
    used.add(record.id); return true;
  }).length;
  return matched === requested.length
    ? `All ${requested.length} requested notes have matching current saved records linked to that request; none is missing.`
    : `${matched} of ${requested.length} requested notes have matching current saved records linked to that request. ${requested.length - matched} requested notes could not be verified as currently saved with the requested contents and dates.`;
}
