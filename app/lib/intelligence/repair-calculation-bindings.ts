import { MAX_HISTORY_CALCULATIONS, verifiedCalculationQuantities } from "./history-calculation.ts";
import { historyNarrativeAnchorsSupported } from "./history-narrative-facts.ts";
import type { HistoryNarrative } from "./history-narrative.ts";

/** Repair may reword a result while accidentally dropping its arithmetic proof.
 * Retain only recomputed proofs over the repaired chunk's existing citations.
 * This grants no semantic approval: the complete repair still needs review. */
export function retainRepairCalculationBindings(original: HistoryNarrative, repaired: HistoryNarrative,
  sources: Array<{sourceId: string; text: string; occurredAt?: string | null}>, requestText: string): HistoryNarrative {
  return { sentences: repaired.sentences.map(sentence => {
    if (sentence.calculations?.length) return sentence;
    const cited = sources.filter(source => sentence.sourceIds.includes(source.sourceId));
    if (sentence.sourceIds.some(id => !cited.some(source => source.sourceId === id))) return sentence;
    const accepts = (derived: readonly string[]) => historyNarrativeAnchorsSupported(sentence.text, cited, requestText, derived, false);
    if (accepts([])) return sentence;
    const seen = new Set<string>();
    const calculations = original.sentences.flatMap(chunk => chunk.calculations || []).filter(calculation => {
      const key = JSON.stringify(calculation);
      if (seen.has(key) || verifiedCalculationQuantities([calculation], cited) === null) return false;
      seen.add(key); return true;
    }).slice(0, MAX_HISTORY_CALCULATIONS);
    const derived = verifiedCalculationQuantities(calculations, cited);
    if (!calculations.length || !derived || !accepts(derived)) return sentence;
    return { ...sentence, calculations: structuredClone(calculations) };
  }) };
}
