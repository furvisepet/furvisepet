import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { FurviseLiveContext } from "./types.ts";

export type WeightComparisonEvidence = { petId: string; measurements: Array<{ sourceId: string; text: string; at: string; grams: number }> };
/** An attributed comparison of a retrieved subset, never certified lifetime
 * endpoints. Unsupported, qualified or mixed-unit notes are not discarded to
 * manufacture an apparently complete extraction. */
export function buildWeightComparison(context: FurviseLiveContext, contract: AskEvidenceContract): WeightComparisonEvidence | undefined {
  if (!context.askHistory || contract.scope.requestKind !== "comparison" || contract.scope.authorizedPetIds.length !== 1
    || !/\bweight\b/i.test(context.currentMessage)
    || !(/\bearliest\b/i.test(context.currentMessage) && /\blatest\b/i.test(context.currentMessage)
      || /\b(?:change|difference)\b/i.test(context.currentMessage))) return undefined;
  const petId = contract.scope.authorizedPetIds[0];
  const pet = context.eligiblePets.find(p => p.id === petId && p.user_id === context.owner.userId);
  if (!pet?.name) return undefined;
  const escaped = pet.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^(?:Note: )?${escaped} weighed ([0-9]{1,6})(?:\\.([0-9]{1,3}))? kg(?: today)?\\.(?:\\s|$)`, "i");
  const rows = context.askHistory.entries.filter(row => row.pet_profile_id === petId && /\bweigh\w*\b/i.test(`${row.title || ""} ${row.note}`));
  if (rows.length < 2 || rows.length > 32) return undefined;
  const measurements: WeightComparisonEvidence["measurements"] = [];
  for (const row of rows) {
    const match = pattern.exec(row.note);
    const at = Date.parse(row.occurred_at);
    const remainder = match ? row.note.slice(match[0].length) : "";
    if (!match || /\b(?:weigh\w*|kg|lb|correct\w*|retract\w*|uncertain|estimated)\b/i.test(remainder)
      || row.user_id !== context.owner.userId || row.deleted_at || !Number.isFinite(at) || at > Date.now()
      || new Date(at).toISOString().slice(0,10) !== row.occurred_at.slice(0,10)
      || row.title && !/^(?:weight(?: measurement)?|note)$/i.test(row.title)) return undefined;
    const grams = Number(match[1])*1000 + Number((match[2] || "").padEnd(3,"0"));
    if (!Number.isSafeInteger(grams) || grams <= 0) return undefined;
    measurements.push({ sourceId: `care:${row.id}`, text: row.note, at: row.occurred_at, grams });
  }
  return { petId, measurements };
}

export function weightComparisonAnswer(contract: AskEvidenceContract): string | null {
  const evidence = contract.weightComparison;
  if (!evidence || contract.scope.requestKind !== "comparison" || contract.scope.authorizedPetIds.length !== 1
    || contract.scope.authorizedPetIds[0] !== evidence.petId || evidence.measurements.length < 2) return null;
  const source = contract.sources.find(s => s.petId === evidence.petId && s.source === "care_entries");
  if (!source || source.status !== "loaded") return null;
  const times = new Map<number,number>();
  for (const measurement of evidence.measurements) {
    const spans = contract.represented.filter(s => s.petId === evidence.petId && s.sourceId === measurement.sourceId && s.sourceType === "care_update");
    const span = spans[0];
    const number = / weighed ([0-9]{1,6})(?:\.([0-9]{1,3}))? kg(?: today)?\.(?:\s|$)/i.exec(measurement.text);
    const parsedGrams = number ? Number(number[1])*1000 + Number((number[2] || "").padEnd(3,"0")) : NaN;
    if (spans.length !== 1 || !(span.text === measurement.text || span.text === "Note: " + measurement.text) || span.occurredAt !== measurement.at
      || parsedGrams !== measurement.grams || !Number.isSafeInteger(parsedGrams) || parsedGrams <= 0
      || span.start !== 0 || span.end !== span.text.length
      || !source.loadedIds.includes(measurement.sourceId) || contract.losses.some(loss => loss.sourceId === measurement.sourceId)
      || !contract.history?.provenance.some(p => p.sourceId === measurement.sourceId && ["effective_linked","unverified_legacy"].includes(p.status))) return null;
    const time = Date.parse(measurement.at);
    if (times.has(time) && times.get(time) !== measurement.grams) return null;
    times.set(time,measurement.grams);
  }
  const ordered = [...evidence.measurements].sort((a,b) => Date.parse(a.at)-Date.parse(b.at));
  const first = ordered[0], last = ordered[ordered.length-1];
  if (Date.parse(first.at) === Date.parse(last.at)) return null;
  const difference = last.grams-first.grams;
  const change = difference === 0 ? "no change" : `${Math.abs(difference)/1000} kg ${difference > 0 ? "higher" : "lower"}`;
  return `Among the retrieved weight notes, the earliest reports ${first.grams/1000} kg (${first.at.slice(0,10)}) and the latest reports ${last.grams/1000} kg (${last.at.slice(0,10)}): ${change}. This compares those retrieved reports only. I can't verify that they are the lifetime endpoints or that all corrections have been found.`;
}
