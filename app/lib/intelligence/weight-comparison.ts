import { requestedWeightMonths } from "./requested-weight-months.ts";
import { presentReviewedHistory } from "./history-presentation.ts";
import { recordedWeightGrams } from "./recorded-weight.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { FurviseLiveContext } from "./types.ts";

export type WeightComparisonEvidence = { petId: string; measurements: Array<{ sourceId: string; text: string; at: string; grams: number }> };
/** An attributed comparison of a retrieved subset, never certified lifetime
 * endpoints. Unsupported, qualified or mixed-unit notes are not discarded to
 * manufacture an apparently complete extraction. */
export function buildWeightComparison(context: FurviseLiveContext, contract: AskEvidenceContract): WeightComparisonEvidence | undefined {
  if (!context.askHistory || !["comparison", "record_lookup"].includes(contract.scope.requestKind) || contract.scope.authorizedPetIds.length !== 1
    || !/\bweigh(?:t|ts|ed|s|ing)?\b/i.test(context.currentMessage)
    || !(/\b(?:earliest|first)\b/i.test(context.currentMessage) && /\b(?:latest|last)\b/i.test(context.currentMessage)
      || /\b(?:change|difference|table|bullets?)\b/i.test(context.currentMessage))) return undefined;
  const petId = contract.scope.authorizedPetIds[0];
  const pet = context.eligiblePets.find(p => p.id === petId && p.user_id === context.owner.userId);
  if (!pet?.name) return undefined;
  const months = requestedWeightMonths(context.currentMessage, new Date().getUTCFullYear());
  const rows = context.askHistory.entries.filter(row => row.pet_profile_id === petId && /\bweigh\w*\b/i.test(`${row.title || ""} ${row.note}`)
    && (!months || months.includes(row.occurred_at.slice(0,7))));
  if (months && !months.every(month => rows.some(row => row.occurred_at.startsWith(month)))) return undefined;
  if (rows.length < 2 || rows.length > 32) return undefined;
  const measurements: WeightComparisonEvidence["measurements"] = [];
  for (const row of rows) {
    const grams = recordedWeightGrams(row.note, pet.name);
    const at = Date.parse(row.occurred_at);
    if (grams === null
      || row.user_id !== context.owner.userId || row.deleted_at || !Number.isFinite(at) || at > Date.now()
      || new Date(at).toISOString().slice(0,10) !== row.occurred_at.slice(0,10)
      || row.title && !/^(?:weight(?: measurement)?|note)$/i.test(row.title)) return undefined;
    measurements.push({ sourceId: `care:${row.id}`, text: row.note, at: row.occurred_at, grams });
  }
  if (/\b(?:earliest|first)\b/i.test(context.currentMessage) && /\b(?:latest|last)\b/i.test(context.currentMessage)) {
    const times = measurements.map(value => Date.parse(value.at));
    const first = Math.min(...times), last = Math.max(...times);
    // Keep every tied endpoint so conflicting values still fail validation.
    return { petId, measurements: measurements.filter(value => [first, last].includes(Date.parse(value.at))) };
  }
  return { petId, measurements };
}

export function weightComparisonAnswer(contract: AskEvidenceContract): string | null {
  const evidence = contract.weightComparison;
  if (!evidence || !["comparison", "record_lookup"].includes(contract.scope.requestKind) || contract.scope.authorizedPetIds.length !== 1
    || contract.scope.authorizedPetIds[0] !== evidence.petId || evidence.measurements.length < 2) return null;
  const source = contract.sources.find(s => s.petId === evidence.petId && s.source === "care_entries");
  if (!source || source.status !== "loaded" || contract.history?.retrieval === "unavailable"
    || contract.history?.corrections === "unavailable" || contract.history?.reasons.includes("source_deleted_or_changed")) return null;
  const times = new Map<number,number>();
  for (const measurement of evidence.measurements) {
    const spans = contract.represented.filter(s => s.petId === evidence.petId && s.sourceId === measurement.sourceId && s.sourceType === "care_update");
    const span = spans[0];
    const petName = contract.petNames?.[evidence.petId];
    const parsedGrams = petName ? recordedWeightGrams(measurement.text, petName) : null;
    if (spans.length !== 1 || !(span.text === measurement.text || span.text === "Note: " + measurement.text) || span.occurredAt !== measurement.at
      || parsedGrams !== measurement.grams || parsedGrams === null || !Number.isSafeInteger(parsedGrams) || parsedGrams <= 0
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
  contract.answerSourceIds = ordered.map(measurement => measurement.sourceId);
  if (/\bbullet(?:s| points?)?\b/i.test(contract.scope.requestText)) {
    return presentReviewedHistory(ordered.map(m => `${m.at.slice(0,10)}: ${m.grams/1000} kg.`), contract.scope.requestText)
      + "\n\nThese are the retrieved weight reports, not a complete lifetime history.";
  }
  if (/\btable\b/i.test(contract.scope.requestText)) {
    return ['| Date | Weight |', '| --- | --- |', ...ordered.map(m => `| ${m.at.slice(0,10)} | ${m.grams/1000} kg |`)].join("\n")
      + `\n\nAmong these retrieved measurements, the latest weight shows ${change} compared with the earliest.`;
  }
  return `Among the retrieved weight notes, the earliest reports ${first.grams/1000} kg (${first.at.slice(0,10)}) and the latest reports ${last.grams/1000} kg (${last.at.slice(0,10)}): ${change}. This compares those retrieved reports only. I can't verify that they are the lifetime endpoints or that all corrections have been found.`;
}
