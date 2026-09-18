import { MAX_HISTORY_CALCULATIONS, units, verifiedCalculationQuantities, type HistoryCalculation } from "./history-calculation.ts";
import { historyNarrativeAnchorsSupported } from "./history-narrative-facts.ts";
import type { HistoryNarrative } from "./history-narrative.ts";

/** Repair may reword a result while accidentally dropping its arithmetic proof.
 * Retain only recomputed proofs over the repaired chunk's existing citations.
 * This grants no semantic approval: the complete repair still needs review. */
export function retainRepairCalculationBindings(original: HistoryNarrative, repaired: HistoryNarrative,
  sources: Array<{sourceId: string; text: string; occurredAt?: string | null}>, requestText: string, timeZone = "UTC"): HistoryNarrative {
  return { sentences: repaired.sentences.map(sentence => {
    if (sentence.calculations?.length) return sentence;
    const cited = sources.filter(source => sentence.sourceIds.includes(source.sourceId));
    if (sentence.sourceIds.some(id => !cited.some(source => source.sourceId === id))) return sentence;
    const accepts = (derived: readonly string[]) => historyNarrativeAnchorsSupported(sentence.text, cited, requestText, derived, false, [], undefined, false, [], timeZone);
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

const measuredToken = /(?<![\p{L}\p{N}_.+−-])([+−-]?\d+(?:\.\d+)?)[ -]+([A-Za-z]+)(?![\p{L}\p{N}_])/gu;
function measurements(source: {sourceId:string;text:string}) {
  return [...source.text.matchAll(measuredToken)].flatMap(match=>{
    const unit=units[match[2].toLowerCase()];
    if(!unit || unit.dimension.startsWith('currency:') || unit.dimension==='instant')return [];
    const value=Number(match[1].replace('−','-'));
    return Number.isFinite(value)?[{sourceId:source.sourceId,literal:match[0],value,unit}]:[];
  });
}

/** A missing proof for a simple requested difference may be reconstructed only
 * from two already-cited saved measurements. This adds arithmetic provenance,
 * never a fact, subject, source, or semantic interpretation. */
export function attachDeterministicCalculationBindings(narrative: HistoryNarrative,
  sources:Array<{sourceId:string;text:string;occurredAt?:string|null}>,requestText:string):HistoryNarrative {
  if(!/\b(?:how much\s+(?:longer|shorter|more|less|heavier|lighter)|difference|change)\b/i.test(requestText))return narrative;
  return {sentences:narrative.sentences.map(sentence=>{
    if(sentence.calculations?.length)return sentence;
    const cited=sources.filter(source=>sentence.sourceIds.includes(source.sourceId)&&/^(?:care|claim):/.test(source.sourceId));
    if(cited.length!==2)return sentence;
    const [left,right]=cited.map(measurements);
    const resultTokens=[...sentence.text.matchAll(measuredToken)].flatMap(match=>{
      const unit=units[match[2].toLowerCase()];
      const value=Number(match[1].replace('−','-'));
      return unit && Number.isFinite(value)?[{value,unit}]:[];
    });
    const candidates:HistoryCalculation[]=[];
    for(const a of left) for(const b of right){
      if(a.unit.dimension!==b.unit.dimension || a.unit.canonical!==b.unit.canonical)continue;
      const rawValue=Math.abs(a.value*a.unit.scale-b.value*b.unit.scale)/a.unit.scale;
      const value=Number(rawValue.toFixed(10));
      if(!Number.isFinite(value))continue;
      const derived=resultTokens.some(token=>token.unit.canonical===a.unit.canonical
        && Math.abs(token.value-value)<1e-9);
      if(!derived)continue;
      const calculation:HistoryCalculation={operation:'absolute_difference',expression:null,
        operands:[a,b].map(item=>({sourceId:item.sourceId,field:'text',literal:item.literal})),
        value,unit:a.unit.canonical};
      if(verifiedCalculationQuantities([calculation],cited)!==null)candidates.push(calculation);
    }
    const unique=new Map(candidates.map(calculation=>[JSON.stringify(calculation),calculation]));
    if(unique.size!==1)return sentence;
    return {...sentence,calculations:[structuredClone([...unique.values()][0])]};
  })};
}
