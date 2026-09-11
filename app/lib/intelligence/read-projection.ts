import { isOwnerCertainEvidence, analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { units } from "./history-calculation.ts";
import { parseHistoryNarrative, type HistoryNarrative } from "./history-narrative.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { HistoryCalculation } from "./history-calculation.ts";
export type ReadProjection = { nameHeader: string; valueHeader: string; quantity: "body_mass"; unit: string; order: "name_ascending" | "name_descending" | "value_ascending" | "value_descending" | "scope" };
export const readProjectionSchema = { type: ["object", "null"], additionalProperties: false,
  required: ["nameHeader", "valueHeader", "quantity", "unit", "order"], properties: {
    nameHeader: { type:"string",minLength:1,maxLength:80 }, valueHeader: { type:"string",minLength:1,maxLength:80 },
    quantity: { type:"string",enum:["body_mass"] }, unit: { type:"string",enum:["kg","g","mg","lb"] },
    order: { type:"string",enum:["name_ascending","name_descending","value_ascending","value_descending","scope"] },
  } };
export function parseReadProjection(value: unknown): ReadProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string,unknown>;
  if (Object.keys(p).sort().join() !== readProjectionSchema.required.slice().sort().join()
    || p.quantity !== "body_mass" || !["kg","g","mg","lb"].includes(String(p.unit))
    || !readProjectionSchema.properties.order.enum.includes(String(p.order))
    || [p.nameHeader,p.valueHeader].some(v=>typeof v!=="string"||!v.trim()||v.length>80||/[|\r\n]/.test(v))) return null;
  return { ...p } as ReadProjection;
}
/** Domain measurement reader, not a query matcher. Ambiguous, corrected,
 * equipment-inclusive or multiple measurements are left to semantic generation.
 * This produces a draft: independent review must still verify task semantics. */
function bodyMeasurement(text: string) {
  const matches = [...text.matchAll(/\b(?:body (?:weight|mass) (?:was|is)|weighed)\s+(-?\d+(?:\.\d+)?)\s+(kg|kilograms?|g|grams?|lb|lbs|pounds?)\b/gi)];
  if (matches.length !== 1 || !isOwnerCertainEvidence(text, matches[0][0])
    || analyzeOwnerAssertions(text).clauseSpans.some(clause => clause.text.includes(matches[0][0]) && clause.isNegated)
    || /\b(?:estimated|approximately)\b/i.test(text) || /\b(?:correction|corrected|carrier|harness|equipment|parcel)\b/i.test(text)
    && !/\b(?:without equipment|no carrier or harness included)\b/i.test(text)) return null;
  const m = matches[0], unit = units[m[2].toLowerCase()], value=Number(m[1]);
  if (!unit || !Number.isFinite(value) || value<=0) return null;
  return { value, unit, literal: m[1]+" "+m[2] };
}
const csv = (cell: string) => /[",\r\n]/.test(cell) ? '"' + cell.replaceAll('"','""') + '"' : cell;
export function deterministicReadProjection(evidence: AskEvidenceContract): HistoryNarrative | null {
  const request = evidence.interpretation?.request, projection = request?.projection;
  if (!projection || !["table","csv"].includes(request.outputFormat || "") || !evidence.history
    || evidence.scope.status !== "resolved" || !evidence.scope.readOnlyRecall || evidence.scope.requestKind === "count"
    || evidence.history.corrections === "unavailable" || evidence.episodes) return null;
  const window=evidence.interpretation?.history;
  // A narrow date avoids silently treating a bounded sample as "latest ever".
  if (!window?.from || !window.to || Date.parse(window.to)-Date.parse(window.from)!==86400000) return null;
  if (Date.parse(window.from)>Date.now()) return null;
  const rows: Array<{ name:string; value:number; sourceId:string; calculation:HistoryCalculation }>=[];
  for(const petId of evidence.scope.authorizedPetIds) {
    const sources=evidence.represented.filter(s=>s.petId===petId && s.sourceType==="care_update"
      && s.start===0 && s.end===s.text.length && !!s.occurredAt && Date.parse(s.occurredAt)>=Date.parse(window.from!) && Date.parse(s.occurredAt)<Date.parse(window.to!)
      && !evidence.losses.some(l=>l.sourceId===s.sourceId)
      && evidence.sources.some(group=>group.petId===petId && group.status!=="unavailable" && group.status!=="not_loaded" && group.loadedIds.includes(s.sourceId))
      && !evidence.history!.provenance.some(p=>p.sourceId===s.sourceId && !["effective_linked","effective_replacement","unverified_legacy"].includes(p.status)));
    const measurements=sources.flatMap(s=>{const m=bodyMeasurement(s.text);return m?[{source:s,measurement:m}]:[];});
    if(measurements.length!==1) return null;
    const {source,measurement}=measurements[0],name=evidence.petNames?.[petId],target=units[projection.unit];
    if(!name || request.outputFormat === "table" && /[|\r\n]/.test(name) || !target || target.dimension!==measurement.unit.dimension) return null;
    const value=Number((measurement.value*measurement.unit.scale/target.scale).toFixed(8));
    rows.push({name,value,sourceId:source.sourceId,calculation:{operation:"convert",operands:[{sourceId:source.sourceId,field:"text",literal:measurement.literal}],value,unit:projection.unit}});
  }
  if(!rows.length) return null;
  const compareNames=(a:string,b:string)=>a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:0;
  if(projection.order!=="scope") rows.sort((a,b)=>projection.order.startsWith("name")
    ? compareNames(a.name,b.name)*(projection.order==="name_descending"?-1:1)
    : (a.value-b.value)*(projection.order==="value_descending"?-1:1)||compareNames(a.name,b.name));
  const cells=[[projection.nameHeader,projection.valueHeader],...rows.map(r=>[r.name,String(r.value)])];
  const text=request.outputFormat==="csv"?cells.map(row=>row.map(csv).join(",")).join("\n")
    : [cells[0],["---","---"],...cells.slice(1)].map(row=>"| "+row.join(" | ")+" |").join("\n");
  return parseHistoryNarrative({sentences:[{text,sourceIds:rows.map(r=>r.sourceId),calculations:rows.map(r=>r.calculation)}]})||null;
}
