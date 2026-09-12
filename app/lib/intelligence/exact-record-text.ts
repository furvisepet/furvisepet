import type { AskEvidenceContract } from './ask-evidence.ts';
import { eligibleAnswerSources } from './ask-evidence.ts';
/** Full-record quotations are a lossless output obligation, not substring
 * paraphrases. Scope selection stays with retrieval and independent review. */
export function missingExactRecordText(evidence: AskEvidenceContract, text: string, citedIds: readonly string[]) {
  const question=evidence.scope.requestText;
  if (!/\b(?:exact (?:text|note|wording)|verbatim|wording exactly|(?:text|note|notes) exactly)\b/i.test(question)
    || /\b(?:excerpt|substring|one sentence|a sentence|short quote)\b/i.test(question)) return [];
  return eligibleAnswerSources(evidence).flatMap(source=>{
    if (!citedIds.includes(source.sourceId)) return [];
    const receipt=(evidence.operationReceipts || []).flatMap(r=>r.records.map(record=>({id:`operation:${r.sourceMessageId}:record:${record.id}`,note:record.note})))
      .find(record=>record.id===source.sourceId);
    const note=receipt?.note || (source.sourceType==='care_update' && source.sourceId.startsWith('care:') ? source.text : null);
    if (!note) return [];
    // Check literal content after the appropriate JSON/CSV escaping as well.
    return [note,JSON.stringify(note).slice(1,-1),note.replaceAll('"','""')].some(value=>text.includes(value))
      ? [] : [{sourceId:source.sourceId,note}];
  });
}
